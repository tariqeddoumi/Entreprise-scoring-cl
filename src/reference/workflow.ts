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

export interface WorkflowFunction {
  code: string;
  labelFr: string;
}

export interface WorkflowStep {
  code: string;
  labelFr: string;
  /** Fonctions habilitées ; vide : toute fonction, sous réserve du rôle. */
  functions: string[];
  minRole: WorkflowRole;
  /** L'étape ne s'applique qu'au-delà de cette exposition (devise de base). */
  aboveExposure?: number | null;
}

export interface WorkflowCircuit {
  version: number;
  /** Fonctions qui peuvent soumettre ; vide : toute personne habilitée à noter. */
  submitFunctions: string[];
  functions: WorkflowFunction[];
  steps: WorkflowStep[];
}

export const DEFAULT_FUNCTIONS: WorkflowFunction[] = [
  { code: "CHARGE_AFFAIRES", labelFr: "Chargé d'affaires" },
  { code: "ANALYSTE", labelFr: "Analyste crédit" },
  { code: "DIRECTEUR_CA", labelFr: "Directeur du centre d'affaires" },
  { code: "CONTRE_ETUDE", labelFr: "Contre-étude (Risques)" },
  { code: "COMITE_CREDIT", labelFr: "Comité de crédit" },
];

export const DEFAULT_CIRCUIT: WorkflowCircuit = {
  version: 1,
  submitFunctions: [],
  functions: DEFAULT_FUNCTIONS,
  steps: [
    { code: "DIRECTEUR_CA", labelFr: "Validation du directeur du centre d'affaires", functions: ["DIRECTEUR_CA"], minRole: "ANALYST" },
    { code: "CONTRE_ETUDE", labelFr: "Contre-étude : validation finale", functions: ["CONTRE_ETUDE"], minRole: "RISK_MANAGER" },
  ],
};

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
  decision: "APPROVED" | "REJECTED";
  by: string;
  role: string;
  jobFunction: string | null;
  at: string;
  comment: string | null;
}

/** Circuit figé à la soumission : étapes applicables au dossier et décisions. */
export interface CaseWorkflow {
  circuitVersion: number;
  exposureBase: number | null;
  steps: Array<WorkflowStep & { functionLabels: string[] }>;
  decisions: StepDecision[];
}

const ROLE_ORDER: Record<string, number> = { READONLY: 0, ANALYST: 1, RISK_MANAGER: 2, ADMIN: 3 };
const atLeast = (role: string, min: string) => (ROLE_ORDER[role] ?? -1) >= (ROLE_ORDER[min] ?? 99);

/**
 * Étapes applicables à un dossier : celles sans seuil, plus celles dont le
 * seuil est dépassé. Une exposition inconnue applique TOUTES les étapes : un
 * montant manquant ne doit jamais alléger le circuit.
 *
 * La délégation par montant (paramètres historiques) relève le rôle minimal de
 * la dernière étape au-delà de son seuil.
 */
export function startWorkflow(
  circuit: WorkflowCircuit,
  exposureBase: number | null,
  delegation?: { threshold: number; role: WorkflowRole }
): CaseWorkflow {
  const labels = new Map(circuit.functions.map((f) => [f.code, f.labelFr]));
  const steps = circuit.steps
    .filter((s) => !(s.aboveExposure && s.aboveExposure > 0) || exposureBase === null || exposureBase > s.aboveExposure)
    .map((s) => ({ ...s, functions: [...s.functions], functionLabels: s.functions.map((f) => labels.get(f) ?? f) }));
  if (delegation && delegation.threshold > 0 && steps.length > 0 && (exposureBase === null || exposureBase > delegation.threshold)) {
    const last = steps[steps.length - 1];
    if (!atLeast(last.minRole, delegation.role)) last.minRole = delegation.role;
  }
  return { circuitVersion: circuit.version, exposureBase, steps, decisions: [] };
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

/** Étape en attente (index), ou null si le circuit est achevé. */
export function pendingStepIndex(w: CaseWorkflow): number | null {
  const approved = w.decisions.filter((d) => d.decision === "APPROVED").length;
  if (w.decisions.some((d) => d.decision === "REJECTED")) return null;
  return approved < w.steps.length ? approved : null;
}

export interface Actor {
  name: string;
  role: string;
  jobFunction: string | null;
}

/**
 * Ce qui empêche un acteur de décider de l'étape en attente, ou null.
 * Les contributeurs du dossier sont fournis par l'appelant (journal).
 */
export function stepBlocker(w: CaseWorkflow, actor: Actor, contributors: string[]): string | null {
  const i = pendingStepIndex(w);
  if (i === null) return "le circuit de validation est achevé";
  const step = w.steps[i];
  if (!atLeast(actor.role, step.minRole)) return `rôle ${WORKFLOW_ROLE_LABELS[step.minRole] ?? step.minRole} au moins requis pour l'étape « ${step.labelFr} »`;
  if (step.functions.length > 0 && (!actor.jobFunction || !step.functions.includes(actor.jobFunction))) {
    return `l'étape « ${step.labelFr} » revient à : ${step.functionLabels.join(", ")}`;
  }
  if (contributors.includes(actor.name)) {
    return "vous avez contribué à ce dossier : la validation revient à une autre personne (séparation des fonctions)";
  }
  if (w.decisions.some((d) => d.by === actor.name)) return "vous avez déjà décidé d'une étape de ce dossier : l'étape suivante revient à une autre personne";
  return null;
}

/** Applique une décision ; renvoie le nouveau circuit et l'état du dossier. */
export function applyDecision(
  w: CaseWorkflow,
  actor: Actor,
  decision: "APPROVED" | "REJECTED",
  comment: string | null,
  at: Date
): { workflow: CaseWorkflow; step: WorkflowStep; final: boolean; status: "SUBMITTED" | "VALIDATED" | "REJECTED" } {
  const i = pendingStepIndex(w);
  if (i === null) throw new Error("Circuit achevé.");
  const step = w.steps[i];
  const next: CaseWorkflow = {
    ...w,
    decisions: [...w.decisions, { step: step.code, decision, by: actor.name, role: actor.role, jobFunction: actor.jobFunction, at: at.toISOString(), comment }],
  };
  if (decision === "REJECTED") return { workflow: next, step, final: true, status: "REJECTED" };
  const final = i === w.steps.length - 1;
  return { workflow: next, step, final, status: final ? "VALIDATED" : "SUBMITTED" };
}

/** Une étape s'adresse-t-elle à cet acteur (rôle et fonction, hors séparation) ? */
export function stepConcerns(w: CaseWorkflow, actor: Actor): boolean {
  const i = pendingStepIndex(w);
  if (i === null) return false;
  const step = w.steps[i];
  if (!atLeast(actor.role, step.minRole)) return false;
  if (step.functions.length > 0 && (!actor.jobFunction || !step.functions.includes(actor.jobFunction))) return false;
  return !w.decisions.some((d) => d.by === actor.name);
}
