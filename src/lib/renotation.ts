import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma";
import { gradeRank } from "@/core/grades";
import type { ModelConfig, RatingInput, RatingResult } from "@/core/types";
import { getModel, listModels } from "@/models";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { applyField, normalizeProposal, parseDraft, proposableFields, type CaseDraft, type ProposableField } from "./case-input";
import { buildInput, CaseError, OFFICIAL_RUN_WHERE } from "./cases";
import { prisma as basePrisma } from "./prisma";
import { executeRatingRun, RatingServiceError } from "./rating-service";
import { ratingRequestSchema } from "./schemas";
import { computePerimeter, descendants, loadTree, PERIMETER_ALL, scopedPrisma, type Perimeter } from "./scope";

/**
 * Renotation par lot du portefeuille.
 *
 * Un lot relance, pour chaque contrepartie sélectionnée, la saisie de sa
 * dernière notation VALIDÉE, à une nouvelle date d'arrêté et avec la version
 * courante du modèle, après application des données rafraîchies (fichier de
 * mise à jour : comportement bancaire, impayés, montants…).
 *
 * Règles :
 *  - la notation produite est une notation de SURVEILLANCE (origine BATCH) :
 *    elle ne fait jamais foi seule ; la note officielle reste la dernière
 *    notation validée (OFFICIAL_RUN_WHERE) ;
 *  - une migration d'au moins N crans, une absence de note ou un défaut ouvre
 *    un dossier pré-rempli à instruire, qui suit le workflow normal (saisie,
 *    soumission, validation par une autre personne) ;
 *  - une contrepartie sans notation validée réutilisable (nouvelle relation,
 *    notation antérieure au workflow) est écartée avec son motif : on ne
 *    fabrique pas de saisie ;
 *  - le traitement est découpé en tranches et reprenable : chaque contrepartie
 *    est réclamée avant d'être traitée, et la clé d'idempotence du run empêche
 *    une double notation si une tranche est rejouée après une interruption ;
 *  - tout passe par le client cloisonné du périmètre de la personne qui a lancé
 *    le lot ou programmé la planification.
 */

export class RenotationError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// --- Sélection et options ------------------------------------------------------

export const renotationFiltersSchema = z
  .object({
    /** Entité et sa descendance (dans le périmètre d'écriture). */
    entityId: z.string().min(1).max(64).optional(),
    economicGroupId: z.string().min(1).max(64).optional(),
    segment: z.enum(["TPE", "PME", "GE"]).optional(),
    /** Préfixe du code secteur (« C10 » couvre C10.1, C10.71…). */
    sectorPrefix: z.string().trim().min(1).max(30).optional(),
    /** Seulement les notes validées depuis plus de N mois. */
    validatedBeforeMonths: z.number().int().min(1).max(120).optional(),
    /** Liste explicite (API) : identifiants de contreparties. */
    counterpartyIds: z.array(z.string().min(1).max(64)).max(20_000).optional(),
  })
  .strict();
export type RenotationFilters = z.infer<typeof renotationFiltersSchema>;

export const renotationOptionsSchema = z
  .object({
    /** Migration (en crans, à la hausse comme à la baisse) qui ouvre un dossier. */
    notchThreshold: z.number().int().min(1).max(10).default(1),
    /** Ouvrir un dossier pré-rempli sur migration, absence de note ou défaut. */
    openCases: z.boolean().default(true),
  })
  .strict();
export type RenotationOptions = z.infer<typeof renotationOptionsSchema>;

export const DEFAULT_OPTIONS: RenotationOptions = { notchThreshold: 1, openCases: true };

export const MOVEMENTS = ["UNCHANGED", "UPGRADE", "DOWNGRADE", "NO_RATING", "DEFAULTED"] as const;
export type Movement = (typeof MOVEMENTS)[number];

export const MOVEMENT_LABELS: Record<string, string> = {
  UNCHANGED: "Grade inchangé",
  UPGRADE: "Amélioration",
  DOWNGRADE: "Dégradation",
  NO_RATING: "Sans note",
  DEFAULTED: "Défaut",
};

export const ITEM_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  PROCESSING: "En cours",
  DONE: "Renotée",
  SKIPPED: "Écartée",
  ERROR: "Erreur",
};

export const BATCH_STATUS_LABELS: Record<string, string> = {
  QUEUED: "En file",
  RUNNING: "En cours",
  DONE: "Terminé",
  CANCELLED: "Annulé",
};

export const SEGMENTS = ["TPE", "PME", "GE"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Dernier jour du mois précédant `d`, au format AAAA-MM-JJ (UTC). */
export function previousMonthEnd(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

/** Libellé lisible d'une sélection, pour les listes et le journal. */
export function describeFilters(
  f: RenotationFilters,
  names: { entities?: Record<string, string>; groups?: Record<string, string> } = {}
): string {
  const parts: string[] = [];
  if (f.entityId) parts.push(`entité ${names.entities?.[f.entityId] ?? f.entityId}`);
  if (f.economicGroupId) parts.push(`groupe ${names.groups?.[f.economicGroupId] ?? f.economicGroupId}`);
  if (f.segment) parts.push(`segment ${f.segment}`);
  if (f.sectorPrefix) parts.push(`secteur ${f.sectorPrefix}*`);
  if (f.validatedBeforeMonths) parts.push(`validées depuis plus de ${f.validatedBeforeMonths} mois`);
  if (f.counterpartyIds) parts.push(`${f.counterpartyIds.length} contrepartie(s) désignée(s)`);
  return parts.length ? parts.join(", ") : "tout le périmètre";
}

/**
 * Contreparties retenues : actives, dans le périmètre d'ÉCRITURE (un lot crée
 * des notations et des dossiers), et conformes aux filtres.
 */
export async function selectCounterparties(
  db: PrismaClient,
  perimeter: Perimeter,
  filters: RenotationFilters,
  now = new Date()
): Promise<string[]> {
  const where: Record<string, unknown> = { isActive: true };
  let entities: string[] | null = perimeter.all ? null : perimeter.write;
  if (filters.entityId) {
    const branch = descendants(await loadTree(), filters.entityId);
    entities = entities ? branch.filter((id) => entities!.includes(id)) : branch;
  }
  if (entities) where.entityId = { in: entities };
  if (filters.economicGroupId) where.economicGroupId = filters.economicGroupId;
  if (filters.segment) where.segment = filters.segment;
  if (filters.sectorPrefix) where.sectorCode = { startsWith: filters.sectorPrefix };
  if (filters.counterpartyIds) where.id = { in: filters.counterpartyIds };

  if (!filters.validatedBeforeMonths) {
    const rows = await db.counterparty.findMany({ where, select: { id: true }, orderBy: { name: "asc" } });
    return rows.map((r) => r.id);
  }
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - filters.validatedBeforeMonths);
  const rows = await db.counterparty.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      ratingCases: {
        where: { status: "VALIDATED" },
        orderBy: { decidedAt: "desc" },
        take: 1,
        select: { decidedAt: true },
      },
    },
  });
  // Sans validation, la contrepartie est retenue : le lot dira pourquoi elle
  // ne peut pas être renotée, plutôt que de la taire.
  return rows
    .filter((r) => {
      const last = r.ratingCases[0]?.decidedAt;
      return !last || last < cutoff;
    })
    .map((r) => r.id);
}

// --- Fichier de mise à jour --------------------------------------------------------

export interface RefreshRow {
  /** ICE ou identifiant de la contrepartie, tel que lu dans le fichier. */
  ref: string;
  updates: Record<string, string>;
}

export interface RefreshParse {
  rows: RefreshRow[];
  columns: string[];
  errors: string[];
}

/**
 * Champs admis dans une mise à jour d'un modèle : ceux que l'IA peut proposer,
 * plus l'engagement global, rafraîchi chaque mois par les systèmes de la
 * banque (il alimente la segmentation et la délégation).
 */
export function refreshFieldsFor(model: ModelConfig): ProposableField[] {
  return [
    ...proposableFields(model),
    { key: "amounts.globalBankExposure", kind: "number", labelFr: "Engagement global banque/groupe", guideFr: "Devise de la contrepartie." },
  ];
}

function refreshFields() {
  const map = new Map<string, ProposableField>();
  for (const m of listModels()) for (const f of refreshFieldsFor(m)) if (!map.has(f.key)) map.set(f.key, f);
  return map;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/**
 * Lecture d'un fichier CSV de mise à jour (séparateur « ; » ou « , »).
 *
 * Première colonne : « ice » ou « id ». Colonnes suivantes : clés de champ du
 * dossier, par exemple `criteria.D3.1.value` (retards en jours),
 * `criteria.D1.5.value`, `amounts.globalBankExposure`, `redFlags.RF07`. Chaque
 * valeur est contrôlée comme une proposition de l'IA : une valeur hors grille
 * est refusée avec sa ligne, jamais appliquée.
 */
export function parseRefreshCsv(text: string, maxRows = 20_000): RefreshParse {
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], columns: [], errors: ["Fichier vide."] };
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], sep);
  const key = header[0]?.toLowerCase();
  if (key !== "ice" && key !== "id") {
    return { rows: [], columns: [], errors: ["Première colonne attendue : « ice » ou « id »."] };
  }
  const fields = refreshFields();
  const columns = header.slice(1);
  const unknown = columns.filter((c) => !fields.has(c));
  if (unknown.length) errors.push(`Colonnes inconnues ignorées : ${unknown.join(", ")}.`);
  if (lines.length - 1 > maxRows) errors.push(`Fichier tronqué à ${maxRows} lignes.`);

  const rows: RefreshRow[] = [];
  for (const [i, line] of lines.slice(1, maxRows + 1).entries()) {
    const cells = splitLine(line, sep);
    const ref = cells[0] ?? "";
    if (!ref) {
      errors.push(`Ligne ${i + 2} : identifiant absent.`);
      continue;
    }
    const updates: Record<string, string> = {};
    columns.forEach((col, j) => {
      const field = fields.get(col);
      const raw = cells[j + 1] ?? "";
      if (!field || raw === "") return;
      const v = normalizeProposal(field, raw);
      if (v === null) errors.push(`Ligne ${i + 2}, ${col} : valeur « ${raw} » refusée.`);
      else updates[col] = v;
    });
    rows.push({ ref, updates });
  }
  return { rows, columns: columns.filter((c) => fields.has(c)), errors: errors.slice(0, 50) };
}

/** Contrôle de lignes de mise à jour reçues par l'API : même règle que le fichier. */
export function normalizeRefreshRows(rows: Array<{ ref: string; updates: Record<string, unknown> }>): RefreshParse {
  const fields = refreshFields();
  const errors: string[] = [];
  const out: RefreshRow[] = [];
  const columns = new Set<string>();
  rows.forEach((r, i) => {
    const updates: Record<string, string> = {};
    for (const [k, raw] of Object.entries(r.updates ?? {})) {
      const field = fields.get(k);
      const v = field ? normalizeProposal(field, String(raw)) : null;
      if (v === null) errors.push(`refresh[${i}].${k} : ${field ? `valeur « ${String(raw)} » refusée` : "champ inconnu"}.`);
      else {
        updates[k] = v;
        columns.add(k);
      }
    }
    out.push({ ref: r.ref, updates });
  });
  return { rows: out, columns: [...columns], errors };
}

export const createBatchSchema = z
  .object({
    name: z.string().min(3).max(120),
    asOfDate: z.string().regex(ISO_DATE),
    filters: renotationFiltersSchema.default({}),
    options: renotationOptionsSchema.partial().optional(),
    refresh: z
      .array(z.object({ ref: z.string().min(1).max(64), updates: z.record(z.union([z.string(), z.number(), z.boolean()])) }).strict())
      .max(20_000)
      .optional(),
  })
  .strict();

// --- Création d'un lot ---------------------------------------------------------

export interface CreateBatchInput {
  name: string;
  asOfDate: string;
  filters: RenotationFilters;
  options?: Partial<RenotationOptions>;
  refresh?: RefreshRow[];
  scheduleId?: string;
}

export async function createBatch(db: PrismaClient, perimeter: Perimeter, identity: Identity, input: CreateBatchInput) {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 120) throw new RenotationError(400, "Nom du lot : 3 à 120 caractères.");
  if (!ISO_DATE.test(input.asOfDate)) throw new RenotationError(400, "Date d'arrêté au format AAAA-MM-JJ.");
  const filters = renotationFiltersSchema.parse(input.filters);
  const options = renotationOptionsSchema.parse({ ...DEFAULT_OPTIONS, ...(input.options ?? {}) });

  const ids = await selectCounterparties(db, perimeter, filters);
  if (ids.length === 0) throw new RenotationError(409, "Aucune contrepartie ne correspond à la sélection.");

  // Données rafraîchies : rattachées par ICE ou par identifiant.
  const updatesById = new Map<string, Record<string, string>>();
  if (input.refresh?.length) {
    const refs = input.refresh.map((r) => r.ref);
    const matches = await db.counterparty.findMany({
      where: { id: { in: ids }, OR: [{ id: { in: refs } }, { ice: { in: refs } }] },
      select: { id: true, ice: true },
    });
    const byRef = new Map<string, string>();
    for (const m of matches) {
      byRef.set(m.id, m.id);
      if (m.ice) byRef.set(m.ice, m.id);
    }
    for (const r of input.refresh) {
      const id = byRef.get(r.ref);
      if (id && Object.keys(r.updates).length) updatesById.set(id, { ...(updatesById.get(id) ?? {}), ...r.updates });
    }
  }

  const entityId = perimeter.all ? null : perimeter.entityId;
  const writeScope = perimeter.all || perimeter.write.length > 1 ? "BRANCH" : "ENTITY";
  const batch = await db.$transaction(async (tx) => {
    const b = await tx.renotationBatch.create({
      data: {
        name,
        asOfDate: input.asOfDate,
        filters: JSON.stringify(filters),
        options: JSON.stringify(options),
        total: ids.length,
        entityId,
        writeScope,
        scheduleId: input.scheduleId ?? null,
        createdBy: identity.name,
      },
    });
    for (let i = 0; i < ids.length; i += 1000) {
      await tx.renotationItem.createMany({
        data: ids.slice(i, i + 1000).map((counterpartyId) => {
          const u = updatesById.get(counterpartyId);
          return { batchId: b.id, counterpartyId, updates: u ? JSON.stringify(u) : null };
        }),
      });
    }
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "RENOTATION_BATCH_CREATED",
      resourceType: "RenotationBatch",
      resourceId: b.id,
      entityId,
      detail: { name, asOfDate: input.asOfDate, total: ids.length, filters, options, refreshed: updatesById.size, scheduleId: input.scheduleId },
    });
    return b;
  }, { timeout: 120_000 });
  return { batch, refreshed: updatesById.size };
}

export async function cancelBatch(db: PrismaClient, identity: Identity, batchId: string) {
  const b = await db.renotationBatch.findUnique({ where: { id: batchId } });
  if (!b) throw new RenotationError(404, "Lot introuvable.");
  if (b.status === "DONE" || b.status === "CANCELLED") throw new RenotationError(409, "Lot déjà terminé.");
  await db.$transaction(async (tx) => {
    await tx.renotationBatch.update({ where: { id: batchId }, data: { status: "CANCELLED", finishedAt: new Date() } });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "RENOTATION_BATCH_CANCELLED",
      resourceType: "RenotationBatch",
      resourceId: batchId,
      entityId: b.entityId,
      detail: { processed: b.processed, total: b.total },
    });
  });
}

// --- Traitement ----------------------------------------------------------------

/** Identité sous laquelle un lot note : traçable jusqu'à la personne qui l'a lancé. */
export function batchIdentity(batch: { createdBy: string; entityId: string | null; writeScope: string }): Identity {
  return {
    name: `renotation-lot:${batch.createdBy}`,
    role: "RISK_MANAGER",
    entityId: batch.entityId,
    writeScope: batch.writeScope,
  };
}

/** Écart en crans (positif : dégradation), ou null si les grades ne se comparent pas. */
export function notchDelta(model: ModelConfig, previous: string | null, next: string | null): number | null {
  if (!previous || !next) return null;
  try {
    return gradeRank(model.gradeScale, next) - gradeRank(model.gradeScale, previous);
  } catch {
    return null;
  }
}

export function movementOf(result: Pick<RatingResult, "ratingStatus" | "finalGrade">, delta: number | null): Movement {
  if (result.ratingStatus === "DEFAULTED") return "DEFAULTED";
  if (result.finalGrade === null) return "NO_RATING";
  if (delta === null || delta === 0) return "UNCHANGED";
  return delta > 0 ? "DOWNGRADE" : "UPGRADE";
}

const CLAIM_TIMEOUT_MS = 10 * 60_000;
const CHUNK = 20;

type BatchRow = NonNullable<Awaited<ReturnType<PrismaClient["renotationBatch"]["findUnique"]>>>;

/**
 * Traite le lot pendant au plus `budgetMs`. Reprenable : appelé de nouveau, il
 * reprend là où il s'est arrêté. Retourne l'état d'avancement.
 */
export async function processBatch(
  db: PrismaClient,
  batchId: string,
  budgetMs = 20_000
): Promise<{ status: string; processed: number; total: number }> {
  const started = Date.now();
  let batch = await db.renotationBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new RenotationError(404, "Lot introuvable.");
  if (batch.status === "DONE" || batch.status === "CANCELLED") {
    return { status: batch.status, processed: batch.processed, total: batch.total };
  }
  if (batch.status === "QUEUED") {
    await db.renotationBatch.updateMany({ where: { id: batchId, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
  }
  // Tranche interrompue (arrêt du serveur) : ses contreparties sont reprises.
  await db.renotationItem.updateMany({
    where: { batchId, status: "PROCESSING", claimedAt: { lt: new Date(Date.now() - CLAIM_TIMEOUT_MS) } },
    data: { status: "PENDING", claimedAt: null },
  });

  const options = renotationOptionsSchema.parse({ ...DEFAULT_OPTIONS, ...safeJson(batch.options) });
  const identity = batchIdentity(batch);
  while (Date.now() - started < budgetMs) {
    const current = await db.renotationBatch.findUnique({ where: { id: batchId }, select: { status: true } });
    if (current?.status === "CANCELLED") break;
    const next = await db.renotationItem.findMany({
      where: { batchId, status: "PENDING" },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: { id: true },
    });
    if (next.length === 0) break;
    for (const { id } of next) {
      if (Date.now() - started >= budgetMs) break;
      const claimed = await db.renotationItem.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "PROCESSING", claimedAt: new Date() },
      });
      if (claimed.count === 0) continue; // réclamée par un autre traitement
      await processItem(db, identity, batch, id, options);
    }
  }

  batch = (await refreshSummary(db, batchId)) ?? batch;
  return { status: batch.status, processed: batch.processed, total: batch.total };
}

async function processItem(db: PrismaClient, identity: Identity, batch: BatchRow, itemId: string, options: RenotationOptions) {
  const item = await db.renotationItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const finish = (data: Record<string, unknown>) =>
    db.renotationItem.update({ where: { id: itemId }, data: { ...data, processedAt: new Date() } });
  try {
    const counterparty = await db.counterparty.findUnique({
      where: { id: item.counterpartyId },
      select: { id: true, entityId: true, currency: true, isActive: true },
    });
    if (!counterparty || !counterparty.isActive) {
      await finish({ status: "SKIPPED", messageFr: "Contrepartie désactivée ou hors périmètre." });
      return;
    }
    const official = await db.ratingRun.findFirst({
      where: { counterpartyId: counterparty.id, ...OFFICIAL_RUN_WHERE },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, modelId: true, finalGrade: true, ratingCase: { select: { id: true, draftInput: true } } },
    });
    if (!official) {
      await finish({
        status: "SKIPPED",
        messageFr: "Aucune notation validée : nouvelle relation ou contrepartie jamais notée, à traiter par un dossier.",
      });
      return;
    }
    if (!official.ratingCase) {
      await finish({
        status: "SKIPPED",
        previousRunId: official.id,
        previousGrade: official.finalGrade,
        messageFr: "Note officielle sans dossier (antérieure au workflow ou reçue par l'API) : sa saisie n'est pas réutilisable, ouvrir un dossier.",
      });
      return;
    }
    const model = getModel(official.modelId);
    if (!model) {
      await finish({ status: "ERROR", messageFr: `Modèle ${official.modelId} indisponible.` });
      return;
    }

    // Deux formes de saisie validée : un brouillon d'écran, ou la requête reçue
    // par l'API (POST /rating-runs). La seconde se rejoue telle quelle, à la
    // nouvelle date d'arrêté ; le fichier de mise à jour, exprimé en champs
    // d'écran, ne s'y applique pas.
    const stored = safeJson(official.ratingCase.draftInput) ?? {};
    const apiRequest = stored.apiRequest as Record<string, unknown> | undefined;
    const updates = (safeJson(item.updates) ?? {}) as Record<string, string>;
    const ignored: string[] = [];
    let draft: CaseDraft | null = null;
    let input: RatingInput;
    if (apiRequest) {
      const parsed = ratingRequestSchema.safeParse({ ...apiRequest, asOfDate: batch.asOfDate });
      if (!parsed.success) {
        await finish({ status: "ERROR", messageFr: "Requête API d'origine non rejouable avec la version courante du modèle." });
        return;
      }
      const { counterpartyId: _ignored, ...rest } = parsed.data;
      input = rest as RatingInput;
      ignored.push(...Object.keys(updates));
    } else {
      draft = { ...parseDraft(official.ratingCase.draftInput, model, batch.asOfDate), asOfDate: batch.asOfDate };
      const allowed = new Set(refreshFieldsFor(model).map((f) => f.key));
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.has(k)) draft = applyField(draft, k, v);
        else ignored.push(k);
      }
      input = (await buildInput(db, { modelId: model.modelId, counterparty }, draft)).input;
    }

    const { runId, result } = await executeRatingRun(
      db,
      identity,
      input,
      counterparty.id,
      `lot:${batch.id}:${counterparty.id}`,
      undefined,
      undefined,
      "BATCH"
    );
    const delta = notchDelta(model, official.finalGrade, result.finalGrade);
    const movement = movementOf(result, delta);

    const notes: string[] = [];
    if (Object.keys(updates).length - ignored.length > 0) notes.push(`${Object.keys(updates).length - ignored.length} donnée(s) rafraîchie(s)`);
    if (ignored.length) notes.push(`champs non appliqués : ${ignored.join(", ")}`);
    if (movement === "NO_RATING") notes.push(result.explanationFr);

    let caseId: string | null = null;
    const needsReview =
      movement === "NO_RATING" || movement === "DEFAULTED" || (delta !== null && Math.abs(delta) >= options.notchThreshold);
    if (needsReview && options.openCases && !draft) {
      notes.push("saisie d'origine reçue par l'API : revue à déclencher dans le système émetteur");
    } else if (needsReview && options.openCases && draft) {
      const open = await db.ratingCase.findFirst({
        where: { counterpartyId: counterparty.id, status: { in: ["DRAFT", "SUBMITTED"] } },
        select: { id: true },
      });
      if (open) {
        notes.push("dossier déjà en cours : à mettre à jour par l'analyste");
        caseId = open.id;
      } else {
        caseId = await openReviewCase(db, identity, batch, counterparty, model.modelId, draft, movement, delta);
        notes.push("dossier de revue ouvert");
      }
    }

    await finish({
      status: "DONE",
      movement,
      sourceCaseId: official.ratingCase.id,
      previousRunId: official.id,
      previousGrade: official.finalGrade,
      newGrade: result.finalGrade,
      outcome: result.ratingStatus,
      notchDelta: delta,
      runId,
      caseId,
      messageFr: notes.join(" ; ") || null,
    });
  } catch (e) {
    const msg =
      e instanceof CaseError || e instanceof RatingServiceError || e instanceof RenotationError
        ? e.message
        : e instanceof Error
          ? e.message.slice(0, 300)
          : "Erreur inconnue.";
    if (!(e instanceof CaseError || e instanceof RatingServiceError)) console.error("[renotation]", msg);
    await finish({ status: "ERROR", messageFr: msg }).catch(() => undefined);
  }
}

async function openReviewCase(
  db: PrismaClient,
  identity: Identity,
  batch: BatchRow,
  counterparty: { id: string; entityId: string },
  modelId: string,
  draft: CaseDraft,
  movement: Movement,
  delta: number | null
): Promise<string> {
  return db.$transaction(async (tx) => {
    const created = await tx.ratingCase.create({
      data: {
        counterpartyId: counterparty.id,
        modelId,
        asOfDate: draft.asOfDate,
        draftInput: JSON.stringify(draft),
        createdBy: identity.name,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CASE_CREATED",
      resourceType: "RatingCase",
      resourceId: created.id,
      entityId: counterparty.entityId,
      detail: { counterpartyId: counterparty.id, modelId, asOfDate: draft.asOfDate, renotationBatchId: batch.id, motif: movement, crans: delta },
    });
    return created.id;
  });
}

/** Recompte l'avancement et clôt le lot quand plus rien n'est en attente. */
export async function refreshSummary(db: PrismaClient, batchId: string): Promise<BatchRow | null> {
  const [byStatus, byMovement, cases] = await Promise.all([
    db.renotationItem.groupBy({ by: ["status"], where: { batchId }, _count: { _all: true } }),
    db.renotationItem.groupBy({ by: ["movement"], where: { batchId, status: "DONE" }, _count: { _all: true } }),
    db.renotationItem.count({ where: { batchId, caseId: { not: null } } }),
  ]);
  const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const summary = {
    done: count("DONE"),
    skipped: count("SKIPPED"),
    errors: count("ERROR"),
    cases,
    movements: Object.fromEntries(byMovement.filter((r) => r.movement).map((r) => [r.movement!, r._count._all])),
  };
  const processed = summary.done + summary.skipped + summary.errors;
  const pending = count("PENDING") + count("PROCESSING");
  const b = await db.renotationBatch.findUnique({ where: { id: batchId } });
  if (!b) return null;
  const finished = pending === 0 && b.status !== "CANCELLED";
  const updated = await db.renotationBatch.update({
    where: { id: batchId },
    data: {
      processed,
      summary: JSON.stringify(summary),
      ...(finished && b.status !== "DONE" ? { status: "DONE", finishedAt: new Date() } : {}),
    },
  });
  if (finished && b.status !== "DONE") {
    await db.$transaction((tx) =>
      auditWithin(tx, {
        actor: `renotation-lot:${b.createdBy}`,
        actorRole: "RISK_MANAGER",
        action: "RENOTATION_BATCH_DONE",
        resourceType: "RenotationBatch",
        resourceId: batchId,
        entityId: b.entityId,
        detail: summary,
      })
    );
  }
  return updated;
}

export interface BatchSummary {
  done: number;
  skipped: number;
  errors: number;
  cases: number;
  movements: Partial<Record<Movement, number>>;
}

export function parseSummary(raw: string | null): BatchSummary {
  const s = (safeJson(raw) ?? {}) as Partial<BatchSummary>;
  return { done: s.done ?? 0, skipped: s.skipped ?? 0, errors: s.errors ?? 0, cases: s.cases ?? 0, movements: s.movements ?? {} };
}

export function safeJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- Planification -----------------------------------------------------------------

export const FREQUENCIES: Array<{ months: number; labelFr: string }> = [
  { months: 1, labelFr: "Mensuelle" },
  { months: 3, labelFr: "Trimestrielle" },
  { months: 6, labelFr: "Semestrielle" },
  { months: 12, labelFr: "Annuelle" },
];

export const scheduleSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    intervalMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
    dayOfMonth: z.number().int().min(1).max(28),
    filters: renotationFiltersSchema,
    options: renotationOptionsSchema,
  })
  .strict();

/** Première échéance au jour J à 02:00 UTC, à partir de `from` (incluse si non passée). */
export function firstRunAt(from: Date, dayOfMonth: number): Date {
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth, 2, 0, 0));
  if (candidate.getTime() >= from.getTime()) return candidate;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, dayOfMonth, 2, 0, 0));
}

/** Échéance suivante : `intervalMonths` plus tard, au même jour. */
export function nextRunAfter(previous: Date, intervalMonths: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + intervalMonths, dayOfMonth, 2, 0, 0));
}

export async function createSchedule(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  raw: unknown,
  now = new Date()
) {
  const parsed = scheduleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RenotationError(400, parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
  }
  const s = parsed.data;
  const entityId = perimeter.all ? null : perimeter.entityId;
  return db.$transaction(async (tx) => {
    const row = await tx.renotationSchedule.create({
      data: {
        name: s.name,
        intervalMonths: s.intervalMonths,
        dayOfMonth: s.dayOfMonth,
        filters: JSON.stringify(s.filters),
        options: JSON.stringify(s.options),
        entityId,
        writeScope: perimeter.all || perimeter.write.length > 1 ? "BRANCH" : "ENTITY",
        nextRunAt: firstRunAt(now, s.dayOfMonth),
        createdBy: identity.name,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "RENOTATION_SCHEDULE_CREATED",
      resourceType: "RenotationSchedule",
      resourceId: row.id,
      entityId,
      detail: s,
    });
    return row;
  });
}

export async function setScheduleActive(db: PrismaClient, identity: Identity, id: string, active: boolean, now = new Date()) {
  const s = await db.renotationSchedule.findUnique({ where: { id } });
  if (!s) throw new RenotationError(404, "Planification introuvable.");
  await db.$transaction(async (tx) => {
    await tx.renotationSchedule.update({
      where: { id },
      // Réactivée, elle repart de la prochaine échéance : pas de rattrapage en rafale.
      data: { isActive: active, ...(active ? { nextRunAt: firstRunAt(now, s.dayOfMonth) } : {}) },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: active ? "RENOTATION_SCHEDULE_ENABLED" : "RENOTATION_SCHEDULE_DISABLED",
      resourceType: "RenotationSchedule",
      resourceId: id,
      entityId: s.entityId,
    });
  });
}

/** Périmètre d'exécution d'un lot ou d'une planification. */
export async function executionPerimeter(row: { entityId: string | null; writeScope: string }): Promise<Perimeter> {
  if (!row.entityId) return PERIMETER_ALL;
  return computePerimeter(await loadTree(), { entityId: row.entityId, writeScope: row.writeScope, role: "RISK_MANAGER" });
}

/**
 * Tâche planifiée (cron) : crée les lots des planifications échues, puis
 * poursuit les lots en cours, dans la limite du budget. Chaque lot s'exécute
 * dans le périmètre de la personne qui l'a créé.
 */
export async function runScheduler(now = new Date(), budgetMs = 240_000) {
  const started = Date.now();
  const created: string[] = [];
  const due = await basePrisma.renotationSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
  });
  for (const s of due) {
    // Réservation de l'échéance : deux exécutions simultanées du cron ne
    // créent pas deux lots.
    const next = nextRunAfter(s.nextRunAt, s.intervalMonths, s.dayOfMonth);
    const reserved = await basePrisma.renotationSchedule.updateMany({
      where: { id: s.id, nextRunAt: s.nextRunAt },
      data: { nextRunAt: next.getTime() <= now.getTime() ? firstRunAt(now, s.dayOfMonth) : next, lastRunAt: now },
    });
    if (reserved.count === 0) continue;
    const perimeter = await executionPerimeter(s);
    const db = scopedPrisma(perimeter);
    const asOfDate = previousMonthEnd(now);
    try {
      const { batch } = await createBatch(db, perimeter, { name: s.createdBy, role: "RISK_MANAGER", entityId: s.entityId, writeScope: s.writeScope }, {
        name: `${s.name} — arrêté ${asOfDate}`,
        asOfDate,
        filters: renotationFiltersSchema.parse(safeJson(s.filters) ?? {}),
        options: renotationOptionsSchema.parse({ ...DEFAULT_OPTIONS, ...safeJson(s.options) }),
        scheduleId: s.id,
      });
      await basePrisma.renotationSchedule.update({ where: { id: s.id }, data: { lastBatchId: batch.id } });
      created.push(batch.id);
    } catch (e) {
      console.error("[renotation] planification", s.id, e instanceof Error ? e.message : e);
    }
  }

  const pending = await basePrisma.renotationBatch.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, entityId: true, writeScope: true },
  });
  const progressed: Array<{ id: string; status: string; processed: number; total: number }> = [];
  for (const b of pending) {
    const left = budgetMs - (Date.now() - started);
    if (left < 5_000) break;
    const db = scopedPrisma(await executionPerimeter(b));
    progressed.push({ id: b.id, ...(await processBatch(db, b.id, left)) });
  }
  return { created, progressed };
}
