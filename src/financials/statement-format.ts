import { parseAmount, POSTES, POSTE_BY_KEY, type PosteDef, type PosteSection, type YearValues } from "./chart";
import { FormulaError, identifiers, parseFormula } from "./formula";

/**
 * Format du bilan — paramétrage de ce que l'on charge et de la façon dont on
 * l'analyse, sans toucher au code.
 *
 * Le plan de postes de la banque (chart.ts) reste la référence commune : les
 * indicateurs et les ratios de la grille s'y rattachent. Le format décide :
 *  - pour chaque poste saisi : chargé ou non chargé ;
 *  - pour chaque total : calculé à partir de ses composantes (bilan détaillé)
 *    ou saisi directement (bilan agrégé : ses composantes ne sont plus
 *    demandées) ;
 *  - des postes complémentaires propres à la banque ;
 *  - des indicateurs complémentaires définis par formule ;
 *  - l'appréciation de chaque indicateur (sens, seuils bon / mauvais /
 *    critique, variation significative) ;
 *  - les alertes calculées dès le chargement du bilan (formules) ;
 *  - les seuils de la synthèse « situation financière ».
 *
 * Chaque format est une version datée : celle en vigueur à la date d'arrêté
 * du dossier s'applique et son identifiant est figé dans la notation.
 *
 * Module PUR : partagé par l'écran, le serveur et l'OCR intelligent.
 */

export type PosteMode = "CHARGE" | "MASQUE" | "CALCULE" | "SAISI";

export const POSTE_MODE_LABELS: Record<PosteMode, string> = {
  CHARGE: "Chargé",
  MASQUE: "Non chargé",
  CALCULE: "Calculé à partir du détail",
  SAISI: "Saisi directement (agrégé)",
};

export interface ExtraPoste {
  key: string;
  labelFr: string;
  section: PosteSection;
  onlyN?: boolean;
  hintFr?: string;
}

export type FormatUnit = "MAD" | "%" | "x" | "j";
export type FormatGroup = "AGREGATS" | "STRUCTURE" | "RENTABILITE" | "LIQUIDITE" | "ACTIVITE" | "REMBOURSEMENT";

export interface CustomIndicator {
  key: string;
  labelFr: string;
  unit: FormatUnit;
  group: FormatGroup;
  formula: string;
  onlyN?: boolean;
}

/**
 * Appréciation d'un indicateur. `sens` HAUSSE : plus haut est meilleur.
 * Seuils facultatifs ; sans seuil, seule la tendance est appréciée.
 * `variation` : variation relative (en %) au-delà de laquelle l'évolution est
 * une amélioration ou une dégradation.
 */
export interface Appreciation {
  sens: "HAUSSE" | "BAISSE";
  bon?: number;
  mauvais?: number;
  critique?: number;
  variation?: number;
}

export type AlertSeverity = "CRITIQUE" | "ALERTE";

export interface AlertRule {
  key: string;
  labelFr: string;
  condition: string;
  severity: AlertSeverity;
  referenceFr?: string;
  active: boolean;
}

export interface SynthesisThresholds {
  /** Situation critique : alertes critiques, ou indicateurs en zone critique. */
  critique: { alertesCritiques: number; indicateursCritiques: number };
  /** Situation dégradée. */
  degradee: { alertes: number; indicateursCritiques: number; indicateursMauvais: number };
  /** À surveiller. */
  surveiller: { alertes: number; indicateursMauvais: number; degradations: number };
}

export interface StatementFormat {
  version: string;
  effectiveFrom: string;
  labelFr: string;
  noteFr?: string;
  createdBy?: string;
  createdAt?: string;
  /** Mode par poste ; absent : chargé (poste) ou calculé (total). */
  postes: Record<string, PosteMode>;
  extraPostes: ExtraPoste[];
  /** Indicateurs masqués dans l'analyse (toujours calculés pour la grille). */
  hiddenIndicators: string[];
  customIndicators: CustomIndicator[];
  appreciations: Record<string, Appreciation>;
  alerts: AlertRule[];
  synthesis: SynthesisThresholds;
}

/** Variables utilisables dans les alertes, en plus des postes et indicateurs. */
export const FORMULA_VARIABLES: Record<string, string> = {
  MOIS_DEPUIS_CLOTURE: "Mois écoulés entre la clôture de l'exercice N et la date d'arrêté du dossier.",
  EXERCICES: "Nombre d'exercices chargés (1 à 3).",
};

// --- Format embarqué -------------------------------------------------------------

export const DEFAULT_APPRECIATIONS: Record<string, Appreciation> = {
  CA: { sens: "HAUSSE", variation: 10 },
  TOTAL_BILAN: { sens: "HAUSSE", variation: 15 },
  EBE: { sens: "HAUSSE", variation: 10 },
  EBE_RETRAITE: { sens: "HAUSSE", variation: 10 },
  RESULTAT_NET: { sens: "HAUSSE", variation: 15 },
  CAF: { sens: "HAUSSE", variation: 15 },
  FRNG: { sens: "HAUSSE", variation: 15 },
  BFR: { sens: "BAISSE", variation: 20 },
  TRESORERIE_NETTE: { sens: "HAUSSE", variation: 20 },
  DETTE_BRUTE: { sens: "BAISSE", variation: 15 },
  DETTE_NETTE: { sens: "BAISSE", variation: 15 },
  FPT: { sens: "HAUSSE", variation: 10 },
  AUTONOMIE_FINANCIERE: { sens: "HAUSSE", bon: 30, mauvais: 15, critique: 0, variation: 10 },
  FPT_TOTAL_BILAN: { sens: "HAUSSE", bon: 25, mauvais: 10, critique: 0, variation: 10 },
  GEARING: { sens: "BAISSE", bon: 1, mauvais: 2, critique: 3, variation: 15 },
  DETTE_NETTE_EBE: { sens: "BAISSE", bon: 2.5, mauvais: 4, critique: 6, variation: 15 },
  CROISSANCE_CA: { sens: "HAUSSE", bon: 5, mauvais: -10, critique: -50 },
  MARGE_EBE: { sens: "HAUSSE", bon: 10, mauvais: 5, critique: 0, variation: 10 },
  MARGE_NETTE: { sens: "HAUSSE", bon: 3, mauvais: 0, critique: -10, variation: 15 },
  ROA: { sens: "HAUSSE", bon: 3, mauvais: 0, critique: -5, variation: 15 },
  ROE: { sens: "HAUSSE", bon: 10, mauvais: 0, critique: -20, variation: 15 },
  LIQUIDITE_GENERALE: { sens: "HAUSSE", bon: 1.2, mauvais: 1, critique: 0.8, variation: 10 },
  LIQUIDITE_REDUITE: { sens: "HAUSSE", bon: 1, mauvais: 0.7, critique: 0.5, variation: 10 },
  DSO: { sens: "BAISSE", bon: 90, mauvais: 120, critique: 180, variation: 15 },
  DPO: { sens: "HAUSSE", variation: 20 },
  DIO: { sens: "BAISSE", bon: 90, mauvais: 180, critique: 270, variation: 15 },
  BFR_JOURS: { sens: "BAISSE", bon: 60, mauvais: 120, critique: 180, variation: 15 },
  COUVERTURE_INTERETS: { sens: "HAUSSE", bon: 4, mauvais: 2, critique: 1, variation: 15 },
  CFO: { sens: "HAUSSE", variation: 20 },
  CONVERSION_CFO_EBE: { sens: "HAUSSE", bon: 70, mauvais: 40, critique: 0 },
  CAPEX: { sens: "HAUSSE" },
  FCF: { sens: "HAUSSE", variation: 20 },
  FCF_DETTE: { sens: "HAUSSE", bon: 20, mauvais: 5, critique: 0 },
  SERVICE_DETTE: { sens: "BAISSE" },
  DSCR: { sens: "HAUSSE", bon: 1.5, mauvais: 1.2, critique: 1 },
};

/**
 * Alertes embarquées. Les critères chiffrés de la circulaire 1/W/2025 sont
 * restitués à titre d'information : ils ne changent pas la note (la prise en
 * compte dans la note relève de la classification, à arbitrer).
 */
export const DEFAULT_ALERTS: AlertRule[] = [
  { key: "RECUL_CA_50", labelFr: "Recul du chiffre d'affaires de 50 % ou plus sur un an", condition: "EVOL(CHIFFRE_AFFAIRES) <= -50", severity: "CRITIQUE", referenceFr: "BAM 1/W/2025, art. 5-5 — critère de créance sensible", active: true },
  { key: "ENDETTEMENT_3", labelFr: "Dettes financières supérieures à 3 fois les capitaux propres, ou capitaux propres négatifs", condition: "GEARING > 3 OU CAPITAUX_PROPRES <= 0", severity: "CRITIQUE", referenceFr: "BAM 1/W/2025, art. 5-5 — critère de créance sensible (5 fois pour un financement spécialisé)", active: true },
  { key: "DEFICITS_3_ANS", labelFr: "Trois exercices déficitaires sans augmentation de capital", condition: "RESULTAT_NET < 0 ET PREC(RESULTAT_NET) < 0 ET PREC(RESULTAT_NET; 2) < 0 ET CAPITAL <= PREC(CAPITAL; 2)", severity: "CRITIQUE", referenceFr: "BAM 1/W/2025, art. 5-5 — critère de créance sensible (entreprise d'au moins 5 ans : à vérifier)", active: true },
  { key: "CP_QUART_CAPITAL", labelFr: "Capitaux propres inférieurs au quart du capital social", condition: "CAPITAL > 0 ET CAPITAUX_PROPRES < CAPITAL / 4", severity: "CRITIQUE", referenceFr: "Loi 17-95, art. 357 ; BAM 1/W/2025 et 19/G/2002 — perte des trois quarts de la situation nette (réunion de l'AGE à vérifier)", active: true },
  { key: "COMPTES_NON_RECUS", labelFr: "Comptes de l'exercice suivant non reçus 7 mois après sa clôture", condition: "MOIS_DEPUIS_CLOTURE > 19", severity: "CRITIQUE", referenceFr: "BAM 1/W/2025, art. 5-2 — critère de créance sensible", active: true },
  { key: "EBE_NEGATIF", labelFr: "Excédent brut d'exploitation négatif", condition: "EBE < 0", severity: "ALERTE", active: true },
  { key: "RESULTAT_NEGATIF", labelFr: "Résultat net négatif", condition: "RESULTAT_NET < 0", severity: "ALERTE", active: true },
  { key: "RECUL_CA_20", labelFr: "Recul du chiffre d'affaires de plus de 20 % sur un an", condition: "EVOL(CHIFFRE_AFFAIRES) <= -20 ET EVOL(CHIFFRE_AFFAIRES) > -50", severity: "ALERTE", active: true },
  { key: "DSCR_INF_1", labelFr: "Flux d'exploitation insuffisants pour couvrir le service de la dette", condition: "DSCR < 1", severity: "ALERTE", active: true },
  { key: "FR_NEGATIF", labelFr: "Fonds de roulement négatif", condition: "FRNG < 0", severity: "ALERTE", active: true },
  { key: "TRESORERIE_DEGRADEE", labelFr: "Trésorerie nette négative et en dégradation", condition: "TRESORERIE_NETTE < 0 ET TRESORERIE_NETTE < PREC(TRESORERIE_NETTE)", severity: "ALERTE", active: true },
  { key: "DELAI_CLIENTS", labelFr: "Délai clients allongé de plus de 30 jours", condition: "DSO - PREC(DSO) > 30", severity: "ALERTE", active: true },
];

export const DEFAULT_SYNTHESIS: SynthesisThresholds = {
  critique: { alertesCritiques: 1, indicateursCritiques: 2 },
  degradee: { alertes: 2, indicateursCritiques: 1, indicateursMauvais: 3 },
  surveiller: { alertes: 1, indicateursMauvais: 1, degradations: 3 },
};

export const DEFAULT_FORMAT: StatementFormat = {
  version: "FORMAT-BILAN-2026.1",
  effectiveFrom: "2026-01-01",
  labelFr: "Bilan complet (plan de postes CGNC de la banque)",
  noteFr: "Format embarqué : tous les postes chargés, totaux calculés. Seuils d'appréciation proposés, à valider par les Risques.",
  postes: {},
  extraPostes: [],
  hiddenIndicators: [],
  customIndicators: [],
  appreciations: DEFAULT_APPRECIATIONS,
  alerts: DEFAULT_ALERTS,
  synthesis: DEFAULT_SYNTHESIS,
};

// --- Lecture du format -------------------------------------------------------------

export function posteMode(format: StatementFormat, key: string): PosteMode {
  const p = POSTE_BY_KEY.get(key);
  const m = format.postes[key];
  if (p?.kind === "TOTAL") return m === "SAISI" || m === "MASQUE" ? m : "CALCULE";
  return m === "MASQUE" ? "MASQUE" : "CHARGE";
}

export interface FormatPoste extends PosteDef {
  /** Le poste se saisit (ou se lit) ; sinon il est calculé. */
  input: boolean;
  extra?: boolean;
  /** Composante d'un total saisi directement : détail facultatif. */
  optionalDetail?: boolean;
}

/** Composantes directes et indirectes des totaux saisis directement. */
function underSaisi(format: StatementFormat): Set<string> {
  const out = new Set<string>();
  const walk = (key: string) => {
    for (const [k] of POSTE_BY_KEY.get(key)?.sum ?? []) {
      out.add(k);
      walk(k);
    }
  };
  for (const p of POSTES) if (p.kind === "TOTAL" && posteMode(format, p.key) === "SAISI") walk(p.key);
  return out;
}

function posteAvailable(format: StatementFormat, key: string): boolean {
  const p = POSTE_BY_KEY.get(key);
  if (!p) return format.extraPostes.some((e) => e.key === key);
  const mode = posteMode(format, key);
  if (p.kind === "TOTAL") return mode === "SAISI" || (mode === "CALCULE" && (p.sum ?? []).some(([k]) => posteAvailable(format, k)));
  return mode === "CHARGE";
}

/** Postes demandés par le format, dans l'ordre du plan, postes complémentaires en fin de section. */
export function formatPostes(format: StatementFormat): FormatPoste[] {
  const optional = underSaisi(format);
  const out: FormatPoste[] = [];
  const sections: PosteSection[] = [];
  for (const p of POSTES) if (!sections.includes(p.section)) sections.push(p.section);
  for (const s of sections) {
    for (const p of POSTES.filter((x) => x.section === s)) {
      if (!posteAvailable(format, p.key)) continue;
      const input = p.kind !== "TOTAL" || posteMode(format, p.key) === "SAISI";
      out.push({ ...p, input, ...(optional.has(p.key) ? { optionalDetail: true } : {}) });
    }
    for (const x of format.extraPostes.filter((e) => e.section === s)) {
      out.push({ key: x.key, labelFr: x.labelFr, section: x.section, kind: "INPUT", onlyN: x.onlyN, hintFr: x.hintFr, input: true, extra: true });
    }
  }
  return out;
}

/** Postes du plan sans valeur possible dans ce format (non chargés). */
export function unavailablePostes(format: StatementFormat): Set<string> {
  return new Set(POSTES.filter((p) => !posteAvailable(format, p.key)).map((p) => p.key));
}

/** Codes saisissables : postes chargés, totaux saisis, postes complémentaires. */
export function inputKeys(format: StatementFormat): string[] {
  return formatPostes(format)
    .filter((p) => p.input)
    .map((p) => p.key);
}

/**
 * Valeurs d'un exercice selon le format. Un total calculé n'existe que si l'une
 * de ses composantes est renseignée. Un total saisi prend la valeur saisie ; à
 * défaut, la somme de son détail. Un poste non chargé reste vide.
 */
export function computeYearWith(format: StatementFormat, values: Record<string, string>): YearValues {
  const out: YearValues = {};
  for (const p of POSTES) {
    if (p.kind === "TOTAL") continue;
    out[p.key] = posteAvailable(format, p.key) ? parseAmount(values[p.key]) : undefined;
  }
  for (const x of format.extraPostes) out[x.key] = parseAmount(values[x.key]);
  for (const p of POSTES) {
    if (p.kind !== "TOTAL" || !p.sum) continue;
    if (posteMode(format, p.key) === "MASQUE") {
      out[p.key] = undefined;
      continue;
    }
    let any = false;
    let total = 0;
    for (const [k, sign] of p.sum) {
      const v = out[k];
      if (v !== undefined) {
        any = true;
        total += sign * v;
      }
    }
    const typed = posteMode(format, p.key) === "SAISI" ? parseAmount(values[p.key]) : undefined;
    out[p.key] = typed ?? (any ? total : undefined);
  }
  return out;
}

/**
 * Totaux saisis directement dont le détail, renseigné aussi, ne retombe pas
 * sur le total : [code, total saisi, somme du détail].
 */
export function saisiMismatches(format: StatementFormat, values: Record<string, string>): Array<[string, number, number]> {
  const full = computeYearWith({ ...format, postes: Object.fromEntries(Object.entries(format.postes).filter(([, m]) => m !== "SAISI")) }, values);
  const out: Array<[string, number, number]> = [];
  for (const p of POSTES) {
    if (p.kind !== "TOTAL" || posteMode(format, p.key) !== "SAISI") continue;
    if ((p.sum ?? []).some(([k]) => !posteAvailable(format, k) && posteMode(format, k) !== "SAISI")) continue;
    const typed = parseAmount(values[p.key]);
    const sum = full[p.key];
    if (typed === undefined || sum === undefined) continue;
    if (Math.abs(typed - sum) > Math.max(1, Math.abs(typed) * 0.001)) out.push([p.key, typed, sum]);
  }
  return out;
}

/** Un exercice est renseigné dès qu'un code saisissable porte un montant. */
export function yearHasDataWith(format: StatementFormat, values: Record<string, string> | undefined): boolean {
  if (!values) return false;
  return inputKeys(format).some((k) => parseAmount(values[k]) !== undefined);
}

// --- Préréglages ---------------------------------------------------------------------

export type FormatPreset = "COMPLET" | "AGREGE" | "NOTATION";

export const PRESET_LABELS: Record<FormatPreset, string> = {
  COMPLET: "Bilan complet : tous les postes, totaux calculés",
  AGREGE: "Bilan agrégé : grandes masses saisies directement, détail limité aux postes des ratios de la grille",
  NOTATION: "Notation seulement : les postes utilisés par les ratios de la grille, totaux calculés",
};

/** Grandes masses saisies directement dans le préréglage « agrégé ». */
export const AGGREGATED_TOTALS = [
  "TOTAL_ACTIF_IMMOBILISE",
  "TOTAL_ACTIF_CIRCULANT",
  "TOTAL_ACTIF",
  "CAPITAUX_PROPRES",
  "FINANCEMENT_PERMANENT",
  "TOTAL_PASSIF_CIRCULANT",
  "TOTAL_PASSIF",
  "CHIFFRE_AFFAIRES",
  "RESULTAT_EXPLOITATION",
  "RESULTAT_NET",
];

/**
 * Modes de postes d'un préréglage. `needed` : postes utilisés par les ratios de
 * la grille et par les alertes. Les autres postes ne sont plus chargés ; un
 * total dont une composante manque est saisi directement s'il est utile
 * (ratio, alerte, équilibre du bilan), retiré sinon : aucun total partiel
 * n'est jamais affiché.
 */
export function presetPostes(preset: FormatPreset, needed: ReadonlySet<string> = new Set()): Record<string, PosteMode> {
  const modes: Record<string, PosteMode> = {};
  if (preset === "COMPLET") return modes;
  const keep = new Set([...needed, "TOTAL_ACTIF", "TOTAL_PASSIF"]);
  for (const p of POSTES) {
    if (p.kind === "TOTAL") continue;
    if (keep.has(p.key) || p.declared) continue;
    modes[p.key] = "MASQUE";
  }
  const draft = (): StatementFormat => ({ ...DEFAULT_FORMAT, postes: modes });
  for (const p of POSTES) {
    if (p.kind !== "TOTAL") continue;
    const forced = preset === "AGREGE" && AGGREGATED_TOTALS.includes(p.key);
    const partial = (p.sum ?? []).some(([k]) => !posteAvailable(draft(), k));
    if (forced || (partial && keep.has(p.key))) modes[p.key] = "SAISI";
    else if (partial) modes[p.key] = "MASQUE";
  }
  return modes;
}

// --- Contrôle d'une version -----------------------------------------------------------

const CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/;
const UNITS: FormatUnit[] = ["MAD", "%", "x", "j"];
const GROUPS: FormatGroup[] = ["AGREGATS", "STRUCTURE", "RENTABILITE", "LIQUIDITE", "ACTIVITE", "REMBOURSEMENT"];

/**
 * Anomalies d'un format. `builtInIndicators` : codes des indicateurs calculés
 * par l'outil ; `gridIndicators` : ceux qu'utilisent les grilles (avertissement
 * si un poste dont ils dépendent n'est plus chargé).
 */
export function checkFormat(
  format: StatementFormat,
  builtInIndicators: readonly string[],
  gridNeeds: ReadonlyMap<string, readonly string[]> = new Map()
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(format.version)) errors.push("Identifiant de version : 3 à 40 caractères (lettres, chiffres, . _ -).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(format.effectiveFrom)) errors.push("Date d'effet au format AAAA-MM-JJ.");
  if (!format.labelFr.trim()) errors.push("Libellé du format à renseigner.");

  for (const [k, m] of Object.entries(format.postes)) {
    const p = POSTE_BY_KEY.get(k);
    if (!p) errors.push(`Poste inconnu : ${k}.`);
    else if (p.kind === "TOTAL" ? !["CALCULE", "SAISI", "MASQUE"].includes(m) : !["CHARGE", "MASQUE"].includes(m)) errors.push(`${p.labelFr} : mode « ${m} » non admis.`);
  }
  const unavailable = unavailablePostes(format);
  if (unavailable.has("TOTAL_ACTIF") || unavailable.has("CAPITAUX_PROPRES")) errors.push("Le format doit permettre l'actif et les capitaux propres (postes ou totaux saisis).");

  const codes = new Set<string>([...POSTES.map((p) => p.key), ...builtInIndicators, ...Object.keys(FORMULA_VARIABLES)]);
  for (const x of format.extraPostes) {
    if (!CODE_RE.test(x.key)) errors.push(`Code de poste complémentaire non admis : « ${x.key} » (majuscules, chiffres, _).`);
    else if (codes.has(x.key)) errors.push(`Code déjà utilisé : ${x.key}.`);
    if (!x.labelFr.trim()) errors.push(`Poste ${x.key} : libellé à renseigner.`);
    if (!["ACTIF", "PASSIF", "CPC", "TF", "COMPL"].includes(x.section)) errors.push(`Poste ${x.key} : section inconnue.`);
    codes.add(x.key);
  }

  const known = new Set(codes);
  for (const c of format.customIndicators) {
    if (!CODE_RE.test(c.key)) errors.push(`Code d'indicateur non admis : « ${c.key} ».`);
    else if (known.has(c.key)) errors.push(`Code déjà utilisé : ${c.key}.`);
    if (!c.labelFr.trim()) errors.push(`Indicateur ${c.key} : libellé à renseigner.`);
    if (!UNITS.includes(c.unit)) errors.push(`Indicateur ${c.key} : unité non admise.`);
    if (!GROUPS.includes(c.group)) errors.push(`Indicateur ${c.key} : famille non admise.`);
    try {
      const ids = identifiers(parseFormula(c.formula));
      const unknown = [...ids].filter((i) => !known.has(i) || i in FORMULA_VARIABLES);
      if (unknown.length) errors.push(`Indicateur ${c.key} : codes inconnus ou non admis dans un indicateur — ${unknown.join(", ")}.`);
    } catch (e) {
      errors.push(`Indicateur ${c.key} : ${e instanceof FormulaError ? e.message : "formule illisible"}`);
    }
    known.add(c.key);
  }

  const seen = new Set<string>();
  for (const a of format.alerts) {
    if (!CODE_RE.test(a.key)) errors.push(`Code d'alerte non admis : « ${a.key} ».`);
    if (seen.has(a.key)) errors.push(`Alerte en double : ${a.key}.`);
    seen.add(a.key);
    if (!a.labelFr.trim()) errors.push(`Alerte ${a.key} : libellé à renseigner.`);
    if (!["CRITIQUE", "ALERTE"].includes(a.severity)) errors.push(`Alerte ${a.key} : gravité non admise.`);
    try {
      const ids = identifiers(parseFormula(a.condition));
      const unknown = [...ids].filter((i) => !known.has(i));
      if (unknown.length) errors.push(`Alerte ${a.key} : codes inconnus — ${unknown.join(", ")}.`);
      const unloaded = [...ids].filter((i) => unavailable.has(i));
      if (a.active && unloaded.length) warnings.push(`Alerte « ${a.labelFr} » : postes non chargés (${unloaded.join(", ")}) — elle ne sera pas évaluable.`);
    } catch (e) {
      errors.push(`Alerte ${a.key} : ${e instanceof FormulaError ? e.message : "condition illisible"}`);
    }
  }

  for (const [k, ap] of Object.entries(format.appreciations)) {
    if (!known.has(k)) {
      errors.push(`Appréciation d'un indicateur inconnu : ${k}.`);
      continue;
    }
    if (ap.sens !== "HAUSSE" && ap.sens !== "BAISSE") errors.push(`${k} : sens « HAUSSE » ou « BAISSE ».`);
    const seq = [ap.bon, ap.mauvais, ap.critique].filter((x): x is number => typeof x === "number");
    if (seq.some((x) => !Number.isFinite(x))) errors.push(`${k} : seuil non numérique.`);
    const ordered = seq.every((x, i) => i === 0 || (ap.sens === "HAUSSE" ? x <= seq[i - 1] : x >= seq[i - 1]));
    if (!ordered) errors.push(`${k} : seuils dans l'ordre bon, mauvais, critique (${ap.sens === "HAUSSE" ? "décroissants" : "croissants"}).`);
    if (ap.variation !== undefined && !(ap.variation > 0)) errors.push(`${k} : variation significative strictement positive.`);
  }

  const s = format.synthesis;
  const nums = [s?.critique?.alertesCritiques, s?.critique?.indicateursCritiques, s?.degradee?.alertes, s?.degradee?.indicateursCritiques, s?.degradee?.indicateursMauvais, s?.surveiller?.alertes, s?.surveiller?.indicateursMauvais, s?.surveiller?.degradations];
  if (nums.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 50)) errors.push("Seuils de la synthèse : entiers de 1 à 50.");

  for (const [indicator, deps] of gridNeeds) {
    const lost = deps.filter((d) => unavailable.has(d));
    if (lost.length) warnings.push(`Ratio de la grille ${indicator} : postes non chargés (${lost.map((d) => POSTE_BY_KEY.get(d)?.labelFr ?? d).join(", ")}) — il ne sera plus calculé et le critère devra être instruit à la main.`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Lecture tolérante d'un format stocké (champs manquants complétés par le format embarqué). */
export function normalizeFormat(raw: Partial<StatementFormat>): StatementFormat {
  return {
    version: String(raw.version ?? ""),
    effectiveFrom: String(raw.effectiveFrom ?? ""),
    labelFr: String(raw.labelFr ?? ""),
    ...(raw.noteFr ? { noteFr: String(raw.noteFr) } : {}),
    ...(raw.createdBy ? { createdBy: raw.createdBy } : {}),
    ...(raw.createdAt ? { createdAt: raw.createdAt } : {}),
    postes: raw.postes && typeof raw.postes === "object" ? { ...raw.postes } : {},
    extraPostes: Array.isArray(raw.extraPostes) ? raw.extraPostes : [],
    hiddenIndicators: Array.isArray(raw.hiddenIndicators) ? raw.hiddenIndicators : [],
    customIndicators: Array.isArray(raw.customIndicators) ? raw.customIndicators : [],
    appreciations: raw.appreciations && typeof raw.appreciations === "object" ? raw.appreciations : DEFAULT_APPRECIATIONS,
    alerts: Array.isArray(raw.alerts) ? raw.alerts : DEFAULT_ALERTS,
    synthesis: raw.synthesis ?? DEFAULT_SYNTHESIS,
  };
}
