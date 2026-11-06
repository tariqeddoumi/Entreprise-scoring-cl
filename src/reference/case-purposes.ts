/**
 * Motifs d'ouverture d'un dossier de notation — liste paramétrable
 * (Administration › Paramétrage), consignée sur chaque dossier.
 *
 * Les deux événements les plus fréquents d'une entreprise : le renouvellement
 * annuel des crédits de fonctionnement (court terme) et, à tout moment de
 * l'année, une demande de crédit d'investissement.
 */

export interface CasePurpose {
  code: string;
  labelFr: string;
  active: boolean;
  /** Exercice proposé par défaut à l'ouverture : suivant si disponible, ou conserver. */
  defaultExercise?: "SUIVANT" | "CONSERVE";
  /** Type de crédit proposé par défaut. */
  defaultCreditType?: string;
}

/** Élément d'une liste paramétrable simple (types de crédit, catégories de délégation). */
export interface RefItem {
  code: string;
  labelFr: string;
  active: boolean;
  /** Aide affichée (critères d'attribution d'une catégorie, par exemple). */
  helpFr?: string;
}

export const CREDIT_TYPES_KEY = "CREDIT_TYPES";
export const ENTITY_TIERS_KEY = "ENTITY_TIERS";

/** Types de crédit du dossier : condition possible des étapes du circuit. */
export const DEFAULT_CREDIT_TYPES: RefItem[] = [
  { code: "FONCTIONNEMENT", labelFr: "Crédits de fonctionnement (court terme)", active: true },
  { code: "INVESTISSEMENT", labelFr: "Crédit d'investissement (moyen et long terme)", active: true },
  { code: "CREDIT_BAIL", labelFr: "Crédit-bail", active: true },
  { code: "PROMOTION_IMMOBILIERE", labelFr: "Promotion immobilière", active: true },
  { code: "ENGAGEMENTS_SIGNATURE", labelFr: "Engagements par signature (cautions, crédits documentaires)", active: true },
  { code: "AUTRE", labelFr: "Autre", active: true },
];

/**
 * Catégories de délégation d'un centre d'affaires (ou d'une entité). Bonne
 * pratique : délégation proportionnée à la qualité de la gestion du risque du
 * centre — taille et complexité du portefeuille, sinistralité (créances en
 * souffrance, coût du risque), taux de dérogations et de rejets en
 * contre-étude, constats d'audit — revue au moins une fois par an. La catégorie
 * rend bloquant l'avis du directeur ou ajoute des niveaux de décision.
 */
export const DEFAULT_ENTITY_TIERS: RefItem[] = [
  { code: "NORMALE", labelFr: "Délégation normale", active: true, helpFr: "Portefeuille sain, sinistralité inférieure à la moyenne du réseau, pas de constat d'audit majeur." },
  { code: "ENCADREE", labelFr: "Délégation encadrée", active: true, helpFr: "Sinistralité supérieure à la moyenne, dérogations ou rejets fréquents, ou centre récent : l'avis du directeur devient bloquant." },
  { code: "RESTREINTE", labelFr: "Délégation restreinte", active: true, helpFr: "Sinistralité élevée ou constat d'audit majeur : avis bloquant, décision à un niveau supérieur selon le circuit." },
];

export function checkRefItems(list: RefItem[], what: string): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!list.some((p) => p.active)) errors.push(`${what} : au moins un élément actif.`);
  for (const p of list) {
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(p.code)) errors.push(`${what} : code non admis « ${p.code} » (majuscules, chiffres, _).`);
    if (seen.has(p.code)) errors.push(`${what} : code en double ${p.code}.`);
    seen.add(p.code);
    if (!p.labelFr.trim() || p.labelFr.length > 200) errors.push(`${what} ${p.code} : libellé de 1 à 200 caractères.`);
    if (p.helpFr && p.helpFr.length > 500) errors.push(`${what} ${p.code} : aide de 500 caractères au plus.`);
  }
  return errors;
}

export function parseRefItems(raw: string | null | undefined, fallback: RefItem[]): RefItem[] {
  if (!raw) return fallback;
  try {
    const list = JSON.parse(raw) as RefItem[];
    return Array.isArray(list) && checkRefItems(list, "liste").length === 0 ? list : fallback;
  } catch {
    return fallback;
  }
}

export const CASE_PURPOSES_KEY = "CASE_PURPOSES";

export type ExerciseChoice = "CONSERVE" | "SUIVANT";

export const DEFAULT_PURPOSES: CasePurpose[] = [
  { code: "RENOUVELLEMENT_CT", labelFr: "Renouvellement annuel des crédits de fonctionnement", active: true, defaultExercise: "SUIVANT", defaultCreditType: "FONCTIONNEMENT" },
  { code: "INVESTISSEMENT", labelFr: "Demande de crédit d'investissement", active: true, defaultCreditType: "INVESTISSEMENT" },
  { code: "NOUVELLE_RELATION", labelFr: "Entrée en relation", active: true },
  { code: "REVISION", labelFr: "Révision sur événement (alerte, incident, information nouvelle)", active: true },
  { code: "AUTRE", labelFr: "Autre motif", active: true },
];

export function checkPurposes(list: CasePurpose[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!list.some((p) => p.active)) errors.push("Au moins un motif actif.");
  for (const p of list) {
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(p.code)) errors.push(`Code de motif non admis : « ${p.code} » (majuscules, chiffres, _).`);
    if (seen.has(p.code)) errors.push(`Motif en double : ${p.code}.`);
    seen.add(p.code);
    if (!p.labelFr.trim() || p.labelFr.length > 200) errors.push(`Motif ${p.code} : libellé de 1 à 200 caractères.`);
  }
  return errors;
}

export function parsePurposes(raw: string | null | undefined): CasePurpose[] {
  if (!raw) return DEFAULT_PURPOSES;
  try {
    const list = JSON.parse(raw) as CasePurpose[];
    return Array.isArray(list) && checkPurposes(list).length === 0 ? list : DEFAULT_PURPOSES;
  } catch {
    return DEFAULT_PURPOSES;
  }
}

/** Date de clôture un an plus tard (fin de mois conservée : 2024-12-31 → 2025-12-31). */
export function nextClosing(closing: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(closing);
  if (!m) return "";
  const y = Number(m[1]) + 1;
  const month = Number(m[2]);
  const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), last);
  const lastPrev = new Date(Date.UTC(y - 1, month, 0)).getUTCDate();
  return `${y}-${m[2]}-${String(Number(m[3]) === lastPrev ? last : day).padStart(2, "0")}`;
}

/** Exercice proposé par défaut : suivant si sa clôture est passée à la date d'arrêté. */
export function suggestedExercise(lastClosing: string | null | undefined, asOfDate: string, purpose?: CasePurpose): ExerciseChoice {
  if (purpose?.defaultExercise === "CONSERVE") return "CONSERVE";
  if (!lastClosing) return "CONSERVE";
  const next = nextClosing(lastClosing);
  return next && next <= asOfDate ? "SUIVANT" : "CONSERVE";
}

