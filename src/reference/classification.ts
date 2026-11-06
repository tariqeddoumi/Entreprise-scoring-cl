/**
 * Critères de classement des créances (Bank Al-Maghrib, circulaire 1/W/2025 ;
 * ancienne 19/G/2002) restitués et appliqués à la note — D-57.
 *
 * Chaque critère est abrégé, rattaché à une famille (sensible, pré-douteux,
 * douteux, compromis) et à sa source :
 *  - BILAN : déclenché automatiquement par l'analyse du bilan (alerte du
 *    format), ne se décoche pas — seule une décision de comité le lève ;
 *  - DECLARE : coché par l'analyste, daté et commenté ; à terme alimenté par
 *    les systèmes de la banque (impayés, dépassements, contentieux).
 * Un critère DECLARE peut être SUGGÉRÉ par une alerte (capitaux propres
 * inférieurs au quart du capital : la réunion de l'AGE reste à vérifier).
 *
 * Effet sur la note, paramétrable par famille : plafond (sensible : 8 au
 * mieux ; pré-douteux : 10) ou note de défaut (douteux : DEF1 ; compromis :
 * DEF3). Un critère levé par une décision de comité (procès-verbal tracé)
 * n'a plus d'effet sur la note du dossier ; la levée expire avec le dossier et
 * est rappelée au renouvellement.
 *
 * Module PUR : partagé par l'écran, le serveur et le paramétrage.
 */

export type ClassFamily = "SENSIBLE" | "PREDOUTEUX" | "DOUTEUX" | "COMPROMIS";

export const FAMILY_ORDER: ClassFamily[] = ["SENSIBLE", "PREDOUTEUX", "DOUTEUX", "COMPROMIS"];
export const FAMILY_LABELS: Record<ClassFamily, string> = {
  SENSIBLE: "Créance sensible",
  PREDOUTEUX: "Créance pré-douteuse",
  DOUTEUX: "Créance douteuse",
  COMPROMIS: "Créance compromise",
};

export interface ClassCriterion {
  code: string;
  family: ClassFamily;
  labelFr: string;
  article: string;
  source: "BILAN" | "DECLARE";
  /** Alerte du format de bilan qui déclenche (BILAN) ou suggère (DECLARE) le critère. */
  alertKey?: string;
  active: boolean;
}

/** Effet d'une famille sur la note : classe plafond (« 8 ») ou grade de défaut (« DEF1 »). */
export type FamilyCaps = Record<ClassFamily, string>;

export interface ClassificationSettings {
  criteria: ClassCriterion[];
  caps: FamilyCaps;
}

export const CLASSIFICATION_KEY = "CLASSIFICATION_CRITERIA";

export const DEFAULT_CAPS: FamilyCaps = { SENSIBLE: "8", PREDOUTEUX: "10", DOUTEUX: "DEF1", COMPROMIS: "DEF3" };

const c = (code: string, family: ClassFamily, labelFr: string, article: string, source: "BILAN" | "DECLARE" = "DECLARE", alertKey?: string): ClassCriterion => ({
  code,
  family,
  labelFr,
  article,
  source,
  ...(alertKey ? { alertKey } : {}),
  active: true,
});

export const DEFAULT_CRITERIA: ClassCriterion[] = [
  // Créances sensibles (art. 5)
  c("S01", "SENSIBLE", "Saisie-arrêt ou ATD reçu, affectant le compte", "1/W/2025 art. 5-1"),
  c("S02", "SENSIBLE", "Comptes annuels non reçus 7 mois après la clôture", "1/W/2025 art. 5-2", "BILAN", "COMPTES_NON_RECUS"),
  c("S03", "SENSIBLE", "Information négative du crédit bureau", "1/W/2025 art. 5-2"),
  c("S04", "SENSIBLE", "Incidents de paiement (SCIP) significatifs", "1/W/2025 art. 5-2"),
  c("S05", "SENSIBLE", "Réserve ou refus de certification du commissaire aux comptes", "1/W/2025 art. 5-2"),
  c("S07", "SENSIBLE", "Mouvements créditeurs anormalement faibles", "1/W/2025 art. 5-2"),
  c("S14", "SENSIBLE", "Événement touchant dirigeants ou actionnaires", "1/W/2025 art. 5-5"),
  c("S15", "SENSIBLE", "Litiges entre associés, problèmes de gestion", "1/W/2025 art. 5-5"),
  c("S16", "SENSIBLE", "Difficultés du secteur d'activité", "1/W/2025 art. 5-5"),
  c("S17", "SENSIBLE", "Dépendance à un client ou fournisseur en difficulté", "1/W/2025 art. 5-5"),
  c("S18", "SENSIBLE", "Recul du chiffre d'affaires de 50 % ou plus", "1/W/2025 art. 5-5", "BILAN", "RECUL_CA_50"),
  c("S19", "SENSIBLE", "Dettes financières > 3 × capitaux propres", "1/W/2025 art. 5-5", "BILAN", "ENDETTEMENT_3"),
  c("S20", "SENSIBLE", "Trois exercices déficitaires sans augmentation de capital", "1/W/2025 art. 5-5", "BILAN", "DEFICITS_3_ANS"),
  c("R01", "SENSIBLE", "Crédit restructuré pour difficultés (période d'observation)", "1/W/2025 art. 17 à 31"),
  // Créances pré-douteuses (art. 10)
  c("E03", "PREDOUTEUX", "Dépassement > 10 % de l'autorisation depuis plus de 90 jours", "1/W/2025 art. 10-1"),
  c("E04", "PREDOUTEUX", "Impayé de plus de 90 jours (amortissable, in fine, crédit-bail)", "1/W/2025 art. 10-2 à 10-4"),
  c("E08", "PREDOUTEUX", "Situation financière non évaluable faute d'information", "1/W/2025 art. 10-6"),
  c("E09", "PREDOUTEUX", "Recouvrement incertain du fait de la dégradation", "1/W/2025 art. 10-7"),
  // Créances douteuses (art. 11)
  c("E10", "DOUTEUX", "Dépassement > 10 % de l'autorisation depuis plus de 180 jours", "1/W/2025 art. 11-1"),
  c("E11", "DOUTEUX", "Compte débiteur sans mouvements créditeurs suffisants (180 jours)", "1/W/2025 art. 11-2"),
  c("E12", "DOUTEUX", "Impayé de plus de 180 jours", "1/W/2025 art. 11-3 à 11-5"),
  c("E15", "DOUTEUX", "Redressement judiciaire", "1/W/2025 art. 11-6"),
  // Créances compromises (art. 12 et 13)
  c("E17", "COMPROMIS", "Dépassement > 10 % de l'autorisation depuis plus de 360 jours", "1/W/2025 art. 12-1"),
  c("E19", "COMPROMIS", "Impayé de plus de 360 jours ou 9 échéances mensuelles", "1/W/2025 art. 12-3 à 12-5, 13"),
  c("E25", "COMPROMIS", "Perte des 3/4 (SA) ou du 1/3 de la situation nette sans AGE", "1/W/2025 art. 12-9", "DECLARE", "CP_QUART_CAPITAL"),
  c("E26", "COMPROMIS", "Action en justice pour recouvrement", "1/W/2025 art. 12-9"),
  c("E27", "COMPROMIS", "Contestation judiciaire des créances", "1/W/2025 art. 12-9"),
  c("E28", "COMPROMIS", "Cessation d'activité ou liquidation judiciaire", "1/W/2025 art. 12-9"),
  c("E29", "COMPROMIS", "Déchéance du terme ou résiliation du crédit-bail", "1/W/2025 art. 12-9"),
];

export const DEFAULT_CLASSIFICATION: ClassificationSettings = { criteria: DEFAULT_CRITERIA, caps: DEFAULT_CAPS };

const CAP_RE = /^(10|[1-9]|DEF[123])$/;

export function checkClassification(s: ClassificationSettings): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const x of s.criteria) {
    if (!/^[A-Z][A-Z0-9_]{1,15}$/.test(x.code)) errors.push(`Code de critère non admis : « ${x.code} ».`);
    if (seen.has(x.code)) errors.push(`Critère en double : ${x.code}.`);
    seen.add(x.code);
    if (!FAMILY_ORDER.includes(x.family)) errors.push(`${x.code} : famille inconnue.`);
    if (!x.labelFr.trim() || x.labelFr.length > 200) errors.push(`${x.code} : libellé de 1 à 200 caractères.`);
    if (x.source !== "BILAN" && x.source !== "DECLARE") errors.push(`${x.code} : source BILAN ou DECLARE.`);
    if (x.source === "BILAN" && !x.alertKey) errors.push(`${x.code} : un critère issu du bilan désigne son alerte.`);
  }
  for (const f of FAMILY_ORDER) if (!CAP_RE.test(s.caps?.[f] ?? "")) errors.push(`${FAMILY_LABELS[f]} : effet « 1 » à « 10 » ou « DEF1 » à « DEF3 ».`);
  return errors;
}

export function parseClassification(raw: string | null | undefined): ClassificationSettings {
  if (!raw) return DEFAULT_CLASSIFICATION;
  try {
    const v = JSON.parse(raw) as ClassificationSettings;
    return v && Array.isArray(v.criteria) && v.caps && checkClassification(v).length === 0 ? v : DEFAULT_CLASSIFICATION;
  } catch {
    return DEFAULT_CLASSIFICATION;
  }
}

// --- Saisie et calcul ------------------------------------------------------------------

/** Critères déclarés par l'analyste (présence = coché). */
export type DeclaredCriteria = Record<string, { date?: string; comment?: string }>;

export type CriterionState = "COCHE" | "LEVE" | "NON" | "SUGGERE";

export interface ClassificationItem extends ClassCriterion {
  state: CriterionState;
  /** Coché automatiquement (bilan) ou par l'analyste. */
  by?: "BILAN" | "ANALYSTE";
  date?: string;
  comment?: string;
}

export interface ClassificationResult {
  items: ClassificationItem[];
  /** Famille la plus sévère encore active (critères cochés non levés). */
  family: ClassFamily | null;
  /** Effet sur la note : plafond ou défaut. */
  effect: { kind: "PLAFOND"; grade: string } | { kind: "DEFAUT"; grade: "DEF1" | "DEF2" | "DEF3" } | null;
  active: string[];
  lifted: string[];
}

export function computeClassification(
  settings: ClassificationSettings,
  declared: DeclaredCriteria | undefined,
  triggeredAlerts: ReadonlySet<string>,
  lifted: ReadonlySet<string> = new Set()
): ClassificationResult {
  const items: ClassificationItem[] = settings.criteria
    .filter((x) => x.active)
    .map((x) => {
      const d = declared?.[x.code];
      const byBilan = x.source === "BILAN" && !!x.alertKey && triggeredAlerts.has(x.alertKey);
      const checked = byBilan || (x.source === "DECLARE" && !!d);
      if (checked) {
        const base = { ...x, by: byBilan ? ("BILAN" as const) : ("ANALYSTE" as const), ...(d?.date ? { date: d.date } : {}), ...(d?.comment ? { comment: d.comment } : {}) };
        return { ...base, state: lifted.has(x.code) ? ("LEVE" as const) : ("COCHE" as const) };
      }
      const suggested = x.source === "DECLARE" && !!x.alertKey && triggeredAlerts.has(x.alertKey);
      return { ...x, state: suggested ? ("SUGGERE" as const) : ("NON" as const) };
    });
  const active = items.filter((i) => i.state === "COCHE");
  let family: ClassFamily | null = null;
  for (const f of FAMILY_ORDER) if (active.some((i) => i.family === f)) family = f;
  const cap = family ? settings.caps[family] : null;
  const effect = !cap
    ? null
    : /^DEF[123]$/.test(cap)
      ? { kind: "DEFAUT" as const, grade: cap as "DEF1" | "DEF2" | "DEF3" }
      : { kind: "PLAFOND" as const, grade: cap };
  return { items, family, effect, active: active.map((i) => i.code), lifted: items.filter((i) => i.state === "LEVE").map((i) => i.code) };
}
