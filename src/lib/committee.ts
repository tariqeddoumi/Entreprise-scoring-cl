import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { CaseError, buildInput, contributorsOf } from "./cases";
import { draftClassification, draftFinancials, parseDraft } from "./case-input";
import { caseLifts, loadClassification, parseCodes } from "./classification-store";

export { caseLifts, loadClassification } from "./classification-store";
import { executeRatingRun, RatingServiceError } from "./rating-service";
import { getScoringModel, today } from "./rating-scale";
import { settingBool } from "./settings";
import { effectiveFormat } from "./statement-format";
import { loadCircuit } from "./workflow";
import { hasPermission, holdersOf, type Permission } from "@/reference/workflow";

/**
 * Décisions de comité enregistrées dans l'outil (D-57) :
 *  - levée de critères de classement sur un dossier : la note du dossier est
 *    recalculée sans le plafond ou le défaut qu'ils imposaient. La levée vaut
 *    pour ce dossier ; au renouvellement, elle est rappelée, à réexaminer ;
 *  - entrée et sortie de watch list, datées (une date passée reprend
 *    l'historique d'un client déjà suivi).
 *
 * Enregistrées par un profil habilité (droits paramétrables), avec la date du
 * comité, le numéro du procès-verbal et le motif ; confirmées par une seconde
 * personne si le paramétrage l'exige. Jamais supprimées : annulées, avec motif.
 */

export type DecisionKind = "LEVEE_CRITERES" | "WL_ENTREE" | "WL_SORTIE";

/** Décisions de levée d'un client (tous dossiers), les plus récentes d'abord. */
export async function counterpartyLifts(db: PrismaClient, counterpartyId: string) {
  const rows = await db.committeeDecision.findMany({ where: { counterpartyId, kind: "LEVEE_CRITERES" }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ ...r, codes: parseCodes(r.criteria) }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkCommon(input: { committeeDate: string; reference: string; motif: string }) {
  if (!DATE_RE.test(input.committeeDate)) throw new CaseError(400, "Date du comité au format AAAA-MM-JJ.");
  if (input.committeeDate > today()) throw new CaseError(400, "La date du comité ne peut pas être future.");
  if (!input.reference.trim() || input.reference.length > 80) throw new CaseError(400, "Numéro du procès-verbal obligatoire (80 caractères au plus).");
  if (input.motif.trim().length < 10 || input.motif.length > 4000) throw new CaseError(400, "Motif de la décision : 10 caractères au moins.");
}

async function requirePermission(identity: Identity, perm: Permission): Promise<string | null> {
  const { circuit } = await loadCircuit();
  if (!hasPermission(circuit, identity.jobFunction, perm)) {
    const who = holdersOf(circuit, perm).map((f) => f.labelFr);
    throw new CaseError(403, `Réservé à : ${who.join(", ") || "aucun profil (paramétrage du circuit)"}.`);
  }
  return identity.jobFunction ?? null;
}

/**
 * Recalcule la note d'un dossier soumis après une levée (ou son annulation) :
 * nouvelle notation rattachée au dossier, l'ancienne reste dans l'historique.
 */
export async function recalculateCase(db: PrismaClient, identity: Identity, caseId: string, reasonFr: string): Promise<string | null> {
  const c = await db.ratingCase.findUnique({ where: { id: caseId }, include: { counterparty: { select: { id: true, entityId: true, currency: true } } } });
  if (!c || c.status !== "SUBMITTED" || !c.runId) return null;
  const model = await getScoringModel(c.modelId);
  if (!model) return null;
  const draft = parseDraft(c.draftInput, model, c.asOfDate);
  const { input } = await buildInput(db, c, draft);
  const before = await db.ratingRun.findUnique({ where: { id: c.runId }, select: { finalGrade: true } });
  try {
    const r = await executeRatingRun(db, identity, input, c.counterpartyId, undefined, undefined, async (tx, runId) => {
      const updated = await tx.ratingCase.updateMany({ where: { id: caseId, status: "SUBMITTED", runId: c.runId }, data: { runId } });
      if (updated.count === 0) throw new CaseError(409, "Le dossier a changé d'état entre-temps.");
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "CASE_RECALCULATED",
        resourceType: "RatingCase",
        resourceId: caseId,
        entityId: c.counterparty.entityId,
        detail: { motif: reasonFr, ancienneNotation: c.runId, ancienneNote: before?.finalGrade ?? null, nouvelleNotation: runId },
      });
    }, "CASE");
    return r.result.finalGrade;
  } catch (e) {
    if (e instanceof RatingServiceError) throw new CaseError(e.status, e.message);
    throw e;
  }
}

/** Levée de critères de classement sur un dossier, sur décision de comité. */
export async function recordLift(
  db: PrismaClient,
  identity: Identity,
  caseId: string,
  input: { codes: string[]; committeeDate: string; reference: string; motif: string }
): Promise<{ status: "EN_ATTENTE" | "EFFECTIVE"; newGrade: string | null }> {
  const fn = await requirePermission(identity, "LEVER_CRITERE");
  checkCommon(input);
  const c = await db.ratingCase.findUnique({ where: { id: caseId }, include: { counterparty: { select: { id: true, entityId: true } } } });
  if (!c) throw new CaseError(404, "Dossier introuvable.");
  if (c.status !== "DRAFT" && c.status !== "SUBMITTED") throw new CaseError(409, "Une levée s'enregistre sur un dossier en cours (brouillon ou en validation).");
  if ((await contributorsOf(db, caseId)).includes(identity.name)) throw new CaseError(403, "Vous avez contribué à ce dossier : la levée revient à une autre personne.");
  const model = await getScoringModel(c.modelId);
  if (!model) throw new CaseError(500, "Modèle du dossier indisponible.");
  const draft = parseDraft(c.draftInput, model, c.asOfDate);
  const fin = draftFinancials(draft, model, await effectiveFormat(today()));
  const current = draftClassification(draft, fin, await loadClassification(db), await caseLifts(db, caseId));
  const codes = [...new Set(input.codes.map((x) => x.trim().toUpperCase()))].filter(Boolean);
  if (codes.length === 0) throw new CaseError(400, "Choisissez le ou les critères levés par le comité.");
  const unknown = codes.filter((x) => !current.active.includes(x));
  if (unknown.length) throw new CaseError(400, `Critère(s) non cochés ou déjà levés : ${unknown.join(", ")}.`);
  const double = await settingBool("COMMITTEE_LIFT_DOUBLE_VALIDATION");
  const status = double ? "EN_ATTENTE" : "EFFECTIVE";
  await db.$transaction(async (tx) => {
    const d = await tx.committeeDecision.create({
      data: {
        counterpartyId: c.counterpartyId,
        caseId,
        kind: "LEVEE_CRITERES",
        criteria: JSON.stringify(codes),
        committeeDate: input.committeeDate,
        reference: input.reference.trim(),
        motif: input.motif.trim(),
        effectiveDate: input.committeeDate,
        status,
        recordedBy: identity.name,
        recordedFunction: fn,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CLASSIFICATION_LIFT_RECORDED",
      resourceType: "CommitteeDecision",
      resourceId: d.id,
      entityId: c.counterparty.entityId,
      detail: { caseId, criteres: codes, comite: input.committeeDate, pv: input.reference.trim(), statut: status },
    });
  });
  const newGrade = status === "EFFECTIVE" ? await recalculateCase(db, identity, caseId, `Levée des critères ${codes.join(", ")} (comité du ${input.committeeDate}, PV ${input.reference.trim()})`) : null;
  return { status, newGrade };
}

/** Confirmation d'une décision par une seconde personne habilitée. */
export async function confirmDecision(db: PrismaClient, identity: Identity, decisionId: string): Promise<{ newGrade: string | null }> {
  const d = await db.committeeDecision.findUnique({ where: { id: decisionId }, include: { counterparty: { select: { entityId: true } } } });
  if (!d) throw new CaseError(404, "Décision introuvable.");
  if (d.status !== "EN_ATTENTE") throw new CaseError(409, "Décision déjà confirmée ou annulée.");
  await requirePermission(identity, d.kind === "LEVEE_CRITERES" ? "CONFIRMER_LEVEE" : "CONFIRMER_WL");
  if (d.recordedBy === identity.name) throw new CaseError(403, "La confirmation revient à une autre personne que celle qui a enregistré la décision.");
  if (d.kind !== "LEVEE_CRITERES") await assertWatchlistTransition(db, d.counterpartyId, d.kind as DecisionKind, d.effectiveDate, d.id);
  await db.$transaction(async (tx) => {
    const u = await tx.committeeDecision.updateMany({ where: { id: decisionId, status: "EN_ATTENTE" }, data: { status: "EFFECTIVE", confirmedBy: identity.name, confirmedAt: new Date() } });
    if (u.count === 0) throw new CaseError(409, "Décision déjà traitée.");
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "COMMITTEE_DECISION_CONFIRMED",
      resourceType: "CommitteeDecision",
      resourceId: decisionId,
      entityId: d.counterparty.entityId,
      detail: { nature: d.kind, enregistreePar: d.recordedBy },
    });
  });
  const newGrade = d.kind === "LEVEE_CRITERES" && d.caseId ? await recalculateCase(db, identity, d.caseId, `Levée confirmée (PV ${d.reference})`) : null;
  return { newGrade };
}

/** Annulation d'une décision (erreur de saisie, décision rapportée), avec motif. */
export async function cancelDecision(db: PrismaClient, identity: Identity, decisionId: string, reason: string): Promise<void> {
  const d = await db.committeeDecision.findUnique({ where: { id: decisionId }, include: { counterparty: { select: { entityId: true } } } });
  if (!d) throw new CaseError(404, "Décision introuvable.");
  if (d.status === "ANNULEE") throw new CaseError(409, "Décision déjà annulée.");
  if (reason.trim().length < 10) throw new CaseError(400, "Motif de l'annulation : 10 caractères au moins.");
  await requirePermission(identity, d.kind === "LEVEE_CRITERES" ? "LEVER_CRITERE" : "DECIDER_WL");
  if (d.kind === "LEVEE_CRITERES" && d.caseId) {
    const c = await db.ratingCase.findUnique({ where: { id: d.caseId }, select: { status: true } });
    if (c && c.status !== "DRAFT" && c.status !== "SUBMITTED") throw new CaseError(409, "Le dossier est clos : la levée fait partie de sa note.");
  }
  await db.$transaction(async (tx) => {
    await tx.committeeDecision.update({ where: { id: decisionId }, data: { status: "ANNULEE", cancelledBy: identity.name, cancelReason: reason.trim() } });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "COMMITTEE_DECISION_CANCELLED",
      resourceType: "CommitteeDecision",
      resourceId: decisionId,
      entityId: d.counterparty.entityId,
      detail: { nature: d.kind, statutPrecedent: d.status, motif: reason.trim() },
    });
  });
  if (d.kind === "LEVEE_CRITERES" && d.caseId && d.status === "EFFECTIVE") await recalculateCase(db, identity, d.caseId, `Levée annulée (PV ${d.reference})`);
}

// --- Watch list -------------------------------------------------------------------------------

export interface WatchlistState {
  inWatchlist: boolean;
  since: string | null;
  lastExit: string | null;
  history: Array<{ id: string; kind: "WL_ENTREE" | "WL_SORTIE"; effectiveDate: string; committeeDate: string; reference: string; motif: string; status: string; recordedBy: string; confirmedBy: string | null; cancelReason: string | null }>;
}

export async function watchlistState(db: PrismaClient, counterpartyId: string): Promise<WatchlistState> {
  const rows = await db.committeeDecision.findMany({
    where: { counterpartyId, kind: { in: ["WL_ENTREE", "WL_SORTIE"] } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const effective = rows.filter((r) => r.status === "EFFECTIVE");
  const last = effective[0];
  return {
    inWatchlist: last?.kind === "WL_ENTREE",
    since: last?.kind === "WL_ENTREE" ? last.effectiveDate : null,
    lastExit: effective.find((r) => r.kind === "WL_SORTIE")?.effectiveDate ?? null,
    history: rows.map((r) => ({
      id: r.id,
      kind: r.kind as "WL_ENTREE" | "WL_SORTIE",
      effectiveDate: r.effectiveDate,
      committeeDate: r.committeeDate,
      reference: r.reference,
      motif: r.motif,
      status: r.status,
      recordedBy: r.recordedBy,
      confirmedBy: r.confirmedBy,
      cancelReason: r.cancelReason,
    })),
  };
}

/** Clients en watch list (pour les listes et badges). */
export async function watchlistedIds(db: PrismaClient, counterpartyIds?: string[]): Promise<Set<string>> {
  const rows = await db.committeeDecision.findMany({
    where: { kind: { in: ["WL_ENTREE", "WL_SORTIE"] }, status: "EFFECTIVE", ...(counterpartyIds ? { counterpartyId: { in: counterpartyIds } } : {}) },
    orderBy: [{ counterpartyId: "asc" }, { effectiveDate: "desc" }, { createdAt: "desc" }],
    distinct: ["counterpartyId"],
    select: { counterpartyId: true, kind: true },
  });
  return new Set(rows.filter((r) => r.kind === "WL_ENTREE").map((r) => r.counterpartyId));
}

/** Une entrée suit une sortie (ou rien), une sortie suit une entrée ; dates dans l'ordre. */
async function assertWatchlistTransition(db: PrismaClient, counterpartyId: string, kind: DecisionKind, effectiveDate: string, excludeId?: string) {
  const rows = await db.committeeDecision.findMany({
    where: { counterpartyId, kind: { in: ["WL_ENTREE", "WL_SORTIE"] }, status: "EFFECTIVE", ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 1,
  });
  const last = rows[0];
  if (kind === "WL_ENTREE" && last?.kind === "WL_ENTREE") throw new CaseError(409, `Client déjà en watch list depuis le ${last.effectiveDate}.`);
  if (kind === "WL_SORTIE" && last?.kind !== "WL_ENTREE") throw new CaseError(409, "Client hors watch list : aucune sortie à enregistrer.");
  if (last && effectiveDate < last.effectiveDate) throw new CaseError(409, `Date d'effet antérieure à la dernière décision (${last.effectiveDate}).`);
}

/** Entrée ou sortie de watch list, sur décision de comité. */
export async function recordWatchlist(
  db: PrismaClient,
  identity: Identity,
  counterpartyId: string,
  input: { kind: "WL_ENTREE" | "WL_SORTIE"; effectiveDate: string; committeeDate: string; reference: string; motif: string }
): Promise<{ status: "EN_ATTENTE" | "EFFECTIVE" }> {
  const fn = await requirePermission(identity, "DECIDER_WL");
  checkCommon(input);
  if (input.kind !== "WL_ENTREE" && input.kind !== "WL_SORTIE") throw new CaseError(400, "Décision : entrée ou sortie de watch list.");
  if (!DATE_RE.test(input.effectiveDate)) throw new CaseError(400, "Date d'effet au format AAAA-MM-JJ.");
  if (input.effectiveDate > today()) throw new CaseError(400, "La date d'effet ne peut pas être future.");
  const cp = await db.counterparty.findUnique({ where: { id: counterpartyId }, select: { id: true, entityId: true } });
  if (!cp) throw new CaseError(404, "Client introuvable.");
  await assertWatchlistTransition(db, counterpartyId, input.kind, input.effectiveDate);
  const status = (await settingBool("COMMITTEE_WL_DOUBLE_VALIDATION")) ? "EN_ATTENTE" : "EFFECTIVE";
  await db.$transaction(async (tx) => {
    const d = await tx.committeeDecision.create({
      data: {
        counterpartyId,
        kind: input.kind,
        committeeDate: input.committeeDate,
        reference: input.reference.trim(),
        motif: input.motif.trim(),
        effectiveDate: input.effectiveDate,
        status,
        recordedBy: identity.name,
        recordedFunction: fn,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: input.kind === "WL_ENTREE" ? "WATCHLIST_ENTRY_RECORDED" : "WATCHLIST_EXIT_RECORDED",
      resourceType: "CommitteeDecision",
      resourceId: d.id,
      entityId: cp.entityId,
      detail: { dateEffet: input.effectiveDate, comite: input.committeeDate, pv: input.reference.trim(), statut: status },
    });
  });
  return { status };
}
