import type { PrismaClient } from "@/generated/prisma";
import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import { hasRole, type Identity, type Role } from "./auth";
import { auditWithin } from "./audit";
import { draftAmounts, draftToRequest, parseDraft, type CaseDraft } from "./case-input";
import { BASE_CURRENCY, convertToBase, FxError, type FxConversion } from "./fx";
import { executeRatingRun, RatingServiceError, simulateRating } from "./rating-service";
import { ratingRequestSchema } from "./schemas";
import { settingInt, settingText } from "./settings";

/**
 * Workflow des dossiers de notation.
 *
 *   DRAFT ──soumission──▶ SUBMITTED ──validation──▶ VALIDATED
 *     ▲                       │
 *     └──── reprise ◀── REJECTED (motif obligatoire)
 *   DRAFT ──abandon──▶ CANCELLED
 *
 * Règles :
 *  - la notation est calculée par le serveur à la soumission, à partir du
 *    brouillon enregistré, et figée (RatingRun immuable) ;
 *  - le valideur est distinct de l'auteur et de TOUT contributeur du dossier
 *    (enregistrements, soumission, décisions sur les propositions de l'IA) ;
 *  - le rôle du valideur suit le paramétrage, et la délégation par montant :
 *    au-delà du seuil (devise de base), un rôle supérieur est exigé ;
 *  - seule une notation validée devient la note de la contrepartie ;
 *  - toutes les opérations passent par le client cloisonné : un dossier hors du
 *    périmètre est introuvable.
 */

export const CASE_STATUSES = ["DRAFT", "SUBMITTED", "VALIDATED", "REJECTED", "CANCELLED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis, en attente de validation",
  VALIDATED: "Validé",
  REJECTED: "Rejeté",
  CANCELLED: "Abandonné",
};

export class CaseError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const MAX_DRAFT_BYTES = 400_000;

/** Actions du journal qui font d'un utilisateur un contributeur du dossier. */
const CONTRIBUTOR_ACTIONS = [
  "CASE_CREATED",
  "CASE_DRAFT_SAVED",
  "CASE_SUBMITTED",
  "CASE_REOPENED",
  "AI_PROPOSALS_GENERATED",
  "AI_PROPOSAL_DECIDED",
  "CASE_DOCUMENT_ADDED",
];

async function loadCase(db: PrismaClient, id: string) {
  const c = await db.ratingCase.findUnique({
    where: { id },
    include: { counterparty: { select: { id: true, name: true, entityId: true, currency: true } } },
  });
  if (!c) throw new CaseError(404, "Dossier introuvable.");
  return c;
}

export async function contributorsOf(db: PrismaClient, caseId: string): Promise<string[]> {
  // Un dossier repris après rejet hérite des contributeurs du dossier d'origine :
  // la reprise ne remet pas à zéro la séparation des fonctions.
  const actors = new Set<string>();
  const seen = new Set<string>();
  let current: string | null = caseId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const events: Array<{ actor: string; action: string; detail: string | null }> = await db.auditEvent.findMany({
      where: { resourceType: "RatingCase", resourceId: current, action: { in: CONTRIBUTOR_ACTIONS } },
      select: { actor: true, action: true, detail: true },
    });
    let from: string | null = null;
    for (const e of events) {
      actors.add(e.actor);
      if (e.action === "CASE_REOPENED" && e.detail) {
        try {
          from = (JSON.parse(e.detail) as { fromCaseId?: string }).fromCaseId ?? null;
        } catch {
          from = null;
        }
      }
    }
    current = from;
  }
  return [...actors];
}

/** Création d'un dossier ; reprend la saisie du dernier dossier de la contrepartie sur ce modèle. */
export async function createCase(
  db: PrismaClient,
  identity: Identity,
  input: { counterpartyId: string; modelId: string; asOfDate: string }
) {
  const model = getModel(input.modelId);
  if (!model) throw new CaseError(404, `Modèle inconnu : ${input.modelId}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) throw new CaseError(400, "Date d'arrêté au format AAAA-MM-JJ.");
  const counterparty = await db.counterparty.findUnique({ where: { id: input.counterpartyId } });
  if (!counterparty) throw new CaseError(404, "Contrepartie introuvable.");
  if (!counterparty.isActive) throw new CaseError(409, "Contrepartie désactivée.");
  const open = await db.ratingCase.findFirst({
    where: { counterpartyId: counterparty.id, status: { in: ["DRAFT", "SUBMITTED"] } },
    select: { id: true },
  });
  if (open) throw new CaseError(409, `Un dossier est déjà en cours pour cette contrepartie (${open.id}).`);

  const previous = await db.ratingCase.findFirst({
    where: { counterpartyId: counterparty.id, modelId: model.modelId, status: { in: ["VALIDATED", "REJECTED"] } },
    orderBy: { createdAt: "desc" },
    select: { draftInput: true },
  });
  const draft: CaseDraft = previous
    ? { ...parseDraft(previous.draftInput, model, input.asOfDate), asOfDate: input.asOfDate }
    : parseDraft(null, model, input.asOfDate);

  return db.$transaction(async (tx) => {
    const created = await tx.ratingCase.create({
      data: {
        counterpartyId: counterparty.id,
        modelId: model.modelId,
        asOfDate: input.asOfDate,
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
      detail: { counterpartyId: counterparty.id, modelId: model.modelId, asOfDate: input.asOfDate, reprise: !!previous },
    });
    return created;
  });
}

function serializeDraft(draft: CaseDraft): string {
  const s = JSON.stringify(draft);
  if (Buffer.byteLength(s, "utf8") > MAX_DRAFT_BYTES) throw new CaseError(413, "Saisie trop volumineuse.");
  return s;
}

export async function saveDraft(db: PrismaClient, identity: Identity, caseId: string, draft: CaseDraft) {
  const c = await loadCase(db, caseId);
  if (c.status !== "DRAFT") throw new CaseError(409, `Dossier ${CASE_STATUS_LABELS[c.status]?.toLowerCase()} : il ne se modifie plus.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.asOfDate)) throw new CaseError(400, "Date d'arrêté au format AAAA-MM-JJ.");
  await db.$transaction(async (tx) => {
    const updated = await tx.ratingCase.updateMany({
      where: { id: caseId, status: "DRAFT" },
      data: { draftInput: serializeDraft(draft), asOfDate: draft.asOfDate },
    });
    if (updated.count === 0) throw new CaseError(409, "Le dossier a changé d'état entre-temps.");
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CASE_DRAFT_SAVED",
      resourceType: "RatingCase",
      resourceId: caseId,
      entityId: c.counterparty.entityId,
    });
  });
}

/** Conversion des montants du brouillon dans la devise de base. */
async function convertAmounts(
  db: PrismaClient,
  draft: CaseDraft,
  currency: string
): Promise<{ base: Record<string, number>; fx: FxConversion | null }> {
  const amounts = draftAmounts(draft);
  const present = Object.fromEntries(Object.entries(amounts).filter(([, v]) => v !== undefined)) as Record<string, number>;
  if (Object.keys(present).length === 0) return { base: {}, fx: null };
  try {
    const fx = await convertToBase(db, currency, draft.asOfDate, present);
    return { base: Object.fromEntries(Object.entries(fx.amounts).map(([k, v]) => [k, v.base])), fx };
  } catch (e) {
    if (e instanceof FxError) throw new CaseError(409, e.message);
    throw e;
  }
}

/** Requête de notation validée par le schéma de l'API, à partir d'un brouillon. */
async function buildInput(db: PrismaClient, c: { modelId: string; counterparty: { currency: string } }, draft: CaseDraft) {
  const model = getModel(c.modelId);
  if (!model) throw new CaseError(500, "Version de modèle du dossier indisponible.");
  const { base, fx } = await convertAmounts(db, draft, c.counterparty.currency);
  const parsed = ratingRequestSchema.safeParse(draftToRequest(draft, model, base));
  if (!parsed.success) {
    throw new CaseError(
      400,
      parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")
    );
  }
  const { counterpartyId: _ignored, ...input } = parsed.data;
  return { input: input as RatingInput, fx };
}

/** Aperçu du calcul, sans enregistrement : même requête que la soumission. */
export async function previewCase(
  db: PrismaClient,
  caseId: string,
  draft: CaseDraft
): Promise<{ result: RatingResult; fx: FxConversion | null }> {
  const c = await loadCase(db, caseId);
  const { input, fx } = await buildInput(db, c, draft);
  return { result: simulateRating(input), fx };
}

export async function submitCase(db: PrismaClient, identity: Identity, caseId: string, draft: CaseDraft) {
  const c = await loadCase(db, caseId);
  if (c.status !== "DRAFT") throw new CaseError(409, "Seul un brouillon se soumet.");
  const { input, fx } = await buildInput(db, c, draft);
  try {
    return await executeRatingRun(db, identity, input, c.counterparty.id, undefined, undefined, async (tx, runId) => {
      const updated = await tx.ratingCase.updateMany({
        where: { id: caseId, status: "DRAFT" },
        data: {
          status: "SUBMITTED",
          runId,
          draftInput: serializeDraft(draft),
          asOfDate: draft.asOfDate,
          fxDetail: fx ? JSON.stringify(fx) : null,
          submittedBy: identity.name,
          submittedAt: new Date(),
          decidedBy: null,
          decidedAt: null,
          decisionComment: null,
        },
      });
      if (updated.count === 0) throw new CaseError(409, "Le dossier a changé d'état entre-temps.");
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "CASE_SUBMITTED",
        resourceType: "RatingCase",
        resourceId: caseId,
        entityId: c.counterparty.entityId,
        detail: { runId, devise: fx?.currency ?? BASE_CURRENCY, cours: fx?.rate ?? 1 },
      });
    });
  } catch (e) {
    if (e instanceof RatingServiceError) throw new CaseError(e.status, e.message);
    throw e;
  }
}

/** Rôle exigé pour valider : paramétrage et délégation par montant. */
export async function requiredValidatorRole(exposureBase: number | null): Promise<{ role: Role; reasonFr: string }> {
  const base = (await settingText("WORKFLOW_VALIDATOR_ROLE")) as Role;
  const threshold = await settingInt("WORKFLOW_DELEGATION_THRESHOLD");
  if (threshold > 0 && exposureBase !== null && exposureBase > threshold) {
    const above = (await settingText("WORKFLOW_DELEGATION_ROLE")) as Role;
    return {
      role: hasRole(above, base) ? above : base,
      reasonFr: `exposition de ${Math.round(exposureBase).toLocaleString("fr-FR")} ${BASE_CURRENCY}, au-delà du seuil de délégation`,
    };
  }
  return { role: base, reasonFr: "paramétrage du workflow" };
}

function exposureOf(fxDetail: string | null, draftInput: string): number | null {
  try {
    if (fxDetail) {
      const fx = JSON.parse(fxDetail) as FxConversion;
      if (fx.amounts.globalBankExposure) return fx.amounts.globalBankExposure.base;
    }
    const d = JSON.parse(draftInput) as Partial<CaseDraft>;
    const n = Number(String(d.amounts?.globalBankExposure ?? "").replace(/\s/g, "").replace(",", "."));
    return d.amounts?.globalBankExposure && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Ce qui empêche une identité de valider, ou null si elle le peut. */
export async function validationBlocker(
  db: PrismaClient,
  identity: Identity,
  c: { id: string; status: string; fxDetail: string | null; draftInput: string }
): Promise<string | null> {
  if (c.status !== "SUBMITTED") return "le dossier n'est pas en attente de validation";
  const { role, reasonFr } = await requiredValidatorRole(exposureOf(c.fxDetail, c.draftInput));
  if (!hasRole(identity.role, role)) return `rôle ${role} requis (${reasonFr})`;
  const contributors = await contributorsOf(db, c.id);
  if (contributors.includes(identity.name)) {
    return "vous avez contribué à ce dossier : la validation revient à une autre personne (séparation des fonctions)";
  }
  return null;
}

export async function decideCase(
  db: PrismaClient,
  identity: Identity,
  caseId: string,
  decision: "VALIDATED" | "REJECTED",
  comment: string | undefined
) {
  const c = await loadCase(db, caseId);
  const blocker = await validationBlocker(db, identity, c);
  if (blocker) throw new CaseError(403, `Décision impossible : ${blocker}.`);
  const motif = (comment ?? "").trim();
  if (decision === "REJECTED" && motif.length < 10) {
    throw new CaseError(400, "Motif de rejet obligatoire (10 caractères au moins).");
  }
  await db.$transaction(async (tx) => {
    const updated = await tx.ratingCase.updateMany({
      where: { id: caseId, status: "SUBMITTED" },
      data: { status: decision, decidedBy: identity.name, decidedAt: new Date(), decisionComment: motif || null },
    });
    if (updated.count === 0) throw new CaseError(409, "Dossier déjà décidé par un autre valideur.");
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: decision === "VALIDATED" ? "CASE_VALIDATED" : "CASE_REJECTED",
      resourceType: "RatingCase",
      resourceId: caseId,
      entityId: c.counterparty.entityId,
      detail: { runId: c.runId, motif: motif || undefined },
    });
  });
}

/**
 * Reprise d'un dossier rejeté : un NOUVEAU brouillon reprend sa saisie. Le
 * dossier rejeté reste tel quel, avec sa notation : elle ne devient jamais la
 * note officielle et l'historique garde la trace du rejet.
 */
export async function reopenCase(db: PrismaClient, identity: Identity, caseId: string) {
  const c = await loadCase(db, caseId);
  if (c.status !== "REJECTED") throw new CaseError(409, "Seul un dossier rejeté se reprend.");
  const open = await db.ratingCase.findFirst({
    where: { counterpartyId: c.counterpartyId, status: { in: ["DRAFT", "SUBMITTED"] } },
    select: { id: true },
  });
  if (open) throw new CaseError(409, `Un dossier est déjà en cours pour cette contrepartie (${open.id}).`);
  return db.$transaction(async (tx) => {
    const created = await tx.ratingCase.create({
      data: {
        counterpartyId: c.counterpartyId,
        modelId: c.modelId,
        asOfDate: c.asOfDate,
        draftInput: c.draftInput,
        createdBy: identity.name,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CASE_REOPENED",
      resourceType: "RatingCase",
      resourceId: created.id,
      entityId: c.counterparty.entityId,
      detail: { fromCaseId: caseId, runRejete: c.runId },
    });
    return created;
  });
}

export async function cancelCase(db: PrismaClient, identity: Identity, caseId: string) {
  const c = await loadCase(db, caseId);
  if (c.status !== "DRAFT") throw new CaseError(409, "Seul un brouillon s'abandonne.");
  await db.$transaction(async (tx) => {
    await tx.ratingCase.update({ where: { id: caseId }, data: { status: "CANCELLED" } });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CASE_CANCELLED",
      resourceType: "RatingCase",
      resourceId: caseId,
      entityId: c.counterparty.entityId,
    });
  });
}

/**
 * Une notation fait foi si elle est validée, ou si elle précède le workflow
 * (notations historiques, sans dossier).
 */
export function isOfficialRun(run: { ratingCase: { status: string } | null }): boolean {
  return !run.ratingCase || run.ratingCase.status === "VALIDATED";
}
