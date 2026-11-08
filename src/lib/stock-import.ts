import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { loadWatchlistLevels } from "./classification-store";
import { canWrite, entityCurrency, loadTree, type Perimeter } from "./scope";
import { groupBilans, type ParsedWorkbook, type RowError, type StockSheet } from "@/reference/stock-import";

/**
 * Reprise du stock : rapprochement du classeur avec la base et écriture.
 *
 * Contrôle à blanc d'abord (rien n'est écrit), puis import sur confirmation.
 * Jamais d'écrasement : un client existant n'est pas modifié, une note déjà
 * reprise (même client, même date d'arrêté) est ignorée, un bilan déjà présent
 * pour la date de clôture est conservé, un client ayant déjà un historique de
 * watch list n'en reçoit pas d'autre. Les notes reprises font foi (origine
 * REPRISE) : elles alimentent la surveillance et les matrices de migration.
 */

export interface SheetReport {
  created: number;
  skipped: number;
  rejected: number;
  notesFr: string[];
}

export interface ImportReport {
  dryRun: boolean;
  sheets: Partial<Record<StockSheet, SheetReport>>;
  errors: RowError[];
}

const empty = (): SheetReport => ({ created: 0, skipped: 0, rejected: 0, notesFr: [] });

export async function runStockImport(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  wb: ParsedWorkbook,
  opts: { dryRun: boolean; fileName: string; sha256: string }
): Promise<ImportReport> {
  const errors: RowError[] = [...wb.errors];
  const sheets: ImportReport["sheets"] = {};
  for (const s of wb.sheets) sheets[s] = empty();
  for (const e of wb.errors) if (sheets[e.sheet]) sheets[e.sheet]!.rejected++;
  const tree = await loadTree();

  // --- Clients -------------------------------------------------------------------
  const byKey = new Map<string, string>(); // code T24 ou ICE → id (existant ou « nouveau »)
  const existing = await db.counterparty.findMany({
    where: { OR: [{ coreBankingId: { not: null } }, { ice: { not: null } }] },
    select: { id: true, coreBankingId: true, ice: true, entityId: true },
  });
  for (const c of existing) {
    if (c.coreBankingId) byKey.set(c.coreBankingId, c.id);
    if (c.ice) byKey.set(c.ice, c.id);
  }
  const toCreate: Array<{ line: number; data: Record<string, unknown> }> = [];
  for (const r of wb.clients) {
    const v = r.value;
    const rep = sheets.CLIENTS!;
    const known = (v.code && byKey.get(v.code)) || (v.ice && byKey.get(v.ice));
    if (known) {
      rep.skipped++;
      continue;
    }
    const entity = tree.find((e) => e.code.toUpperCase() === v.entity && e.isActive);
    if (!entity || !canWrite(perimeter, entity.id)) {
      errors.push({ sheet: "CLIENTS", line: r.line, messageFr: `Entité « ${v.entity} » inconnue ou hors de votre périmètre d'écriture.` });
      rep.rejected++;
      continue;
    }
    const id = `new:${r.line}`;
    if (v.code) byKey.set(v.code, id);
    if (v.ice) byKey.set(v.ice, id);
    toCreate.push({
      line: r.line,
      data: {
        name: v.name,
        entityId: entity.id,
        coreBankingId: v.code,
        ice: v.ice,
        rc: v.rc,
        legalForm: v.legalForm,
        sectorCode: v.sectorCode,
        commercialSegment: v.commercialSegment,
        accountOfficer: v.accountOfficer,
        country: v.country ?? entity.country ?? null,
        currency: v.currency ?? entityCurrency(tree, entity.id),
        dataSource: "SAISIE",
      },
    });
    rep.created++;
  }

  const resolve = (sheet: StockSheet, line: number, client: string): string | null => {
    const id = byKey.get(client);
    if (!id) errors.push({ sheet, line, messageFr: `Client « ${client} » introuvable (ni dans la base, ni dans la feuille Clients).` });
    return id ?? null;
  };

  // --- Notes ------------------------------------------------------------------------
  const notes: Array<{ cp: string; v: (typeof wb.notes)[number]["value"]; line: number }> = [];
  if (wb.notes.length) {
    const ids = [...new Set(wb.notes.map((n) => byKey.get(n.value.client)).filter((x): x is string => !!x && !x.startsWith("new:")))];
    const already = new Set(
      (await db.ratingRun.findMany({ where: { counterpartyId: { in: ids }, origin: "REPRISE" }, select: { counterpartyId: true, asOfDate: true } })).map((r) => `${r.counterpartyId}|${r.asOfDate}`)
    );
    for (const n of wb.notes) {
      const cp = resolve("NOTES", n.line, n.value.client);
      if (!cp) {
        sheets.NOTES!.rejected++;
        continue;
      }
      if (already.has(`${cp}|${n.value.asOfDate}`)) {
        sheets.NOTES!.skipped++;
        continue;
      }
      notes.push({ cp, v: n.value, line: n.line });
      sheets.NOTES!.created++;
    }
  }

  // --- Bilans ------------------------------------------------------------------------
  const bilans: Array<{ cp: string; g: ReturnType<typeof groupBilans>[number] }> = [];
  if (wb.bilans.length) {
    const groups = groupBilans(wb.bilans);
    const ids = [...new Set(groups.map((g) => byKey.get(g.client)).filter((x): x is string => !!x && !x.startsWith("new:")))];
    const already = new Set((await db.financialStatement.findMany({ where: { counterpartyId: { in: ids } }, select: { counterpartyId: true, closingDate: true } })).map((s) => `${s.counterpartyId}|${s.closingDate}`));
    for (const g of groups) {
      const cp = resolve("BILANS", g.lines[0], g.client);
      if (!cp) {
        sheets.BILANS!.rejected += g.lines.length;
        continue;
      }
      if (already.has(`${cp}|${g.closingDate}`)) {
        sheets.BILANS!.skipped++;
        sheets.BILANS!.notesFr.push(`Bilan au ${g.closingDate} de « ${g.client} » déjà présent : conservé.`);
        continue;
      }
      bilans.push({ cp, g });
      sheets.BILANS!.created++;
    }
  }

  // --- Watch list ---------------------------------------------------------------------
  const wl: Array<{ cp: string; v: (typeof wb.watchlist)[number]["value"] }> = [];
  if (wb.watchlist.length) {
    const levels = (await loadWatchlistLevels(db)).filter((l) => l.active);
    const ids = [...new Set(wb.watchlist.map((w) => byKey.get(w.value.client)).filter((x): x is string => !!x && !x.startsWith("new:")))];
    const withHistory = new Set((await db.committeeDecision.findMany({ where: { counterpartyId: { in: ids }, kind: { in: ["WL_ENTREE", "WL_SORTIE"] } }, distinct: ["counterpartyId"], select: { counterpartyId: true } })).map((d) => d.counterpartyId));
    const perClient = new Map<string, number>();
    for (const w of wb.watchlist) {
      const cp = resolve("WATCHLIST", w.line, w.value.client);
      if (!cp) {
        sheets.WATCHLIST!.rejected++;
        continue;
      }
      if (w.value.level && !levels.some((l) => l.code === w.value.level)) {
        errors.push({ sheet: "WATCHLIST", line: w.line, messageFr: `Niveau « ${w.value.level} » inconnu (niveaux actifs : ${levels.map((l) => l.code).join(", ")}).` });
        sheets.WATCHLIST!.rejected++;
        continue;
      }
      if (withHistory.has(cp)) {
        sheets.WATCHLIST!.skipped++;
        continue;
      }
      perClient.set(cp, (perClient.get(cp) ?? 0) + 1);
      wl.push({ cp, v: { ...w.value, level: w.value.level ?? levels[0]?.code ?? null } });
      sheets.WATCHLIST!.created++;
    }
    // Périodes d'un même client : sans chevauchement, dans l'ordre.
    for (const [cp, n] of perClient) {
      if (n < 2) continue;
      const list = wl.filter((x) => x.cp === cp).sort((a, b) => a.v.entryDate.localeCompare(b.v.entryDate));
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1].v;
        if (!prev.exitDate || prev.exitDate > list[i].v.entryDate) {
          errors.push({ sheet: "WATCHLIST", line: 0, messageFr: `Client « ${list[i].v.client} » : périodes de watch list qui se chevauchent (entrée du ${list[i].v.entryDate}).` });
          for (const x of list) wl.splice(wl.indexOf(x), 1);
          sheets.WATCHLIST!.created -= list.length;
          sheets.WATCHLIST!.rejected += list.length;
          break;
        }
      }
    }
  }

  const report: ImportReport = { dryRun: opts.dryRun, sheets, errors: errors.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.line - b.line) };
  if (opts.dryRun) return report;

  // --- Écriture -----------------------------------------------------------------------------
  await db.$transaction(
    async (tx) => {
      const realId = new Map<string, string>();
      for (const c of toCreate) {
        const row = await tx.counterparty.create({ data: c.data as never });
        realId.set(`new:${c.line}`, row.id);
      }
      const idOf = (k: string) => (k.startsWith("new:") ? realId.get(k)! : k);
      for (const n of notes) {
        const cp = idOf(n.cp);
        const isDef = n.v.grade.startsWith("DEF");
        await tx.ratingRun.create({
          data: {
            counterpartyId: cp,
            modelId: "REPRISE_STOCK",
            modelVersion: n.v.originalModel ?? "historique",
            engineVersion: "reprise",
            asOfDate: n.v.asOfDate,
            segment: n.v.segment,
            outcome: isDef ? "DEFAULTED" : "RATED",
            engineGrade: n.v.grade,
            cappedGrade: n.v.grade,
            finalGrade: n.v.grade,
            inputSnapshot: JSON.stringify({
              source: "REPRISE_STOCK",
              noteOrigine: n.v.originalGrade,
              modeleOrigine: n.v.originalModel,
              commentaire: n.v.comment,
              fichier: opts.fileName,
              segmentationData: n.v.exposure !== null ? { globalBankExposure: n.v.exposure } : {},
            }),
            resultSnapshot: JSON.stringify({ source: "REPRISE_STOCK" }),
            requestedBy: identity.name,
            origin: "REPRISE",
            idempotencyKey: `reprise:${cp}:${n.v.asOfDate}`,
            createdAt: new Date(`${n.v.validatedOn}T12:00:00Z`),
          },
        });
      }
      for (const b of bilans) {
        await tx.financialStatement.create({
          data: {
            counterpartyId: idOf(b.cp),
            fiscalYear: b.g.fiscalYear,
            closingDate: b.g.closingDate,
            values: JSON.stringify(Object.fromEntries(Object.entries(b.g.values).map(([k, v]) => [k, String(v)]))),
            source: "REPRISE_STOCK",
            createdBy: identity.name,
          },
        });
      }
      for (const w of wl.sort((a, b) => a.v.entryDate.localeCompare(b.v.entryDate))) {
        const base = {
          counterpartyId: idOf(w.cp),
          committeeDate: w.v.entryDate,
          reference: w.v.reference ?? "Reprise du stock",
          motif: w.v.motif ?? "Reprise de l'historique de watch list",
          status: "EFFECTIVE",
          recordedBy: identity.name,
          recordedFunction: "REPRISE_STOCK",
        };
        await tx.committeeDecision.create({ data: { ...base, kind: "WL_ENTREE", level: w.v.level, effectiveDate: w.v.entryDate } });
        if (w.v.exitDate) await tx.committeeDecision.create({ data: { ...base, committeeDate: w.v.exitDate, kind: "WL_SORTIE", effectiveDate: w.v.exitDate } });
      }
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "STOCK_IMPORTED",
        resourceType: "Import",
        resourceId: opts.sha256.slice(0, 32),
        entityId: perimeter.entityId,
        detail: {
          fichier: opts.fileName,
          sha256: opts.sha256,
          clients: toCreate.length,
          notes: notes.length,
          bilans: bilans.length,
          watchlist: wl.length,
          rejets: errors.length,
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  return report;
}
