import { getScoringModel, today } from "@/lib/rating-scale";
import { effectiveFormat } from "./statement-format";
import type { PrismaClient } from "@/generated/prisma";
import type { RatingInput, RatingResult } from "@/core/types";
import { hasRole, type Identity, type Role } from "./auth";
import { auditWithin } from "./audit";
import { draftAmounts, draftFinancials, draftToRequest, parseDraft, type CaseDraft, type CaseReprise } from "./case-input";
import { emptyFinancials, gridLinks, parseFinancials, type FinancialsDraft } from "@/financials/compute";
import { carryFinancials, loadCreditTypes, loadEntityTiers, loadPurposes, recordStatements, suggestedExercise, type ExerciseChoice } from "./financial-statements";
import { loadTree, tierOf } from "./scope";
import { activeWatchlistCap, caseLifts, loadClassification } from "./classification-store";
import { BASE_CURRENCY, convertToBase, FxError, type FxConversion } from "./fx";
import { executeRatingRun, RatingServiceError, simulateRating } from "./rating-service";
import { ratingRequestSchema } from "./schemas";
import { settingBool, settingInt, settingText } from "./settings";
import { loadCircuit } from "./workflow";
import {
  applyDecision,
  parseCaseWorkflow,
  pendingStepIndex,
  startWorkflow,
  stepBlocker,
  type CaseWorkflow,
  type WorkflowContext,
  type WorkflowRole,
} from "@/reference/workflow";

/**
 * Workflow des dossiers de notation.
 *
 *   DRAFT ──soumission──▶ SUBMITTED ──étape 1 … étape n──▶ VALIDATED
 *     ▲                       │ (rejet à n'importe quelle étape)
 *     └──── reprise ◀── REJECTED (motif obligatoire)
 *   DRAFT ──abandon──▶ CANCELLED
 *
 * Le circuit de validation (étapes, fonctions habilitées, rôles, seuils) est
 * paramétrable (src/reference/workflow.ts) et figé sur le dossier à sa
 * soumission. Par défaut : directeur du centre d'affaires, puis contre-étude.
 *
 * Règles :
 *  - la notation est calculée par le serveur à la soumission, à partir du
 *    brouillon enregistré, et figée (RatingRun immuable) ;
 *  - le valideur est distinct de l'auteur et de TOUT contributeur du dossier
 *    (enregistrements, soumission, décisions sur les propositions de l'IA) ;
 *  - une même personne ne décide que d'une étape ; chaque étape exige la
 *    fonction et le rôle paramétrés ; la délégation par montant relève le
 *    rôle de la dernière étape au-delà du seuil (devise de base) ;
 *  - seule une notation validée devient la note de la contrepartie ;
 *  - toutes les opérations passent par le client cloisonné : un dossier hors du
 *    périmètre est introuvable.
 */

export const CASE_STATUSES = ["DRAFT", "SUBMITTED", "VALIDATED", "REJECTED", "CANCELLED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "En cours de validation",
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
  input: { counterpartyId: string; modelId: string; asOfDate: string; purpose?: string; exercise?: ExerciseChoice; creditType?: string }
) {
  const model = await getScoringModel(input.modelId);
  if (!model) throw new CaseError(404, `Modèle inconnu : ${input.modelId}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) throw new CaseError(400, "Date d'arrêté au format AAAA-MM-JJ.");
  const counterparty = await db.counterparty.findUnique({ where: { id: input.counterpartyId } });
  if (!counterparty) throw new CaseError(404, "Client introuvable.");
  if (!counterparty.isActive) throw new CaseError(409, "Client désactivé : réactivez-le depuis sa fiche avant d'ouvrir un dossier.");
  const purposes = await loadPurposes(db);
  const purpose = input.purpose ? purposes.find((p) => p.code === input.purpose && p.active) : undefined;
  if (input.purpose && !purpose) throw new CaseError(400, `Motif de dossier inconnu ou inactif : ${input.purpose}.`);
  const creditTypeCode = input.creditType || purpose?.defaultCreditType || undefined;
  if (creditTypeCode && !(await loadCreditTypes(db)).some((t) => t.code === creditTypeCode && t.active)) {
    throw new CaseError(400, `Type de crédit inconnu ou inactif : ${creditTypeCode}.`);
  }
  if (input.exercise && input.exercise !== "CONSERVE" && input.exercise !== "SUIVANT") throw new CaseError(400, "Exercice : CONSERVE ou SUIVANT.");
  const open = await db.ratingCase.findFirst({
    where: { counterpartyId: counterparty.id, status: { in: ["DRAFT", "SUBMITTED"] } },
    select: { id: true },
  });
  if (open) throw new CaseError(409, `Un dossier est déjà en cours pour ce client (${open.id}).`);

  // Reprise : la dernière note VALIDÉE (un dossier rejeté se reprend par
  // « Reprendre le dossier »), et le référentiel des bilans du client.
  const previous = await db.ratingCase.findFirst({
    where: { counterpartyId: counterparty.id, modelId: model.modelId, status: "VALIDATED" },
    orderBy: { decidedAt: "desc" },
    select: { id: true, asOfDate: true, draftInput: true, run: { select: { finalGrade: true } } },
  });
  const statements = await db.financialStatement.findMany({
    where: { counterpartyId: counterparty.id },
    orderBy: { closingDate: "desc" },
    take: 6,
    select: { fiscalYear: true, closingDate: true, values: true, statementModel: true, certified: true },
  });
  const base = previous ? parseDraft(previous.draftInput, model, input.asOfDate) : parseDraft(null, model, input.asOfDate);
  const draft: CaseDraft = { ...base, asOfDate: input.asOfDate };
  let reprise: CaseReprise | undefined;
  if (previous || statements.length > 0) {
    const lastClosing = (previous ? base.financials.years[0]?.closingDate : "") || statements[0]?.closingDate;
    const exercise = input.exercise ?? suggestedExercise(lastClosing, input.asOfDate, purpose);
    const carry = carryFinancials(previous ? base.financials : null, statements, exercise, emptyFinancials());
    draft.financials = carry.financials;
    const linked = gridLinks(model.modelId);
    const pending = previous
      ? [
          ...model.criteria.filter((c) => !linked[c.code] && base.criteria[c.code] && base.criteria[c.code].status !== "MISSING").map((c) => c.code),
          ...(Object.values(base.amounts).some((v) => v.trim() !== "") ? ["AMOUNTS"] : []),
        ]
      : [];
    reprise = {
      fromCaseId: previous?.id ?? null,
      fromAsOfDate: previous?.asOfDate ?? null,
      fromGrade: previous?.run?.finalGrade ?? null,
      exercise,
      carriedYears: carry.carriedYears,
      toLoad: carry.toLoad,
      pending,
    };
    draft.reprise = reprise;
  } else {
    delete draft.reprise;
  }

  return db.$transaction(async (tx) => {
    const created = await tx.ratingCase.create({
      data: {
        counterpartyId: counterparty.id,
        modelId: model.modelId,
        asOfDate: input.asOfDate,
        draftInput: JSON.stringify(draft),
        createdBy: identity.name,
        purpose: purpose?.code ?? null,
        creditType: creditTypeCode ?? null,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "CASE_CREATED",
      resourceType: "RatingCase",
      resourceId: created.id,
      entityId: counterparty.entityId,
      detail: {
        counterpartyId: counterparty.id,
        modelId: model.modelId,
        asOfDate: input.asOfDate,
        purpose: purpose?.code ?? null,
        creditType: creditTypeCode ?? null,
        reprise: !!previous,
        ...(reprise ? { exercise: reprise.exercise, carriedYears: reprise.carriedYears, toLoad: reprise.toLoad, fromCaseId: reprise.fromCaseId } : {}),
      },
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

/**
 * Requête de notation validée par le schéma de l'API, à partir d'un brouillon.
 * Partagée par la soumission d'un dossier et la renotation par lot : un lot
 * calcule exactement ce qu'aurait calculé le dossier.
 */
export async function buildInput(db: PrismaClient, c: { id?: string; modelId: string; counterparty: { id?: string; currency: string } }, draft: CaseDraft) {
  const model = await getScoringModel(c.modelId);
  if (!model) throw new CaseError(500, "Version de modèle du dossier indisponible.");
  const { base, fx } = await convertAmounts(db, draft, c.counterparty.currency);
  const format = await effectiveFormat(today());
  // Critères de classement BAM et levées décidées en comité pour CE dossier
  // (une levée d'un dossier antérieur a expiré avec lui).
  const classification = await loadClassification(db);
  const lifts = c.id ? await caseLifts(db, c.id) : [];
  // Watch list en vigueur au calcul : plafond de son niveau (D-58).
  const watchlist = c.counterparty.id ? await activeWatchlistCap(db, c.counterparty.id) : null;
  const cumulNotch = await settingInt("WATCHLIST_CUMUL_NOTCH");
  const parsed = ratingRequestSchema.safeParse(
    draftToRequest(draft, model, base, { currency: c.counterparty.currency, format, classification, lifts, watchlist, cumulNotch })
  );
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
  return { result: await simulateRating(input), fx };
}

export async function submitCase(db: PrismaClient, identity: Identity, caseId: string, draft: CaseDraft) {
  const c = await loadCase(db, caseId);
  if (c.status !== "DRAFT") throw new CaseError(409, "Seul un brouillon se soumet.");
  const { circuit } = await loadCircuit();
  if (circuit.submitFunctions.length > 0 && (!identity.jobFunction || !circuit.submitFunctions.includes(identity.jobFunction))) {
    const labels = circuit.functions.filter((f) => circuit.submitFunctions.includes(f.code)).map((f) => f.labelFr);
    throw new CaseError(403, `La soumission revient à : ${labels.join(", ")}.`);
  }
  // Champs repris de la note précédente : confirmés ou modifiés avant la
  // soumission (paramétrable), pour qu'une ancienne appréciation ne passe pas
  // inaperçue dans la nouvelle note.
  if (draft.reprise && draft.reprise.pending.length > 0 && (await settingBool("WORKFLOW_CONFIRM_CARRIED_OVER"))) {
    const n = draft.reprise.pending.length;
    throw new CaseError(
      409,
      `${n} champ(s) repris de la note précédente à confirmer ou à mettre à jour avant la soumission : ${draft.reprise.pending.slice(0, 12).join(", ")}${n > 12 ? "…" : ""}.`
    );
  }
  const { input, fx } = await buildInput(db, c, draft);
  // Un dossier se soumet pour faire valider une NOTE : un calcul sans grade
  // (donnée critique manquante, couverture insuffisante) se complète, il ne se
  // valide pas — sinon une « absence de note » deviendrait la note officielle.
  // Bilan : exigé pour une grille standard (paramétrable) ; dès qu'il est
  // présent, ses contrôles bloquants s'appliquent, quelle que soit la grille.
  const model = await getScoringModel(c.modelId);
  if (model) {
    const fin = draftFinancials(draft, model, await effectiveFormat(today()));
    const required = model.routeFamily === "STANDARD" && (await settingBool("WORKFLOW_BALANCE_SHEET_REQUIRED"));
    if (required || fin.present[0]) {
      const blocking = fin.controls.filter((k) => k.status === "KO" && !k.key.startsWith("MOTIF_") && k.key !== "FRAICHEUR");
      if (blocking.length > 0) {
        throw new CaseError(
          409,
          `Bilan à compléter avant soumission : ${blocking.slice(0, 5).map((k) => `${k.labelFr} — ${k.detailFr}`).join(" ; ")}`
        );
      }
    }
  }
  const check = await simulateRating(input);
  const workflow = await initialWorkflow({
    exposureBase: fx?.amounts.globalBankExposure?.base ?? input.segmentationData?.globalBankExposure ?? null,
    grade: check.finalGrade,
    creditType: c.creditType ?? null,
    tier: await caseTier(db, c.counterparty.entityId),
  });
  if (check.finalGrade === null) {
    throw new CaseError(
      409,
      `Le calcul ne produit pas de grade : complétez le dossier avant de le soumettre. ${check.explanationFr}` +
        // Le motif exact (critère du noyau obligatoire non instruit, routage…)
        // est nommé : « donnée critique manquante » seul laissait chercher.
        (check.blockingReasonsFr.length > 0 ? ` À compléter : ${check.blockingReasonsFr.slice(0, 6).join(" ; ")}` : "")
    );
  }
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
          workflow: JSON.stringify(workflow),
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
        detail: { runId, devise: fx?.currency ?? BASE_CURRENCY, cours: fx?.rate ?? 1, etapes: workflow.steps.map((st) => st.code) },
      });
    }, "CASE");
  } catch (e) {
    if (e instanceof RatingServiceError) throw new CaseError(e.status, e.message);
    throw e;
  }
}

/**
 * Catégorie de délégation du centre d'un client : la sienne ou celle d'une
 * entité mère ; à défaut, la première catégorie active du paramétrage
 * (« délégation normale ») — une catégorie s'attribue explicitement pour
 * durcir le circuit d'un centre.
 */
export async function caseTier(db: PrismaClient, entityId: string): Promise<string | null> {
  const own = tierOf(await loadTree(), entityId);
  if (own) return own;
  return (await loadEntityTiers(db)).find((t) => t.active)?.code ?? null;
}

/**
 * Rôle exigé pour valider un dossier soumis AVANT le circuit à étapes
 * (validation en une étape) : paramétrage et délégation par montant.
 */
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

/**
 * Circuit figé d'un nouveau dossier soumis : étapes applicables selon
 * l'exposition, la note calculée, le type de crédit et la catégorie de
 * délégation du centre (une donnée inconnue applique l'étape).
 */
export async function initialWorkflow(context: number | null | WorkflowContext): Promise<CaseWorkflow> {
  const { circuit } = await loadCircuit();
  const threshold = await settingInt("WORKFLOW_DELEGATION_THRESHOLD");
  const role = (await settingText("WORKFLOW_DELEGATION_ROLE")) as WorkflowRole;
  return startWorkflow(circuit, context, { threshold, role });
}

/**
 * Exposition du dossier dans la devise de base : conversion consignée à la
 * soumission, à défaut montant saisi (écran) ou transmis (API). Les deux formes
 * de dossier sont lues : un dossier créé par l'API ne doit pas échapper à la
 * délégation faute d'être lu au bon endroit.
 */
export function exposureOf(fxDetail: string | null, draftInput: string): number | null {
  try {
    if (fxDetail) {
      const fx = JSON.parse(fxDetail) as FxConversion;
      if (fx.amounts.globalBankExposure) return fx.amounts.globalBankExposure.base;
    }
    const d = JSON.parse(draftInput) as Partial<CaseDraft> & { apiRequest?: { segmentationData?: { globalBankExposure?: unknown } } };
    const api = d.apiRequest?.segmentationData?.globalBankExposure;
    if (api !== undefined && api !== null && Number.isFinite(Number(api))) return Number(api);
    const n = Number(String(d.amounts?.globalBankExposure ?? "").replace(/\s/g, "").replace(",", "."));
    return d.amounts?.globalBankExposure && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Circuit d'un dossier soumis : le circuit figé, ou — dossier soumis avant le
 * circuit à étapes — une validation en une étape au rôle paramétré.
 */
export async function caseWorkflow(c: { workflow?: string | null; fxDetail: string | null; draftInput: string }): Promise<CaseWorkflow> {
  const frozen = parseCaseWorkflow(c.workflow);
  if (frozen) return frozen;
  const exposure = exposureOf(c.fxDetail, c.draftInput);
  const { role } = await requiredValidatorRole(exposure);
  return {
    circuitVersion: 0,
    exposureBase: exposure,
    steps: [{ code: "VALIDATION", labelFr: "Validation", functions: [], functionLabels: [], minRole: role === "ADMIN" ? "ADMIN" : "RISK_MANAGER" }],
    decisions: [],
  };
}

/** Ce qui empêche une identité de décider de l'étape en attente, ou null si elle le peut. */
export async function validationBlocker(
  db: PrismaClient,
  identity: Identity,
  c: { id: string; status: string; fxDetail: string | null; draftInput: string; workflow?: string | null }
): Promise<string | null> {
  if (c.status !== "SUBMITTED") return "le dossier n'est pas en attente de validation";
  const w = await caseWorkflow(c);
  const contributors = await contributorsOf(db, c.id);
  return stepBlocker(w, { name: identity.name, role: identity.role, jobFunction: identity.jobFunction ?? null }, contributors);
}

export async function decideCase(
  db: PrismaClient,
  identity: Identity,
  caseId: string,
  decision: "VALIDATED" | "REJECTED",
  comment: string | undefined
): Promise<{ status: "SUBMITTED" | "VALIDATED" | "REJECTED"; stepFr: string; nextStepFr: string | null; opinion?: "FAVORABLE" | "DEFAVORABLE" }> {
  const c = await loadCase(db, caseId);
  const blocker = await validationBlocker(db, identity, c);
  if (blocker) throw new CaseError(403, `Décision impossible : ${blocker}.`);
  const motif = (comment ?? "").trim();
  if (decision === "REJECTED" && motif.length < 10) {
    throw new CaseError(400, "Motif de rejet obligatoire (10 caractères au moins).");
  }
  const w = await caseWorkflow(c);
  const before = pendingStepIndex(w);
  const now = new Date();
  const applied = applyDecision(
    w,
    { name: identity.name, role: identity.role, jobFunction: identity.jobFunction ?? null },
    decision === "VALIDATED" ? "APPROVED" : "REJECTED",
    motif || null,
    now
  );
  const nextIndex = pendingStepIndex(applied.workflow);
  await db.$transaction(async (tx) => {
    // La garde porte sur le circuit lu : deux valideurs de la même étape ne
    // peuvent pas décider tous les deux (le second voit un circuit changé).
    const updated = await tx.ratingCase.updateMany({
      where: { id: caseId, status: "SUBMITTED", workflow: c.workflow ?? null },
      data: applied.final
        ? { status: applied.status, decidedBy: identity.name, decidedAt: now, decisionComment: motif || null, workflow: JSON.stringify(applied.workflow) }
        : { workflow: JSON.stringify(applied.workflow) },
    });
    if (updated.count === 0) throw new CaseError(409, "Dossier déjà décidé à cette étape par un autre valideur.");
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action:
        applied.status === "VALIDATED"
          ? "CASE_VALIDATED"
          : applied.status === "REJECTED"
            ? "CASE_REJECTED"
            : applied.step.kind === "AVIS"
              ? "CASE_STEP_OPINION"
              : "CASE_STEP_APPROVED",
      resourceType: "RatingCase",
      resourceId: caseId,
      entityId: c.counterparty.entityId,
      detail: {
        runId: c.runId,
        etape: applied.step.code,
        libelleEtape: applied.step.labelFr,
        nature: applied.step.kind ?? "VALIDATION",
        avis: applied.step.kind === "AVIS" ? (decision === "VALIDATED" ? "FAVORABLE" : "DEFAVORABLE") : undefined,
        rang: (before ?? 0) + 1,
        etapes: w.steps.length,
        fonction: identity.jobFunction ?? undefined,
        motif: motif || undefined,
      },
    });
    // Note validée : ses bilans entrent au référentiel du client ; le prochain
    // dossier en reprendra N−1 et N−2.
    if (applied.status === "VALIDATED") {
      let financials: FinancialsDraft | null = null;
      try {
        financials = parseFinancials((JSON.parse(c.draftInput) as { financials?: unknown }).financials);
      } catch {
        financials = null;
      }
      if (financials) {
        const run = c.runId ? await tx.ratingRun.findUnique({ where: { id: c.runId }, select: { inputSnapshot: true } }) : null;
        let formatVersion: string | undefined;
        try {
          formatVersion = (JSON.parse(run?.inputSnapshot ?? "{}") as { financialBasis?: { formatVersion?: string } }).financialBasis?.formatVersion;
        } catch {
          formatVersion = undefined;
        }
        await recordStatements(tx, { id: c.id, counterpartyId: c.counterpartyId, runId: c.runId, currency: c.counterparty.currency, actor: identity.name, financials, formatVersion });
      }
    }
  });
  return {
    status: applied.status,
    stepFr: applied.step.labelFr,
    nextStepFr: nextIndex !== null ? applied.workflow.steps[nextIndex].labelFr : null,
    ...(applied.step.kind === "AVIS" ? { opinion: decision === "VALIDATED" ? ("FAVORABLE" as const) : ("DEFAVORABLE" as const) } : {}),
  };
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
  if (open) throw new CaseError(409, `Un dossier est déjà en cours pour ce client (${open.id}).`);
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
 * Filtre Prisma des notations officielles (même règle qu'`isOfficialRun`) :
 * validées, ou antérieures au workflow. Une notation de renotation par lot
 * n'a pas de dossier mais ne fait jamais foi : c'est une surveillance.
 */
export const OFFICIAL_RUN_WHERE = {
  OR: [
    { ratingCase: { is: null }, origin: { not: "BATCH" } },
    { ratingCase: { is: { status: "VALIDATED" } } },
  ],
};

/**
 * Une notation fait foi si elle est validée, ou si elle précède le workflow
 * (notations historiques, sans dossier), hors renotation par lot.
 */
export function isOfficialRun(run: { ratingCase: { status: string } | null; origin: string }): boolean {
  if (run.ratingCase) return run.ratingCase.status === "VALIDATED";
  return run.origin !== "BATCH";
}
