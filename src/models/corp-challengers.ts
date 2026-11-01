import type { CriterionConfig, GradeScaleConfig, ModelConfig } from "@/core/types";
import { DEFAULT_GRADES } from "@/reference/default-policy";
import { CORP_STD_V1 } from "./corp-std-v1";
import { CORP_TPE_BEHAV_V1 } from "./corp-tpe-behav-v1";
import { anchors, bins5 } from "./helpers";

/**
 * Grilles CHALLENGER resserrées — document 03 du diagnostic du 1er novembre
 * 2026 (« Modèle cible BCP et grilles proposées »).
 *
 * Deux grilles : 16 critères standard pour les entreprises disposant de comptes
 * exploitables, 12 critères comportementaux pour les TPE sans comptes fiables.
 * Elles tournent EN PARALLÈLE des grilles actuelles corrigées, pour comparer
 * discrimination, stabilité, couverture et désaccord des analystes : elles ne
 * les remplacent pas sans étude d'impact, pilote et validation indépendante.
 *
 * Ce qui change par rapport aux grilles actuelles :
 *  - les variables corrélées sont regroupées (marge, ROA et croissance en F5 ;
 *    conversion en cash, BFR et FCF en F6 ; dépassements et utilisation en B2) ;
 *  - le soutien n'apporte aucun point dans la note autonome, et aucun cran
 *    n'est accordé par la grille : l'appréciation soutenue est séparée ;
 *  - la qualité documentaire, l'UBO/KYC et la complétude sont suivis hors score
 *    (classe de confiance, conformité) ;
 *  - une information absente prend la borne basse ; le noyau obligatoire est
 *    élargi (capital, levier, DSCR, liquidité, retards) ;
 *  - aucun plafond de grade numéroté : un DSCR ou une liquidité sous 1
 *    déclenchent une revue risques obligatoire, sans décision automatique.
 *
 * Poids, seuils et grades sont des HYPOTHÈSES EXPERTES de travail : ni calibrés
 * sur BCP, ni prescrits par Bank Al-Maghrib. Aucune PD n'y est associée.
 */

const DISCLAIMER =
  "Grille challenger du pilote : hypothèses expertes à comparer aux grilles actuelles sur dossiers réels. Ni calibrée sur défauts observés, ni validée indépendamment, ni prescrite par Bank Al-Maghrib. Aucune probabilité de défaut. Usage autorisé : double notation en pilote, sans effet sur les décisions. Usages interdits : décision automatisée, tarification, IFRS 9, classification réglementaire, fonds propres.";

const MISSING_LOW = { unavailablePolicy: "CONSERVATIVE_SCORE" as const, unavailableScore: 0 as const };

function scale(scaleId: string, labelFr: string, prefix: string, cuts: number[], labels: string[]): GradeScaleConfig {
  return {
    scaleId,
    labelFr,
    comparableWith: [],
    status: "PROVISIONAL",
    bands: labels.map((l, i) => ({
      grade: `${prefix}${i + 1}`,
      minScore: i < cuts.length ? cuts[i] : null,
      maxScore: i === 0 ? null : cuts[i - 1],
      labelFr: l,
    })),
    defaultGrades: DEFAULT_GRADES,
  };
}

// ---------------------------------------------------------------------------
// Ancrages qualitatifs communs (document 03, § 5)
// ---------------------------------------------------------------------------

const A_B4 = anchors(
  "Dette système cohérente avec l'activité et aucun incident",
  "Incident isolé, technique et prouvé",
  "Hausse de dette expliquée, capacité de remboursement préservée",
  "Hausse non expliquée ou incidents répétés",
  "Arriérés matériels non résolus ou restructuration en difficulté — à instruire comme défaut"
);
const A_A1 = anchors(
  "Secteur résilient en amélioration",
  "Secteur résilient stable",
  "Secteur cyclique à risque modéré",
  "Dégradation sectorielle documentée",
  "Crise durable ou activité structurellement non viable"
);
const A_G1 = anchors(
  "Équipe expérimentée, délégations en place et succession testée",
  "Équipe solide et relais identifié",
  "Organisation fonctionnelle mais dépendante d'une personne",
  "Dépendance forte et exécution dégradée",
  "Indisponibilité du dirigeant compromettant l'activité"
);
const A_G2 = anchors(
  "Flux avec les parties liées maîtrisés ; contrôles et obligations fiscales et sociales à jour",
  "Anomalies mineures corrigées",
  "Contrôles partiels ; plan d'apurement respecté",
  "Prélèvements liés matériels ou plan d'apurement fragile",
  "Ponction de trésorerie, ou passifs fiscaux et sociaux menaçant la continuité"
);
const A_C1 = anchors(
  "Faible impact climatique résiduel, démontré (sites, ressources, transition)",
  "Impact modéré, financé et maîtrisé",
  "Impact matériel, plan d'adaptation partiellement financé",
  "Impact élevé sans mitigation suffisante",
  "Menace sur la continuité sans solution crédible — une exposition inconnue ne reçoit jamais un ancrage favorable"
);

// ---------------------------------------------------------------------------
// Grille standard : 16 critères (document 03, § 2 à 5)
// ---------------------------------------------------------------------------

const stdCriteria: CriterionConfig[] = [
  {
    code: "F1",
    domainCode: "F",
    labelFr: "Fonds propres tangibles sur actif ajusté",
    descriptionFr:
      "100 × fonds propres tangibles / actif ajusté. Déduire non-valeurs, incorporels non réalisables et actifs sur associés non recouvrables ; comptes courants d'associés seulement si permanence et subordination documentées.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 800, PME: 1000, GE: 1000 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [35, 25, 15, 5]) },
    unavailablePolicy: "BLOCK",
    evidenceRequiredFr: ["Comptes et retraitements signés Finance/Risques"],
  },
  {
    code: "F2",
    domainCode: "F",
    labelFr: "Dette nette économique sur EBITDA",
    descriptionFr:
      "Dette financière économique nette / EBITDA ajusté, hors-bilan pertinent, leasing et recours inclus, sans double comptage. Seule la trésorerie réellement libre est déduite.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 800, PME: 1000, GE: 1200 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [1, 2, 3.5, 5]) },
    specialCases: [
      {
        code: "EBITDA_NON_POSITIF",
        labelFr: "EBITDA nul ou négatif : cas défavorable documenté, jamais un ratio favorable par changement de signe",
        score: 0,
      },
    ],
    unavailablePolicy: "BLOCK",
  },
  {
    code: "F3",
    domainCode: "F",
    labelFr: "DSCR prévisionnel à douze mois",
    descriptionFr:
      "CFADS prévisionnel / service total de la dette des douze prochains mois, toutes banques. CFADS = flux opérationnel après impôts, variation du BFR et investissements de maintien, avant service de la dette. Le stress est traité à part.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 1200, PME: 1200, GE: 1400 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.8, 1.4, 1.15, 1]) },
    unavailablePolicy: "BLOCK",
    notApplicableRule: {
      allowedCasesFr:
        "Aucune dette ni engagement assimilé, vérifiés toutes banques : le poids passe à la couverture des besoins de liquidité (F4). Jamais un score de 100 automatique.",
      transferWeightTo: "F4",
    },
    evidenceRequiredFr: ["Échéancier toutes banques", "CFADS et retraitements"],
  },
  {
    code: "F4",
    domainCode: "F",
    labelFr: "Couverture des besoins de liquidité à douze mois",
    descriptionFr:
      "Sources de liquidité mobilisables (cash libre, lignes confirmées non tirées, ressources fermes) / besoins de financement nets à douze mois, d'après un tableau emplois-ressources. Aucun financement espéré non engagé.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 800, PME: 800, GE: 800 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.5, 1.25, 1, 0.8]) },
    specialCases: [
      {
        code: "LIQUIDITE_EXCEDENTAIRE",
        labelFr: "Besoins nets nuls ou négatifs : liquidité excédentaire vérifiée",
        score: 100,
      },
    ],
    unavailablePolicy: "BLOCK",
  },
  {
    code: "F5",
    domainCode: "F",
    labelFr: "Rentabilité opérationnelle et tendance",
    descriptionFr:
      "Marge EBITDA retraitée, niveau sectoriel et tendance sur trois ans, sans produits exceptionnels. Une marge en forte baisse ne conserve pas le meilleur niveau sur son seul percentile.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500, PME: 700, GE: 800 },
    anchors: anchors(
      "Marge ≥ P75 du secteur, stable ou croissante",
      "Marge entre P50 et P75, stable",
      "Marge entre P25 et P50, positive",
      "Marge sous P25 positive, ou baisse marquée",
      "Marge négative ou pertes récurrentes"
    ),
    ...MISSING_LOW,
  },
  {
    code: "F6",
    domainCode: "F",
    labelFr: "Conversion de la performance en trésorerie",
    descriptionFr:
      "100 × flux opérationnel normalisé avant service de la dette / EBITDA ajusté, agrégé sur une période cohérente ; cessions de créances et éléments non récurrents retraités.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 500, PME: 700, GE: 800 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [90, 70, 50, 20]) },
    specialCases: [
      {
        code: "EBITDA_NON_POSITIF",
        labelFr: "EBITDA non positif : conversion non mesurable, consommation de cash à analyser",
        score: 0,
      },
    ],
    ...MISSING_LOW,
  },
  {
    code: "B1",
    domainCode: "B",
    labelFr: "Retards de paiement non techniques",
    descriptionFr:
      "Retard maximal sur douze mois, en jours, toutes facilités ; les anomalies techniques ne sont exclues que sur preuve et selon une règle validée.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 1200, PME: 1000, GE: 500 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [0, 7, 30, 60]) },
    unavailablePolicy: "BLOCK",
    evidenceRequiredFr: ["Système autoritatif de la banque (T24) et autres banques"],
  },
  {
    code: "B2",
    domainCode: "B",
    labelFr: "Dépassements non autorisés",
    descriptionFr:
      "Jours cumulés de dépassement non autorisé sur douze mois. Un dépassement bref mais très matériel déclenche une revue, même si le barème en jours est favorable.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 700, PME: 500, GE: 300 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [0, 3, 15, 30]) },
    ...MISSING_LOW,
  },
  {
    code: "B3",
    domainCode: "B",
    labelFr: "Tendance des encaissements nettoyés",
    descriptionFr:
      "Variation annuelle des encaissements commerciaux nettoyés (hors apports, crédits, mouvements circulaires et transferts internes), sur périodes homogènes corrigées de la saisonnalité.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 700, PME: 500, GE: 200 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [5, 0, -10, -25]) },
    ...MISSING_LOW,
  },
  {
    code: "B4",
    domainCode: "B",
    labelFr: "Dette système et incidents externes",
    descriptionFr: "Centrale des risques autorisée, incidents de paiement externes ; une restructuration pouvant relever du défaut n'est pas noyée ici.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 400, GE: 400 },
    anchors: A_B4,
    ...MISSING_LOW,
  },
  {
    code: "A1",
    domainCode: "A",
    labelFr: "Vulnérabilité sectorielle",
    descriptionFr: "Classe publiée par le comité secteur-pays : aucun choix individuel libre.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500, PME: 500, GE: 500 },
    anchors: A_A1,
    ...MISSING_LOW,
  },
  {
    code: "A2",
    domainCode: "A",
    labelFr: "Concentration économique nette",
    descriptionFr: "Le plus défavorable du premier client et du premier fournisseur, contrats examinés.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 400, GE: 400 },
    anchors: anchors(
      "Premier client ≤ 10 % et sources substituables",
      "Premier client de plus de 10 à 25 %",
      "Premier client de plus de 25 à 40 %",
      "Premier client de plus de 40 à 60 %, ou source difficilement remplaçable",
      "Premier client de plus de 60 %, ou dépendance vitale sans solution"
    ),
    ...MISSING_LOW,
  },
  {
    code: "A3",
    domainCode: "A",
    labelFr: "Visibilité des revenus",
    descriptionFr: "Revenus récurrents ou contrats fermes ; pour une activité sans carnet, mesure de récurrence définie par secteur.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 400, GE: 400 },
    anchors: anchors(
      "Revenus récurrents ou contrats fermes couvrant 12 mois ou plus",
      "Visibilité de 6 à moins de 12 mois",
      "Visibilité de 3 à moins de 6 mois",
      "Moins de 3 mois, visibilité faible",
      "Perte documentée d'un débouché vital"
    ),
    ...MISSING_LOW,
  },
  {
    code: "G1",
    domainCode: "G",
    labelFr: "Capacité du management et continuité",
    descriptionFr: "Les faits, pas la réputation seule. Le soutien du groupe n'apporte aucun point ici.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 300, GE: 400 },
    anchors: A_G1,
    ...MISSING_LOW,
  },
  {
    code: "G2",
    domainCode: "G",
    labelFr: "Gouvernance financière et parties liées",
    descriptionFr: "Flux liés, contrôles, obligations fiscales et sociales. La qualité des comptes est suivie hors score (classe de confiance).",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 300, GE: 400 },
    anchors: A_G2,
    ...MISSING_LOW,
  },
  {
    code: "C1",
    domainCode: "C",
    labelFr: "Impact climatique résiduel matériel",
    descriptionFr:
      "Exposition physique et de transition des sites et des ressources, impact sur les flux et plan d'adaptation financé. Le risque pays et le change sont traités dans les scénarios.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 300, GE: 500 },
    anchors: A_C1,
    ...MISSING_LOW,
  },
];

export const CORP_STD_CHALLENGER_V1: ModelConfig = {
  modelId: "CORP_STD_CHALLENGER_V1",
  version: "0.1.0",
  labelFr: "Grille challenger standard (16 critères) — pilote, en parallèle de CORP_STD_V1",
  status: "DRAFT_EXPERT_SEED",
  routeFamily: "STANDARD",
  mandatoryReviews: [
    { criterion: "F3", operator: "LT", threshold: 1, labelFr: "DSCR prévisionnel inférieur à 1 en scénario de base" },
    { criterion: "F4", operator: "LT", threshold: 1, labelFr: "besoins de liquidité à douze mois non couverts sans financement ferme" },
  ],
  concentrationCapBps: 1500,
  effectiveFrom: "2026-11-01",
  conventionFr: "Score 100 = risque le plus faible ; score 0 = risque le plus élevé. S = somme des poids × scores / 100.",
  segments: ["TPE", "PME", "GE"],
  philosophy: CORP_STD_V1.philosophy,
  domains: [
    { code: "F", labelFr: "Finance : solvabilité, levier, service de la dette, liquidité" },
    { code: "B", labelFr: "Comportement bancaire" },
    { code: "A", labelFr: "Activité et secteur" },
    { code: "G", labelFr: "Gouvernance (hors soutien)" },
    { code: "C", labelFr: "Climat" },
  ],
  criteria: stdCriteria,
  gradeScale: scale(
    "STD-CIBLE-PILOTE",
    "Échelle provisoire de la grille challenger standard (coupures de l'échelle actuelle, sans transfert de performance ni de PD)",
    "STD-S",
    [88, 82, 76, 70, 64, 57, 48],
    ["Très solide", "Solide", "Bon", "Satisfaisant", "Acceptable", "Fragile", "Faible", "Très faible"]
  ),
  nonCompensatoryRules: [],
  redFlags: CORP_STD_V1.redFlags,
  confidence: CORP_STD_V1.confidence,
  // Porte de données du document 03 : 80 % du poids global observé, 60 % par famille.
  coverage: { minGlobalObservedBps: 8000, minDomainObservedBps: 6000 },
  groupSupport: {
    maxNotches: 0,
    requiresAllConditions: true,
    methodFr:
      "Aucun cran accordé par la grille : la note autonome est seule produite. L'appréciation soutenue (capacité, volonté, force juridique, transfert effectif ; note et engagements du garant) est instruite séparément, selon une politique de crans à valider.",
  },
  segmentationRulesetId: "SEG-2026.1",
  pdStatus: "UNCALIBRATED",
  disclaimerFr: DISCLAIMER,
};

// ---------------------------------------------------------------------------
// Grille TPE comportementale : 12 critères (document 03, § 6 et 7)
// ---------------------------------------------------------------------------

const tpeCriteria: CriterionConfig[] = [
  {
    code: "T1",
    domainCode: "TC",
    labelFr: "Retards et impayés",
    descriptionFr: "Retard maximal sur douze mois, en jours.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 1500 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [0, 7, 30, 60]) },
    unavailablePolicy: "BLOCK",
  },
  {
    code: "T2",
    domainCode: "TC",
    labelFr: "Dépassements non autorisés",
    descriptionFr: "Jours cumulés de dépassement non autorisé sur douze mois.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 1000 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [0, 3, 15, 30]) },
    ...MISSING_LOW,
  },
  {
    code: "T3",
    domainCode: "TS",
    labelFr: "Capacité de service de la dette par les flux",
    descriptionFr:
      "Cash disponible pour servir la dette après achats, charges nécessaires, prélèvements normatifs, impôts et investissements de maintien, corrigé des financements et mouvements circulaires / dettes toutes banques et engagements assimilés. Pas le ratio des encaissements bruts sur les échéances.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 2000 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.8, 1.4, 1.15, 1]) },
    unavailablePolicy: "BLOCK",
  },
  {
    code: "T4",
    domainCode: "TS",
    labelFr: "Tendance des encaissements nettoyés",
    descriptionFr: "Variation annuelle des flux économiques nettoyés, sur fenêtres saisonnières équivalentes.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 1000 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [5, 0, -10, -25]) },
    unavailablePolicy: "BLOCK",
  },
  {
    code: "T5",
    domainCode: "TS",
    labelFr: "Volatilité après correction saisonnière",
    descriptionFr: "Coefficient de variation résiduel des encaissements mensuels, après correction de la saisonnalité normale.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 800 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [15, 25, 40, 60]) },
    ...MISSING_LOW,
  },
  {
    code: "T6",
    domainCode: "TS",
    labelFr: "Réserve de liquidité",
    descriptionFr: "Réserve en jours de sorties nécessaires.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 700 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [45, 30, 15, 7]) },
    unavailablePolicy: "BLOCK",
  },
  {
    code: "T7",
    domainCode: "TC",
    labelFr: "Dette et incidents externes",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: A_B4,
    ...MISSING_LOW,
  },
  {
    code: "T8",
    domainCode: "TA",
    labelFr: "Vulnérabilité sectorielle",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: A_A1,
    ...MISSING_LOW,
  },
  {
    code: "T9",
    domainCode: "TA",
    labelFr: "Concentration et récurrence de la clientèle",
    descriptionFr: "Le plus défavorable des ancrages de concentration et de visibilité des revenus, avec adaptation sectorielle publiée.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: anchors(
      "Premier client ≤ 10 % et revenus récurrents sur 12 mois ou plus",
      "Premier client ≤ 25 % et visibilité de 6 à 12 mois",
      "Premier client ≤ 40 % et visibilité de 3 à 6 mois",
      "Premier client ≤ 60 % ou visibilité de moins de 3 mois",
      "Dépendance vitale ou perte documentée d'un débouché vital"
    ),
    ...MISSING_LOW,
  },
  {
    code: "T10",
    domainCode: "TG",
    labelFr: "Management et continuité",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: A_G1,
    ...MISSING_LOW,
  },
  {
    code: "T11",
    domainCode: "TG",
    labelFr: "Discipline fiscale, sociale et financière",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: A_G2,
    ...MISSING_LOW,
  },
  {
    code: "T12",
    domainCode: "TE",
    labelFr: "Impact climatique résiduel",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: A_C1,
    ...MISSING_LOW,
  },
];

export const CORP_TPE_CHALLENGER_V1: ModelConfig = {
  modelId: "CORP_TPE_CHALLENGER_V1",
  version: "0.1.0",
  labelFr: "Grille challenger TPE comportementale (12 critères) — pilote, en parallèle de CORP_TPE_BEHAV_V1",
  status: "DRAFT_EXPERT_SEED",
  routeFamily: "BEHAVIORAL",
  mandatoryReviews: [
    { criterion: "T3", operator: "LT", threshold: 1, labelFr: "service de la dette non couvert par les flux" },
  ],
  concentrationCapBps: 2000,
  effectiveFrom: "2026-11-01",
  conventionFr: "Score 100 = risque le plus faible ; score 0 = risque le plus élevé. S = somme des poids × scores / 100.",
  segments: ["TPE"],
  philosophy: CORP_TPE_BEHAV_V1.philosophy,
  domains: [
    { code: "TC", labelFr: "Comportement de paiement et incidents" },
    { code: "TS", labelFr: "Flux, service de la dette et liquidité" },
    { code: "TA", labelFr: "Activité et clientèle" },
    { code: "TG", labelFr: "Gouvernance et discipline (hors soutien)" },
    { code: "TE", labelFr: "Climat" },
  ],
  criteria: tpeCriteria,
  gradeScale: scale(
    "TPE-CIBLE-PILOTE",
    "Échelle provisoire de la grille challenger TPE (coupures de l'échelle actuelle, sans transfert de performance ni de PD)",
    "TPE-T",
    [85, 76, 68, 60, 50],
    ["Très solide", "Solide", "Correct", "Acceptable", "Fragile", "Faible"]
  ),
  nonCompensatoryRules: [],
  redFlags: CORP_TPE_BEHAV_V1.redFlags,
  confidence: CORP_TPE_BEHAV_V1.confidence,
  coverage: { minGlobalObservedBps: 8000, minDomainObservedBps: 6000 },
  groupSupport: CORP_STD_CHALLENGER_V1.groupSupport,
  segmentationRulesetId: "SEG-2026.1",
  pdStatus: "UNCALIBRATED",
  disclaimerFr: DISCLAIMER,
};
