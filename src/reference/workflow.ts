/**
 * Circuit de validation des notations — paramétrable.
 *
 * Le circuit est une suite ordonnée d'étapes. Chaque étape désigne les
 * FONCTIONS habilitées (chargé d'affaires, directeur du centre d'affaires,
 * contre-étude…), un rôle minimal et, au besoin, un seuil d'exposition au-delà
 * duquel elle s'ajoute (comité de crédit, par exemple). La fonction est un
 * attribut métier de l'utilisateur, distinct de son niveau de droits (rôle).
 *
 * Circuit par défaut (Groupe Banque Populaire) : l'analyste ou le chargé
 * d'affaires instruit et soumet ; le directeur du centre d'affaires valide ; la
 * contre-étude valide en dernier ressort. Il se modifie à l'écran
 * (Administration › Paramétrage) ; un dossier soumis garde le circuit de sa
 * soumission, figé avec lui.
 *
 * Trois natures d'étape (D-57) :
 *  - AVIS : avis favorable ou défavorable, sans rejet ; bloquant ou non
 *    (bloquant, par exemple, pour les centres d'affaires d'une catégorie de
 *    délégation restreinte : taille, sinistralité du portefeuille) ;
 *  - DÉCISION : la contre-étude arrête la note. Plusieurs niveaux de décision
 *    peuvent être prévus (selon le montant, la note, le type de crédit) : seul
 *    le plus élevé qui s'applique décide, les niveaux inférieurs instruisent et
 *    rendent un avis bloquant. Une seule décision par dossier ;
 *  - VALIDATION : étape historique (valider ou rejeter), conservée pour les
 *    circuits enregistrés avant les avis.
 *
 * Règles invariantes, quel que soit le paramétrage :
 *  - un contributeur du dossier ne décide d'aucune étape ;
 *  - une même personne ne décide que d'une étape du dossier ;
 *  - un rejet, à n'importe quelle étape, clôt le dossier (motif obligatoire) ;
 *  - seule la dernière étape fait de la notation la note officielle.
 */

export type WorkflowRole = "ANALYST" | "RISK_MANAGER" | "ADMIN";
export const WORKFLOW_ROLES: readonly WorkflowRole[] = ["ANALYST", "RISK_MANAGER", "ADMIN"];
export const WORKFLOW_ROLE_LABELS: Record<WorkflowRole, string> = {
  ANALYST: "Analyste",
  RISK_MANAGER: "Gestionnaire des risques",
  ADMIN: "Administrateur",
};

/** Familles de profils (D-57) : saisie, validation commerciale, contre-étude, surveillance, consultation, administration. */
export type ProfileFamily = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export const PROFILE_FAMILIES: Record<ProfileFamily, string> = {
  P1: "P1 — Saisie (chargé d'affaires, analyste)",
  P2: "P2 — Validation commerciale (directeur du centre d'affaires)",
  P3: "P3 — Contre-étude (instruction, décision finale)",
  P4: "P4 — Surveillance des risques",
  P5: "P5 — Consultation, audit",
  P6: "P6 — Administration",
};

/** Droits attribuables à un profil, en plus des étapes du circuit qu'il valide. */
export const PERMISSIONS = {
  LEVER_CRITERE: "Enregistrer la levée d'un critère de classement (décision de comité)",
  CONFIRMER_LEVEE: "Confirmer une levée enregistrée par une autre personne",
  DECIDER_WL: "Enregistrer une décision de watch list (comité)",
  CONFIRMER_WL: "Confirmer une décision de watch list enregistrée par une autre personne",
  VOIR_SURVEILLANCE: "Consulter la surveillance du portefeuille (KRI, migrations, alertes) de son périmètre",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export interface WorkflowFunction {
  code: string;
  labelFr: string;
  /** Famille du profil ; absente : non classée (circuits antérieurs). */
  profile?: ProfileFamily;
  permissions?: Permission[];
}

export type StepKind = "AVIS" | "VALIDATION" | "DECISION";
export const STEP_KIND_LABELS: Record<StepKind, string> = {
  AVIS: "Avis",
  VALIDATION: "Validation (valider ou rejeter)",
  DECISION: "Décision (contre-étude)",
};

export interface WorkflowStep {
  code: string;
  labelFr: string;
  /** Fonctions habilitées ; vide : toute fonction, sous réserve du rôle. */
  functions: string[];
  minRole: WorkflowRole;
  /** Nature ; absente : VALIDATION (circuits antérieurs). */
  kind?: StepKind;
  /** Avis : la suite attend cet avis. */
  blocking?: boolean;
  /** Avis : bloquant pour les centres de ces catégories de délégation. */
  blockingTiers?: string[];
  // --- Conditions d'application (aucune : l'étape s'applique toujours) ---
  /** Au-delà de cette exposition (devise de base). */
  aboveExposure?: number | null;
  /** Note égale ou moins bonne que cette classe (1 à 10 ; défaut = 11). */
  minGrade?: number | null;
  /** Types de crédit concernés. */
  creditTypes?: string[];
  /** Catégories de délégation du centre concernées. */
  tiers?: string[];
  /** Combinaison des conditions : l'une suffit (défaut) ou toutes. */
  conditionMode?: "ANY" | "ALL";
  /** Niveau de décision inférieur converti en instruction (circuit figé). */
  instruction?: boolean;
}

export interface WorkflowCircuit {
  version: number;
  /** Fonctions qui peuvent soumettre ; vide : toute personne habilitée à noter. */
  submitFunctions: string[];
  functions: WorkflowFunction[];
  steps: WorkflowStep[];
}

export const DEFAULT_FUNCTIONS: WorkflowFunction[] = [
  { code: "CHARGE_AFFAIRES", labelFr: "Chargé d'affaires", profile: "P1" },
  { code: "ANALYSTE", labelFr: "Analyste crédit", profile: "P1" },
  { code: "DIRECTEUR_CA", labelFr: "Directeur du centre d'affaires", profile: "P2", permissions: ["VOIR_SURVEILLANCE"] },
  { code: "CONTRE_ETUDE", labelFr: "Contre-étude (Risques)", profile: "P3", permissions: ["LEVER_CRITERE", "CONFIRMER_LEVEE", "VOIR_SURVEILLANCE"] },
  { code: "RESPONSABLE_CE", labelFr: "Responsable de la contre-étude", profile: "P3", permissions: ["LEVER_CRITERE", "CONFIRMER_LEVEE", "VOIR_SURVEILLANCE"] },
  { code: "DIRECTEUR_RISQUES", labelFr: "Directeur des risques", profile: "P3", permissions: ["LEVER_CRITERE", "CONFIRMER_LEVEE", "CONFIRMER_WL", "VOIR_SURVEILLANCE"] },
  { code: "SURVEILLANCE", labelFr: "Surveillance des risques", profile: "P4", permissions: ["LEVER_CRITERE", "CONFIRMER_LEVEE", "DECIDER_WL", "CONFIRMER_WL", "VOIR_SURVEILLANCE"] },
  { code: "COMITE_CREDIT", labelFr: "Comité de crédit", profile: "P3" },
];

/**
 * Circuit par défaut : avis du directeur du centre d'affaires (non bloquant,
 * bloquant pour les centres en délégation encadrée ou restreinte), puis
 * décision de la contre-étude ; au-delà de 20 MDH ou pour une note de 8 ou
 * moins bonne, la décision remonte au responsable de la contre-étude. Seuils
 * proposés, à paramétrer.
 */
export const DEFAULT_CIRCUIT: WorkflowCircuit = {
  version: 1,
  submitFunctions: [],
  functions: DEFAULT_FUNCTIONS,
  steps: [
    { code: "DIRECTEUR_CA", labelFr: "Avis du directeur du centre d'affaires", functions: ["DIRECTEUR_CA"], minRole: "ANALYST", kind: "AVIS", blocking: false, blockingTiers: ["ENCADREE", "RESTREINTE"] },
    { code: "CONTRE_ETUDE", labelFr: "Contre-étude : décision", functions: ["CONTRE_ETUDE", "RESPONSABLE_CE"], minRole: "RISK_MANAGER", kind: "DECISION" },
    { code: "RESPONSABLE_CE", labelFr: "Responsable de la contre-étude : décision", functions: ["RESPONSABLE_CE", "DIRECTEUR_RISQUES"], minRole: "RISK_MANAGER", kind: "DECISION", aboveExposure: 20_000_000, minGrade: 8, conditionMode: "ANY" },
  ],
};

/** Droit d'une fonction (profil) ; une fonction inconnue n'a aucun droit. */
export function hasPermission(circuit: WorkflowCircuit, jobFunction: string | null | undefined, perm: Permission): boolean {
  if (!jobFunction) return false;
  return !!circuit.functions.find((f) => f.code === jobFunction)?.permissions?.includes(perm);
}

/** Fonctions qui détiennent un droit (libellés, pour les messages). */
export function holdersOf(circuit: WorkflowCircuit, perm: Permission): WorkflowFunction[] {
  return circuit.functions.filter((f) => f.permissions?.includes(perm));
}

const hasConditions = (s: WorkflowStep) =>
  (s.aboveExposure != null && s.aboveExposure > 0) || (s.minGrade != null && s.minGrade > 0) || (s.creditTypes?.length ?? 0) > 0 || (s.tiers?.length ?? 0) > 0;

export const MAX_STEPS = 6;
const CODE_RE = /^[A-Z][A-Z0-9_]{1,31}$/;

/** Contrôle d'un circuit avant enregistrement ; liste vide si valide. */
export function checkCircuit(c: WorkflowCircuit): string[] {
  const issues: string[] = [];
  const fnCodes = new Set<string>();
  if (!Array.isArray(c.functions) || c.functions.length === 0) issues.push("Au moins une fonction est requise.");
  for (const f of c.functions ?? []) {
    if (!CODE_RE.test(f.code ?? "")) issues.push(`Code de fonction invalide : « ${f.code} » (majuscules, chiffres, _).`);
    if (fnCodes.has(f.code)) issues.push(`Fonction en double : ${f.code}.`);
    fnCodes.add(f.code);
    if (!f.labelFr?.trim()) issues.push(`Libellé manquant pour la fonction ${f.code}.`);
  }
  if (!Array.isArray(c.steps) || c.steps.length === 0) issues.push("Le circuit comporte au moins une étape de validation.");
  if ((c.steps ?? []).length > MAX_STEPS) issues.push(`${MAX_STEPS} étapes au plus.`);
  const stepCodes = new Set<string>();
  for (const [i, s] of (c.steps ?? []).entries()) {
    const n = `Étape ${i + 1}`;
    if (!CODE_RE.test(s.code ?? "")) issues.push(`${n} : code invalide « ${s.code} ».`);
    if (stepCodes.has(s.code)) issues.push(`${n} : code en double (${s.code}).`);
    stepCodes.add(s.code);
    if (!s.labelFr?.trim()) issues.push(`${n} : libellé manquant.`);
    if (!WORKFLOW_ROLES.includes(s.minRole)) issues.push(`${n} : rôle minimal invalide.`);
    for (const f of s.functions ?? []) if (!fnCodes.has(f)) issues.push(`${n} : fonction inconnue ${f}.`);
    if (s.aboveExposure != null && (!Number.isFinite(s.aboveExposure) || s.aboveExposure < 0)) issues.push(`${n} : seuil d'exposition invalide.`);
    if (s.kind && !["AVIS", "VALIDATION", "DECISION"].includes(s.kind)) issues.push(`${n} : nature invalide.`);
    if (s.minGrade != null && (!Number.isInteger(s.minGrade) || s.minGrade < 1 || s.minGrade > 11)) issues.push(`${n} : classe de note entre 1 et 10 (11 : défaut).`);
    if (s.conditionMode && !["ANY", "ALL"].includes(s.conditionMode)) issues.push(`${n} : combinaison des conditions invalide.`);
    if (s.kind !== "AVIS" && ((s.blockingTiers?.length ?? 0) > 0 || s.blocking === false)) issues.push(`${n} : seul un avis peut être non bloquant.`);
  }
  for (const f of c.functions ?? []) {
    if (f.profile && !(f.profile in PROFILE_FAMILIES)) issues.push(`Profil inconnu pour ${f.code}.`);
    for (const p of f.permissions ?? []) if (!(p in PERMISSIONS)) issues.push(`Droit inconnu pour ${f.code} : ${p}.`);
  }
  const all = c.steps ?? [];
  const firstDecision = all.findIndex((s) => s.kind === "DECISION");
  if (firstDecision >= 0) {
    if (all.slice(firstDecision).some((s) => s.kind !== "DECISION")) issues.push("Les étapes de décision viennent en dernier : un avis ou une validation ne peut pas suivre une décision.");
    if (!all.some((s) => s.kind === "DECISION" && !hasConditions(s))) issues.push("Au moins une étape de décision sans condition : sinon un dossier pourrait n'avoir aucun décideur.");
  } else if (all.length > 0 && all.every((s) => s.kind === "AVIS")) {
    issues.push("Le circuit comporte au moins une étape de décision ou de validation.");
  }
  const steps = c.steps ?? [];
  const last = steps[steps.length - 1];
  if (last && last.aboveExposure != null && last.aboveExposure > 0 && steps.every((s) => s.aboveExposure != null && s.aboveExposure > 0)) {
    issues.push("Toutes les étapes sont conditionnées par un seuil : un dossier sous les seuils n'aurait aucun valideur.");
  }
  for (const f of c.submitFunctions ?? []) if (!fnCodes.has(f)) issues.push(`Fonction de soumission inconnue : ${f}.`);
  return [...new Set(issues)];
}

export function parseCircuit(raw: string | null | undefined): WorkflowCircuit | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as WorkflowCircuit;
    if (!c || !Array.isArray(c.steps) || !Array.isArray(c.functions)) return null;
    return {
      version: Number(c.version) || 1,
      submitFunctions: Array.isArray(c.submitFunctions) ? c.submitFunctions : [],
      functions: c.functions,
      steps: c.steps.map((s) => ({ ...s, functions: Array.isArray(s.functions) ? s.functions : [] })),
    };
  } catch {
    return null;
  }
}

// --- Circuit figé sur un dossier ------------------------------------------------

export interface StepDecision {
  step: string;
  /** APPROVED / REJECTED : validation ou décision ; FAVORABLE / DEFAVORABLE : avis. */
  decision: "APPROVED" | "REJECTED" | "FAVORABLE" | "DEFAVORABLE";
  by: string;
  role: string;
  jobFunction: string | null;
  at: string;
  comment: string | null;
}

/** Étape figée : nature et caractère bloquant résolus pour ce dossier. */
export type FrozenStep = WorkflowStep & { functionLabels: string[] };

/** Circuit figé à la soumission : étapes applicables au dossier et décisions. */
export interface CaseWorkflow {
  circuitVersion: number;
  exposureBase: number | null;
  /** Éléments qui ont déterminé les étapes (note, type de crédit, catégorie du centre). */
  context?: { grade: string | null; creditType: string | null; tier: string | null };
  steps: FrozenStep[];
  decisions: StepDecision[];
}

const ROLE_ORDER: Record<string, number> = { READONLY: 0, ANALYST: 1, RISK_MANAGER: 2, ADMIN: 3 };
const atLeast = (role: string, min: string) => (ROLE_ORDER[role] ?? -1) >= (ROLE_ORDER[min] ?? 99);

/** Rang d'une note (1 à 10 ; défaut DEF : 11 ; inconnue : null). */
export function gradeRankOf(grade: string | null | undefined): number | null {
  if (!grade) return null;
  if (/^DEF/.test(grade)) return 11;
  const n = Number(grade);
  return Number.isInteger(n) ? n : null;
}

export interface WorkflowContext {
  exposureBase: number | null;
  grade?: string | null;
  creditType?: string | null;
  tier?: string | null;
}

/**
 * L'étape s'applique-t-elle ? Une donnée inconnue (exposition, note, type de
 * crédit, catégorie) remplit la condition : un renseignement manquant ne doit
 * jamais alléger le circuit.
 */
export function stepApplies(s: WorkflowStep, ctx: WorkflowContext): boolean {
  const tests: boolean[] = [];
  if (s.aboveExposure != null && s.aboveExposure > 0) tests.push(ctx.exposureBase === null || ctx.exposureBase > s.aboveExposure);
  if (s.minGrade != null && s.minGrade > 0) {
    const r = gradeRankOf(ctx.grade ?? null);
    tests.push(r === null || r >= s.minGrade);
  }
  if ((s.creditTypes?.length ?? 0) > 0) tests.push(!ctx.creditType || s.creditTypes!.includes(ctx.creditType));
  if ((s.tiers?.length ?? 0) > 0) tests.push(!ctx.tier || s.tiers!.includes(ctx.tier));
  if (tests.length === 0) return true;
  return s.conditionMode === "ALL" ? tests.every(Boolean) : tests.some(Boolean);
}

/**
 * Étapes applicables à un dossier. Avec plusieurs niveaux de décision, seul le
 * plus élevé qui s'applique décide ; les niveaux inférieurs instruisent (avis
 * bloquant). Un avis est bloquant s'il est déclaré tel, ou pour un centre d'une
 * catégorie listée (catégorie inconnue : bloquant).
 *
 * La délégation par montant (paramètres historiques) relève le rôle minimal de
 * la dernière étape au-delà de son seuil.
 */
export function startWorkflow(
  circuit: WorkflowCircuit,
  context: number | null | WorkflowContext,
  delegation?: { threshold: number; role: WorkflowRole }
): CaseWorkflow {
  const ctx: WorkflowContext = typeof context === "object" && context !== null ? context : { exposureBase: context };
  const labels = new Map(circuit.functions.map((f) => [f.code, f.labelFr]));
  const applicable = circuit.steps.filter((s) => stepApplies(s, ctx));
  const lastDecision = applicable.map((s) => s.kind).lastIndexOf("DECISION");
  const steps: FrozenStep[] = applicable.map((s, i) => {
    const base = { ...s, functions: [...s.functions], functionLabels: s.functions.map((f) => labels.get(f) ?? f) };
    if (s.kind === "DECISION" && i < lastDecision) return { ...base, kind: "AVIS" as const, blocking: true, instruction: true, blockingTiers: [] };
    if (s.kind === "AVIS") {
      const tierBlocks = (s.blockingTiers?.length ?? 0) > 0 && (!ctx.tier || s.blockingTiers!.includes(ctx.tier));
      return { ...base, blocking: !!s.blocking || tierBlocks };
    }
    return base;
  });
  if (delegation && delegation.threshold > 0 && steps.length > 0 && (ctx.exposureBase === null || ctx.exposureBase > delegation.threshold)) {
    const last = steps[steps.length - 1];
    if (!atLeast(last.minRole, delegation.role)) last.minRole = delegation.role;
  }
  return {
    circuitVersion: circuit.version,
    exposureBase: ctx.exposureBase,
    ...(typeof context === "object" && context !== null ? { context: { grade: ctx.grade ?? null, creditType: ctx.creditType ?? null, tier: ctx.tier ?? null } } : {}),
    steps,
    decisions: [],
  };
}

export function parseCaseWorkflow(raw: string | null | undefined): CaseWorkflow | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(raw) as CaseWorkflow;
    return w && Array.isArray(w.steps) && Array.isArray(w.decisions) ? w : null;
  } catch {
    return null;
  }
}

const isBlocking = (s: FrozenStep) => s.kind !== "AVIS" || !!s.blocking;

/** Le circuit est-il clos (rejet, décision, ou dernière étape bloquante validée) ? */
export function workflowClosed(w: CaseWorkflow): boolean {
  const done = new Map(w.decisions.map((d) => [d.step, d.decision]));
  if (w.decisions.some((d) => d.decision === "REJECTED")) return true;
  return w.steps.filter(isBlocking).every((s) => done.has(s.code));
}

/**
 * Étapes ouvertes : les avis non bloquants pas encore rendus et la première
 * étape bloquante en attente (dans l'ordre du circuit).
 */
export function openSteps(w: CaseWorkflow): number[] {
  if (workflowClosed(w)) return [];
  const done = new Set(w.decisions.map((d) => d.step));
  const out: number[] = [];
  for (const [i, s] of w.steps.entries()) {
    if (done.has(s.code)) continue;
    out.push(i);
    if (isBlocking(s)) break;
  }
  return out;
}

/** Étape bloquante en attente (index), ou null si le circuit est achevé. */
export function pendingStepIndex(w: CaseWorkflow): number | null {
  const open = openSteps(w);
  const i = open.find((k) => isBlocking(w.steps[k]));
  return i === undefined ? null : i;
}

export interface Actor {
  name: string;
  role: string;
  jobFunction: string | null;
}

function fits(step: FrozenStep, actor: Actor): boolean {
  if (!atLeast(actor.role, step.minRole)) return false;
  return step.functions.length === 0 || (!!actor.jobFunction && step.functions.includes(actor.jobFunction));
}

/** Étape ouverte que cet acteur peut traiter (la première), ou null. */
export function actorStepIndex(w: CaseWorkflow, actor: Actor): number | null {
  const i = openSteps(w).find((k) => fits(w.steps[k], actor));
  return i === undefined ? null : i;
}

/**
 * Ce qui empêche un acteur de traiter une étape ouverte, ou null.
 * Les contributeurs du dossier sont fournis par l'appelant (journal).
 */
export function stepBlocker(w: CaseWorkflow, actor: Actor, contributors: string[]): string | null {
  const open = openSteps(w);
  if (open.length === 0) return "le circuit de validation est achevé";
  const mine = actorStepIndex(w, actor);
  if (mine === null) {
    const step = w.steps[pendingStepIndex(w) ?? open[0]];
    if (!atLeast(actor.role, step.minRole)) return `rôle ${WORKFLOW_ROLE_LABELS[step.minRole as WorkflowRole] ?? step.minRole} au moins requis pour l'étape « ${step.labelFr} »`;
    return `l'étape « ${step.labelFr} » revient à : ${step.functionLabels.join(", ")}`;
  }
  if (contributors.includes(actor.name)) {
    return "vous avez contribué à ce dossier : la validation revient à une autre personne (séparation des fonctions)";
  }
  if (w.decisions.some((d) => d.by === actor.name)) return "vous avez déjà décidé d'une étape de ce dossier : l'étape suivante revient à une autre personne";
  return null;
}

/**
 * Applique la décision de l'acteur sur son étape ouverte. Un avis ne clôt
 * jamais le dossier ; une décision le clôt ; une validation (circuit antérieur)
 * le clôt si elle est rejetée ou si c'est la dernière étape bloquante.
 */
export function applyDecision(
  w: CaseWorkflow,
  actor: Actor,
  decision: "APPROVED" | "REJECTED",
  comment: string | null,
  at: Date
): { workflow: CaseWorkflow; step: FrozenStep; final: boolean; status: "SUBMITTED" | "VALIDATED" | "REJECTED" } {
  const i = actorStepIndex(w, actor) ?? pendingStepIndex(w);
  if (i === null) throw new Error("Circuit achevé.");
  const step = w.steps[i];
  const avis = step.kind === "AVIS";
  const recorded: StepDecision["decision"] = avis ? (decision === "APPROVED" ? "FAVORABLE" : "DEFAVORABLE") : decision;
  const next: CaseWorkflow = {
    ...w,
    decisions: [...w.decisions, { step: step.code, decision: recorded, by: actor.name, role: actor.role, jobFunction: actor.jobFunction, at: at.toISOString(), comment }],
  };
  if (avis) return { workflow: next, step, final: false, status: "SUBMITTED" };
  if (decision === "REJECTED") return { workflow: next, step, final: true, status: "REJECTED" };
  const final = step.kind === "DECISION" || workflowClosed(next);
  return { workflow: next, step, final, status: final ? "VALIDATED" : "SUBMITTED" };
}

/** Une étape ouverte s'adresse-t-elle à cet acteur (rôle et fonction, hors séparation) ? */
export function stepConcerns(w: CaseWorkflow, actor: Actor): boolean {
  if (actorStepIndex(w, actor) === null) return false;
  return !w.decisions.some((d) => d.by === actor.name);
}
