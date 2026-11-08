import type { PrismaClient } from "@/generated/prisma";
import type { CaseDraft } from "./case-input";
import { latestCreditReport, legalProfileStatus } from "./external-data";
import { facilityStatus } from "./facilities";
import { loadPurposes } from "./financial-statements";
import { today } from "./rating-scale";
import { loadSettings } from "./settings";
import { parseAmount } from "@/financials/chart";
import { checklist, missingItems, requiredFor, type ChecklistItem } from "@/reference/required-docs";

/**
 * Préparation d'un dossier : pièces et informations requises par son motif,
 * avec leur état (fourni, manquant, périmé). Partagé par l'écran du dossier et
 * le contrôle à la soumission.
 */
export async function caseChecklist(
  db: PrismaClient,
  c: { id: string; counterpartyId: string; purpose: string | null },
  draft: Pick<CaseDraft, "financials">
): Promise<{ purposeLabel: string | null; items: ChecklistItem[]; missing: ChecklistItem[] }> {
  const [purposes, cp, docs, report, fac] = await Promise.all([
    loadPurposes(db),
    db.counterparty.findUnique({ where: { id: c.counterpartyId }, select: { id: true, name: true, ice: true, rc: true, legalForm: true, legalProfile: true } }),
    db.caseDocument.findMany({ where: { caseId: c.id }, select: { kind: true, fileName: true } }),
    latestCreditReport(db, c.counterpartyId),
    facilityStatus(db, c.counterpartyId),

  ]);
  const purpose = purposes.find((p) => p.code === c.purpose) ?? (c.purpose ? { code: c.purpose, labelFr: c.purpose, active: true } : null);
  const legal = cp ? await legalProfileStatus(db, cp) : null;
  const t = today();
  const items = checklist(requiredFor(purpose), {
    financialYears: (draft.financials?.years ?? []).filter((y) => Object.values(y.values ?? {}).some((v) => parseAmount(v) !== undefined)).length,
    creditReport: report ? { reportDate: report.reportDate, stale: report.freshness.stale } : null,
    facilities: {
      lines: fac.lines.length,
      positionDate: fac.positionDate,
      stale: !!fac.positionDate && Math.round((Date.parse(t + "T00:00:00Z") - Date.parse(fac.positionDate + "T00:00:00Z")) / 86_400_000) > 31,
    },
    legalProfile: legal ? { reportDate: legal.profile.reportDate, stale: legal.analysis.stale || !legal.profile.reportDate } : null,
    documents: docs,
  });

  return { purposeLabel: purpose?.labelFr ?? null, items, missing: missingItems(items) };
}

/** Contrôle à la soumission selon le paramétrage (avertissement tracé, blocage ou aucun). */
export async function docsGate(db: PrismaClient, c: { id: string; counterpartyId: string; purpose: string | null }, draft: Pick<CaseDraft, "financials">) {
  const mode = ((await loadSettings()).DOCS_AT_SUBMISSION ?? "AVERTISSEMENT") as "AVERTISSEMENT" | "BLOQUANT" | "AUCUN";
  if (mode === "AUCUN") return { mode, missing: [] as ChecklistItem[] };
  const { missing } = await caseChecklist(db, c, draft);
  return { mode, missing };
}
