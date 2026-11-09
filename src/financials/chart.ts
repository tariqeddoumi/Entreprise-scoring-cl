/**
 * Gabarit des postes du bilan et du CPC — plan de postes unique de la banque.
 *
 * Tout bilan, quel que soit son support (PDF, photo, Excel, saisie), est ramené
 * à ce gabarit avant tout calcul : deux analystes qui lisent le même bilan
 * obtiennent les mêmes ratios. Les rubriques suivent le Code Général de
 * Normalisation Comptable (CGNC) marocain, modèle normal et modèle simplifié.
 *
 * Modèle simplifié (loi 44-03, chiffre d'affaires ≤ 10 MDH) : bilan et CPC
 * allégés, sans état des soldes de gestion ni tableau de financement. Les
 * rubriques du gabarit existent dans les deux modèles ; le détail propre au
 * modèle normal (tableau de financement) est facultatif en simplifié.
 *
 * Module PUR : partagé par l'écran, le serveur et l'OCR intelligent.
 */

export const FINANCIAL_CHART_VERSION = "BILAN-CGNC-2026.1";

export type StatementModel = "NORMAL" | "SIMPLIFIE";

export const STATEMENT_MODEL_LABELS: Record<StatementModel, string> = {
  NORMAL: "Modèle normal (CGNC)",
  SIMPLIFIE: "Modèle simplifié (TPE, CA ≤ 10 MDH)",
};

/** Seuil du modèle simplifié, en dirhams (loi 44-03). */
export const SIMPLIFIED_MODEL_MAX_TURNOVER_MAD = 10_000_000;

export type PosteSection = "ACTIF" | "PASSIF" | "CPC" | "TF" | "COMPL";

export const SECTION_LABELS: Record<PosteSection, string> = {
  ACTIF: "Bilan — actif (valeurs nettes)",
  PASSIF: "Bilan — passif",
  CPC: "Compte de produits et charges",
  TF: "Tableau de financement et annexe",
  COMPL: "Données complémentaires (hors états de synthèse, exercice N)",
};

export interface PosteDef {
  key: string;
  labelFr: string;
  section: PosteSection;
  /** INPUT : saisi ou lu ; TOTAL : calculé ; DETAIL : « dont », lu mais jamais additionné. */
  kind: "INPUT" | "TOTAL" | "DETAIL";
  /** Composantes d'un total (signe +1 ou −1). */
  sum?: Array<[string, 1 | -1]>;
  /** Le poste peut être négatif (report à nouveau, résultat, variation de stocks). */
  signed?: boolean;
  /** Renseigné pour l'exercice N seulement (données complémentaires). */
  onlyN?: boolean;
  /** Repère pour la saisie et pour l'OCR intelligent : rubrique CGNC, comptes. */
  hintFr?: string;
  /** Total figurant sur le document, lu pour contrôle (jamais utilisé dans un calcul). */
  declared?: boolean;
}

export const POSTES: PosteDef[] = [
  // --- Actif -------------------------------------------------------------------
  { key: "IMMO_NON_VALEURS", labelFr: "Immobilisations en non-valeurs", section: "ACTIF", kind: "INPUT", hintFr: "Frais préliminaires, charges à répartir, primes de remboursement (comptes 21)." },
  { key: "IMMO_INCORPORELLES", labelFr: "Immobilisations incorporelles", section: "ACTIF", kind: "INPUT", hintFr: "Fonds commercial, brevets, logiciels (comptes 22)." },
  { key: "IMMO_CORPORELLES", labelFr: "Immobilisations corporelles", section: "ACTIF", kind: "INPUT", hintFr: "Terrains, constructions, matériel, en cours (comptes 23)." },
  { key: "IMMO_FINANCIERES", labelFr: "Immobilisations financières", section: "ACTIF", kind: "INPUT", hintFr: "Prêts immobilisés, titres de participation (comptes 24, 25)." },
  { key: "ECART_CONV_ACTIF_LT", labelFr: "Écarts de conversion – actif (éléments durables)", section: "ACTIF", kind: "INPUT" },
  {
    key: "TOTAL_ACTIF_IMMOBILISE",
    labelFr: "Total actif immobilisé",
    section: "ACTIF",
    kind: "TOTAL",
    sum: [["IMMO_NON_VALEURS", 1], ["IMMO_INCORPORELLES", 1], ["IMMO_CORPORELLES", 1], ["IMMO_FINANCIERES", 1], ["ECART_CONV_ACTIF_LT", 1]],
  },
  { key: "STOCKS", labelFr: "Stocks", section: "ACTIF", kind: "INPUT", hintFr: "Marchandises, matières, produits (comptes 31)." },
  { key: "CREANCES_CLIENTS", labelFr: "Clients et comptes rattachés", section: "ACTIF", kind: "INPUT", hintFr: "Compte 342, net des provisions." },
  { key: "AUTRES_CREANCES", labelFr: "Autres créances de l'actif circulant", section: "ACTIF", kind: "INPUT", hintFr: "Fournisseurs débiteurs, personnel, État, comptes d'associés, autres débiteurs, comptes de régularisation." },
  { key: "CREANCES_ASSOCIES", labelFr: "dont comptes d'associés débiteurs", section: "ACTIF", kind: "DETAIL", hintFr: "Compris dans les autres créances ; déduit des fonds propres tangibles." },
  { key: "TITRES_PLACEMENT", labelFr: "Titres et valeurs de placement", section: "ACTIF", kind: "INPUT", hintFr: "Compte 35." },
  { key: "ECART_CONV_ACTIF_CT", labelFr: "Écarts de conversion – actif (éléments circulants)", section: "ACTIF", kind: "INPUT" },
  {
    key: "TOTAL_ACTIF_CIRCULANT",
    labelFr: "Total actif circulant (hors trésorerie)",
    section: "ACTIF",
    kind: "TOTAL",
    sum: [["STOCKS", 1], ["CREANCES_CLIENTS", 1], ["AUTRES_CREANCES", 1], ["TITRES_PLACEMENT", 1], ["ECART_CONV_ACTIF_CT", 1]],
  },
  { key: "TRESORERIE_ACTIF", labelFr: "Trésorerie – actif", section: "ACTIF", kind: "INPUT", hintFr: "Chèques et valeurs à encaisser, banques, caisse (comptes 51)." },
  {
    key: "TOTAL_ACTIF",
    labelFr: "Total actif (calculé)",
    section: "ACTIF",
    kind: "TOTAL",
    sum: [["TOTAL_ACTIF_IMMOBILISE", 1], ["TOTAL_ACTIF_CIRCULANT", 1], ["TRESORERIE_ACTIF", 1]],
  },
  { key: "TOTAL_ACTIF_DECLARE", labelFr: "Total général de l'actif (lu sur le document)", section: "ACTIF", kind: "INPUT", declared: true },

  // --- Passif ------------------------------------------------------------------
  { key: "CAPITAL", labelFr: "Capital social ou personnel (net du non appelé)", section: "PASSIF", kind: "INPUT", hintFr: "Comptes 111 à 117, moins actionnaires capital souscrit non appelé." },
  { key: "PRIMES_RESERVES", labelFr: "Primes et réserves", section: "PASSIF", kind: "INPUT", hintFr: "Primes d'émission, réserve légale, autres réserves." },
  { key: "ECARTS_REEVALUATION", labelFr: "Écarts de réévaluation", section: "PASSIF", kind: "INPUT", hintFr: "Déduits des fonds propres tangibles (non liquides)." },
  { key: "REPORT_A_NOUVEAU", labelFr: "Report à nouveau", section: "PASSIF", kind: "INPUT", signed: true },
  { key: "RESULTAT_INSTANCE", labelFr: "Résultat net en instance d'affectation", section: "PASSIF", kind: "INPUT", signed: true },
  { key: "RESULTAT_EXERCICE_BILAN", labelFr: "Résultat net de l'exercice (bilan)", section: "PASSIF", kind: "INPUT", signed: true },
  {
    key: "CAPITAUX_PROPRES",
    labelFr: "Total capitaux propres",
    section: "PASSIF",
    kind: "TOTAL",
    signed: true,
    sum: [["CAPITAL", 1], ["PRIMES_RESERVES", 1], ["ECARTS_REEVALUATION", 1], ["REPORT_A_NOUVEAU", 1], ["RESULTAT_INSTANCE", 1], ["RESULTAT_EXERCICE_BILAN", 1]],
  },
  { key: "CAPITAUX_PROPRES_ASSIMILES", labelFr: "Capitaux propres assimilés", section: "PASSIF", kind: "INPUT", hintFr: "Subventions d'investissement, provisions réglementées (comptes 13, 135)." },
  { key: "DETTES_FINANCEMENT", labelFr: "Dettes de financement", section: "PASSIF", kind: "INPUT", hintFr: "Emprunts obligataires, crédits à moyen et long terme, autres dettes de financement (comptes 14)." },
  { key: "PROVISIONS_DURABLES", labelFr: "Provisions durables pour risques et charges", section: "PASSIF", kind: "INPUT" },
  { key: "ECART_CONV_PASSIF_LT", labelFr: "Écarts de conversion – passif (éléments durables)", section: "PASSIF", kind: "INPUT" },
  {
    key: "FINANCEMENT_PERMANENT",
    labelFr: "Total financement permanent",
    section: "PASSIF",
    kind: "TOTAL",
    signed: true,
    sum: [["CAPITAUX_PROPRES", 1], ["CAPITAUX_PROPRES_ASSIMILES", 1], ["DETTES_FINANCEMENT", 1], ["PROVISIONS_DURABLES", 1], ["ECART_CONV_PASSIF_LT", 1]],
  },
  { key: "FOURNISSEURS", labelFr: "Fournisseurs et comptes rattachés", section: "PASSIF", kind: "INPUT", hintFr: "Compte 441." },
  { key: "AUTRES_DETTES_CIRCULANTES", labelFr: "Autres dettes du passif circulant", section: "PASSIF", kind: "INPUT", hintFr: "Clients créditeurs, personnel, organismes sociaux, État, comptes d'associés, autres créanciers, régularisation." },
  { key: "AUTRES_PROVISIONS_RC", labelFr: "Autres provisions pour risques et charges", section: "PASSIF", kind: "INPUT" },
  { key: "ECART_CONV_PASSIF_CT", labelFr: "Écarts de conversion – passif (éléments circulants)", section: "PASSIF", kind: "INPUT" },
  {
    key: "TOTAL_PASSIF_CIRCULANT",
    labelFr: "Total passif circulant (hors trésorerie)",
    section: "PASSIF",
    kind: "TOTAL",
    sum: [["FOURNISSEURS", 1], ["AUTRES_DETTES_CIRCULANTES", 1], ["AUTRES_PROVISIONS_RC", 1], ["ECART_CONV_PASSIF_CT", 1]],
  },
  { key: "TRESORERIE_PASSIF", labelFr: "Trésorerie – passif", section: "PASSIF", kind: "INPUT", hintFr: "Crédits d'escompte, crédits de trésorerie, banques soldes créditeurs (comptes 55)." },
  {
    key: "TOTAL_PASSIF",
    labelFr: "Total passif (calculé)",
    section: "PASSIF",
    kind: "TOTAL",
    signed: true,
    sum: [["FINANCEMENT_PERMANENT", 1], ["TOTAL_PASSIF_CIRCULANT", 1], ["TRESORERIE_PASSIF", 1]],
  },
  { key: "TOTAL_PASSIF_DECLARE", labelFr: "Total général du passif (lu sur le document)", section: "PASSIF", kind: "INPUT", declared: true },

  // --- CPC ---------------------------------------------------------------------
  { key: "VENTES_MARCHANDISES", labelFr: "Ventes de marchandises (en l'état)", section: "CPC", kind: "INPUT", hintFr: "Compte 711." },
  { key: "VENTES_BIENS_SERVICES", labelFr: "Ventes de biens et services produits", section: "CPC", kind: "INPUT", hintFr: "Compte 712." },
  {
    key: "CHIFFRE_AFFAIRES",
    labelFr: "Chiffre d'affaires",
    section: "CPC",
    kind: "TOTAL",
    sum: [["VENTES_MARCHANDISES", 1], ["VENTES_BIENS_SERVICES", 1]],
  },
  { key: "VARIATION_STOCKS_PRODUITS", labelFr: "Variation de stocks de produits", section: "CPC", kind: "INPUT", signed: true },
  { key: "IMMOBILISATIONS_PRODUITES", labelFr: "Immobilisations produites par l'entreprise pour elle-même", section: "CPC", kind: "INPUT" },
  { key: "SUBVENTIONS_EXPLOITATION", labelFr: "Subventions d'exploitation", section: "CPC", kind: "INPUT" },
  { key: "AUTRES_PRODUITS_EXPLOITATION", labelFr: "Autres produits d'exploitation", section: "CPC", kind: "INPUT" },
  { key: "REPRISES_EXPLOITATION", labelFr: "Reprises d'exploitation, transferts de charges", section: "CPC", kind: "INPUT" },
  { key: "ACHATS_REVENDUS", labelFr: "Achats revendus de marchandises", section: "CPC", kind: "INPUT", hintFr: "Compte 611." },
  { key: "ACHATS_CONSOMMES", labelFr: "Achats consommés de matières et fournitures", section: "CPC", kind: "INPUT", hintFr: "Compte 612." },
  { key: "AUTRES_CHARGES_EXTERNES", labelFr: "Autres charges externes", section: "CPC", kind: "INPUT", hintFr: "Compte 613/614 (locations, crédit-bail, honoraires, transports…)." },
  { key: "IMPOTS_TAXES", labelFr: "Impôts et taxes", section: "CPC", kind: "INPUT", hintFr: "Compte 616, hors impôt sur les résultats." },
  { key: "CHARGES_PERSONNEL", labelFr: "Charges de personnel", section: "CPC", kind: "INPUT", hintFr: "Compte 617." },
  { key: "AUTRES_CHARGES_EXPLOITATION", labelFr: "Autres charges d'exploitation", section: "CPC", kind: "INPUT" },
  { key: "DOTATIONS_EXPLOITATION", labelFr: "Dotations d'exploitation", section: "CPC", kind: "INPUT", hintFr: "Amortissements et provisions d'exploitation (compte 619)." },
  {
    key: "RESULTAT_EXPLOITATION",
    labelFr: "Résultat d'exploitation",
    section: "CPC",
    kind: "TOTAL",
    signed: true,
    sum: [
      ["CHIFFRE_AFFAIRES", 1], ["VARIATION_STOCKS_PRODUITS", 1], ["IMMOBILISATIONS_PRODUITES", 1], ["SUBVENTIONS_EXPLOITATION", 1],
      ["AUTRES_PRODUITS_EXPLOITATION", 1], ["REPRISES_EXPLOITATION", 1], ["ACHATS_REVENDUS", -1], ["ACHATS_CONSOMMES", -1],
      ["AUTRES_CHARGES_EXTERNES", -1], ["IMPOTS_TAXES", -1], ["CHARGES_PERSONNEL", -1], ["AUTRES_CHARGES_EXPLOITATION", -1],
      ["DOTATIONS_EXPLOITATION", -1],
    ],
  },
  { key: "PRODUITS_FINANCIERS", labelFr: "Produits financiers", section: "CPC", kind: "INPUT" },
  { key: "CHARGES_INTERETS", labelFr: "Charges d'intérêts", section: "CPC", kind: "INPUT", hintFr: "Compte 6311." },
  { key: "AUTRES_CHARGES_FINANCIERES", labelFr: "Autres charges financières", section: "CPC", kind: "INPUT", hintFr: "Pertes de change, dotations financières, autres." },
  {
    key: "RESULTAT_FINANCIER",
    labelFr: "Résultat financier",
    section: "CPC",
    kind: "TOTAL",
    signed: true,
    sum: [["PRODUITS_FINANCIERS", 1], ["CHARGES_INTERETS", -1], ["AUTRES_CHARGES_FINANCIERES", -1]],
  },
  { key: "PRODUITS_NON_COURANTS", labelFr: "Produits non courants", section: "CPC", kind: "INPUT" },
  { key: "CHARGES_NON_COURANTES", labelFr: "Charges non courantes", section: "CPC", kind: "INPUT" },
  { key: "IMPOTS_RESULTATS", labelFr: "Impôts sur les résultats", section: "CPC", kind: "INPUT", hintFr: "IS ou IR professionnel." },
  {
    key: "RESULTAT_NET",
    labelFr: "Résultat net (calculé)",
    section: "CPC",
    kind: "TOTAL",
    signed: true,
    sum: [["RESULTAT_EXPLOITATION", 1], ["RESULTAT_FINANCIER", 1], ["PRODUITS_NON_COURANTS", 1], ["CHARGES_NON_COURANTES", -1], ["IMPOTS_RESULTATS", -1]],
  },
  { key: "RESULTAT_NET_DECLARE", labelFr: "Résultat net de l'exercice (lu sur le CPC)", section: "CPC", kind: "INPUT", signed: true, declared: true },

  // --- Tableau de financement / annexe -------------------------------------------
  { key: "ACQUISITIONS_IMMOBILISATIONS", labelFr: "Investissements de l'exercice (acquisitions d'immobilisations)", section: "TF", kind: "INPUT", hintFr: "Tableau de financement (modèle normal) ou annexe. À défaut, estimé par la variation des immobilisations." },
  { key: "REMBOURSEMENTS_DETTES_FIN", labelFr: "Remboursements des dettes de financement de l'exercice", section: "TF", kind: "INPUT", hintFr: "Tableau de financement (modèle normal)." },

  // --- Données complémentaires (N) ----------------------------------------------
  { key: "SERVICE_DETTE_PRINCIPAL_12M", labelFr: "Principal exigible à 12 mois (échéancier, toutes banques)", section: "COMPL", kind: "INPUT", onlyN: true, hintFr: "Amortissements contractuels, échéances in fine dans les 12 mois, comptes courants catégorie 1 exigibles." },
  { key: "REDEVANCES_CREDIT_BAIL", labelFr: "Redevances de crédit-bail de l'exercice", section: "COMPL", kind: "INPUT", onlyN: true, hintFr: "Réintégrées dans l'EBE et comptées dans le service de la dette." },
  { key: "ENCOURS_CREDIT_BAIL", labelFr: "Encours de crédit-bail (capital restant dû)", section: "COMPL", kind: "INPUT", onlyN: true, hintFr: "Ajouté à la dette financière économique." },
  { key: "CCA_BLOQUES", labelFr: "Comptes courants d'associés bloqués et subordonnés (catégorie 3)", section: "COMPL", kind: "INPUT", onlyN: true, hintFr: "Convention écrite de blocage et de subordination : assimilés aux fonds propres." },
  { key: "CCA_A_VUE", labelFr: "Comptes courants d'associés remboursables à vue (catégorie 1)", section: "COMPL", kind: "INPUT", onlyN: true, hintFr: "Ajoutés à la dette financière économique." },
];

export const POSTE_BY_KEY: ReadonlyMap<string, PosteDef> = new Map(POSTES.map((p) => [p.key, p]));

/** Postes que l'on saisit ou que l'OCR intelligent lit (les totaux sont recalculés). */
export const INPUT_POSTES = POSTES.filter((p) => p.kind !== "TOTAL");

/** Postes « clés » restitués en tête de la fiche de notation. */
export const KEY_POSTES = [
  "TOTAL_ACTIF",
  "TOTAL_ACTIF_IMMOBILISE",
  "STOCKS",
  "CREANCES_CLIENTS",
  "TRESORERIE_ACTIF",
  "CAPITAUX_PROPRES",
  "DETTES_FINANCEMENT",
  "FOURNISSEURS",
  "TRESORERIE_PASSIF",
  "CHIFFRE_AFFAIRES",
  "CHARGES_PERSONNEL",
  "DOTATIONS_EXPLOITATION",
  "RESULTAT_EXPLOITATION",
  "CHARGES_INTERETS",
  "RESULTAT_NET",
] as const;

export type YearValues = Record<string, number | undefined>;

/** Lecture tolérante d'un montant saisi : espaces, virgule décimale, parenthèses comptables. */
export function parseAmount(raw: string | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = String(raw).trim();
  if (s === "") return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  ]/g, "").replace(/(MAD|DH|DHS)$/i, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -Math.abs(n) : n;
}

/**
 * Valeurs d'un exercice, totaux recalculés. Un total n'existe que si l'une au
 * moins de ses composantes est renseignée ; une composante vide compte pour 0.
 */
export function computeYear(values: Record<string, string>): YearValues {
  const out: YearValues = {};
  for (const p of INPUT_POSTES) out[p.key] = parseAmount(values[p.key]);
  for (const p of POSTES) {
    if (p.kind !== "TOTAL" || !p.sum) continue;
    let any = false;
    let total = 0;
    for (const [k, sign] of p.sum) {
      const v = out[k];
      if (v !== undefined) {
        any = true;
        total += sign * v;
      }
    }
    out[p.key] = any ? total : undefined;
  }
  return out;
}
