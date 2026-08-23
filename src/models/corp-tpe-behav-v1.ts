import type { CriterionConfig, ModelConfig } from "@/core/types";
import { anchors, bins5 } from "./helpers";
import { CORP_STD_V1 } from "./corp-std-v1";

/**
 * CORP_TPE_BEHAV_V1 — Variante TPE comportementale (seed séparé).
 *
 * Utilisée uniquement lorsque les états financiers standard sont insuffisants
 * mais que les flux bancaires et informations alternatives sont fiables.
 * Conditions minimales d'éligibilité (grilles §2.4) :
 *  - ≥ 12 mois d'historique de compte exploitable ;
 *  - CA ou mouvements créditeurs raisonnablement vérifiés ;
 *  - encours, limites et incidents disponibles ;
 *  - identité, activité et obligations documentaires validées ;
 *  - absence de red flag bloquant.
 *
 * Les scores des deux modèles ne sont pas comparés sans table de
 * correspondance validée.
 */

const criteria: CriterionConfig[] = [
  // --- B1 — Comportement de crédit (30 %) ---------------------------------
  {
    code: "B1.1",
    domainCode: "B1",
    labelFr: "DPD et impayés 12/24 mois",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 800 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [0, 7, 30, 60]) },
    specialCases: [
      {
        code: "UNPAID_NOT_CURED",
        labelFr: "Impayé non régularisé — à instruire avec RF06/RF07",
        score: 0,
      },
      {
        code: "UNLIKELY_TO_PAY",
        labelFr: "Signal d'incapacité probable de payer — à instruire avec RF06",
        score: 0,
      },
    ],
    missingPolicy: "BLOCK",
    critical: true,
  },
  {
    code: "B1.2",
    domainCode: "B1",
    labelFr: "Dépassements et irrégularités",
    type: "QUALITATIVE",
    weightsBps: { TPE: 600 },
    anchors: anchors(
      "Aucun dépassement non autorisé",
      "Un dépassement ≤ 3 jours et ≤ 5 % de la ligne, régularisé spontanément",
      "4–15 jours cumulés ou 2–3 épisodes, montant ≤ 10 % de la ligne",
      "16–30 jours cumulés, épisodes mensuels ou montant > 10 %",
      "> 30 jours, dépassement permanent, compte bloqué ou absence d'autorisation"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B1.3",
    domainCode: "B1",
    labelFr: "Mouvements créditeurs vérifiés et tendance",
    descriptionFr:
      "Mouvements créditeurs observés / flux attendus (%). Un compte secondaire ne peut être annualisé sans preuve de la part de flux domiciliée.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 700 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [110, 90, 70, 50]) },
    missingPolicy: "BLOCK",
    critical: true,
  },
  {
    code: "B1.4",
    domainCode: "B1",
    labelFr: "Utilisation des lignes et marge disponible",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "Utilisation moyenne 20–70 %, pics cohérents, marge disponible",
      "10–20 % ou 70–85 %, utilisation stable et justifiée",
      "85–95 % ou hausse > 20 points sur six mois, sans dépassement",
      "> 95 % pendant plus de trois mois ou dépendance au renouvellement",
      "> 100 % non autorisé ou besoin structurel non financé"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B1.5",
    domainCode: "B1",
    labelFr: "Chèques/effets et incidents externes autorisés",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: anchors(
      "Absence d'incident vérifiée auprès des sources autorisées",
      "Un incident mineur, erreur technique démontrée, régularisé ≤ 5 jours",
      "Un à deux incidents régularisés ≤ 30 jours, montant non matériel",
      "Incidents récurrents, régularisation tardive ou incident matériel",
      "Incident grave/non régularisé, interdiction ou signal bloquant"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B2 — Capacité par flux (20 %) ---------------------------------------
  {
    code: "B2.1",
    domainCode: "B2",
    labelFr: "Couverture du service de dette par flux observés",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 700 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.5, 1.3, 1.15, 1.0]) },
    missingPolicy: "BLOCK",
    critical: true,
  },
  {
    code: "B2.2",
    domainCode: "B2",
    labelFr: "Stabilité mensuelle des encaissements",
    descriptionFr: "Coefficient de variation mensuel des encaissements (%), tendance ≥ 0.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 500 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [15, 25, 40, 60]) },
    specialCases: [
      {
        code: "FLOWS_DOWN_OVER_30PCT",
        labelFr: "Encaissements en baisse de plus de 30 % sur la période",
        score: 0,
      },
      {
        code: "FLOWS_DOWN_OVER_15PCT",
        labelFr: "Encaissements en baisse de plus de 15 % sur la période",
        score: 25,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B2.3",
    domainCode: "B2",
    labelFr: "Solde minimum, jours débiteurs et liquidité",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "Aucun jour débiteur non autorisé, solde de sécurité > 30 jours de charges",
      "≤ 3 jours débiteurs et solde > 20 jours de charges",
      "4–15 jours débiteurs et solde > 10 jours de charges",
      "16–30 jours débiteurs ou solde < 10 jours de charges",
      "> 30 jours débiteurs ou rupture de trésorerie"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B2.4",
    domainCode: "B2",
    labelFr: "Saisonnalité et résistance à un choc de flux",
    descriptionFr: "Couverture du service de dette après choc de flux −20 %.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 400 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.3, 1.15, 1.0, 0.8]) },
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B3 — Activité (18 %) -------------------------------------------------
  {
    code: "B3.1",
    domainCode: "B3",
    labelFr: "Risque sectoriel",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "S1 — secteur très résilient",
      "S2 — secteur résilient",
      "S3 — secteur moyen/cyclique maîtrisable",
      "S4 — secteur vulnérable/sous surveillance",
      "S5 — secteur très vulnérable/crise structurelle"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B3.2",
    domainCode: "B3",
    labelFr: "Ancienneté et continuité de l'activité",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " ans",
    weightsBps: { TPE: 300 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [7, 5, 3, 2]) },
    specialCases: [
      {
        code: "UNDER_2Y_NO_SUPPORT",
        labelFr: "Moins de deux ans d'activité sans support ni contrat structurant — déclenche le cap CAP01",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B3.3",
    domainCode: "B3",
    labelFr: "Concentration clients/fournisseurs",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "Concentration très faible, alternatives disponibles",
      "Concentration faible, contrats sécurisés",
      "Concentration moyenne, substituabilité raisonnable",
      "Concentration élevée ou dépendance difficilement remplaçable",
      "Concentration critique, mono-client ou mono-source vital"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B3.4",
    domainCode: "B3",
    labelFr: "Marge brute ou proxy vérifié",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "≥ P75 secteur, rapprochée des flux",
      "P50–P75",
      "P25–P50",
      "P10–P25",
      "< P10, négative ou non fiable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B3.5",
    domainCode: "B3",
    labelFr: "Contrats, commandes et récurrence",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "Revenus fortement sécurisés ou récurrents, contreparties solides",
      "Bonne visibilité, annulations faibles",
      "Visibilité moyenne cohérente avec le secteur",
      "Faible visibilité, carnet non ferme ou churn élevé",
      "Aucune visibilité, carnet artificiel ou arrêt prévisible"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B4 — Management (12 %) -----------------------------------------------
  {
    code: "B4.1",
    domainCode: "B4",
    labelFr: "Expérience du dirigeant",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400 },
    anchors: anchors(
      "> 10 ans d'expérience pertinente, réalisations vérifiées",
      "5–10 ans, résultats cohérents",
      "3–5 ans ou reprise récente maîtrisée",
      "Expérience limitée, objectifs non atteints",
      "Incompétence manifeste ou information trompeuse"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B4.2",
    domainCode: "B4",
    labelFr: "Dépendance homme-clé",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "Responsabilités distribuées, relais opérationnels en place",
      "Dépendance limitée, adjoint compétent",
      "Dépendance réelle mais remplaçable en 3–6 mois",
      "Dirigeant concentre tout, succession absente",
      "Indisponibilité compromettant immédiatement l'activité"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B4.3",
    domainCode: "B4",
    labelFr: "Organisation et contrôles minimums",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200 },
    anchors: anchors(
      "Organisation claire, contrôles essentiels effectifs",
      "Organisation correcte, quelques contrôles informels",
      "Organisation informelle mais fonctionnelle",
      "Contrôles faibles, incidents récurrents",
      "Absence de contrôle ou irrégularités"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B4.4",
    domainCode: "B4",
    labelFr: "Succession / continuité",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "Succession identifiée et plan testé",
      "Relais crédible identifié",
      "Plan partiel",
      "Aucune succession crédible",
      "Continuité immédiatement menacée"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B5 — Transparence et conformité (12 %) --------------------------------
  {
    code: "B5.1",
    domainCode: "B5",
    labelFr: "Documents et autorisations",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "Documents complets, valides et vérifiés",
      "Lacune mineure corrigée rapidement",
      "Documents partiels mais activité établie",
      "Documents expirés ou incomplets",
      "Documents faux/refusés ou activité non autorisée"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B5.2",
    domainCode: "B5",
    labelFr: "Rapprochement flux / CA déclaré / fiscal",
    descriptionFr: "Écart (%) entre flux bancaires annualisés, CA déclaré et données fiscales.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 400 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [5, 10, 20, 30]) },
    specialCases: [
      {
        code: "MAJOR_INCONSISTENCY",
        labelFr: "Incohérence majeure entre flux, chiffre d'affaires déclaré et données fiscales",
        score: 0,
      },
    ],
    missingPolicy: "BLOCK",
    critical: true,
  },
  {
    code: "B5.3",
    domainCode: "B5",
    labelFr: "Situation fiscale et sociale",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "Obligations à jour, aucun arriéré",
      "Retard mineur régularisé",
      "Plan d'apurement respecté",
      "Arriérés matériels ou plan fragile",
      "Dette non soutenable ou mesure d'exécution majeure"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "B5.4",
    domainCode: "B5",
    labelFr: "Actionnariat / UBO / KYC",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200 },
    anchors: anchors(
      "UBO et pouvoirs complets et vérifiés",
      "Lacune mineure sans ambiguïté",
      "Structure raisonnablement établie",
      "Chaîne de détention opaque",
      "UBO impossible à établir ou blocage KYC"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B6 — Groupe / support (5 %) -------------------------------------------
  {
    code: "B6.1",
    domainCode: "B6",
    labelFr: "Groupe, garant et soutien démontré",
    type: "QUALITATIVE",
    weightsBps: { TPE: 500 },
    anchors: anchors(
      "Support juridiquement engageant d'un tiers très solide, historique démontré",
      "Soutien documenté mais non totalement contraignant",
      "Entité autonome sans besoin de support",
      "Soutien incertain ou garant lui-même fragile",
      "Groupe en difficulté, ponctions de cash ou soutien promis non honoré"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // --- B7 — ESG / climat (3 %) -----------------------------------------------
  {
    code: "B7.1",
    domainCode: "B7",
    labelFr: "Risques ESG/climat matériels",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300 },
    anchors: anchors(
      "Exposition faible vérifiée",
      "Exposition modérée, mitigations en place",
      "Exposition matérielle cartographiée, plan partiel",
      "Exposition élevée, mitigation insuffisante",
      "Activité menacée à court terme sans solution viable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
];

export const CORP_TPE_BEHAV_V1: ModelConfig = {
  modelId: "CORP_TPE_BEHAV_V1",
  version: "1.0.0",
  labelFr: "Modèle TPE comportemental — flux bancaires et informations alternatives",
  status: "DRAFT_EXPERT_SEED",
  effectiveFrom: "2026-08-18",
  conventionFr: "Score 100 = risque le plus faible ; score 0 = risque le plus élevé.",
  segments: ["TPE"],
  domains: [
    { code: "B1", labelFr: "Comportement de crédit" },
    { code: "B2", labelFr: "Capacité par flux" },
    { code: "B3", labelFr: "Activité" },
    { code: "B4", labelFr: "Management" },
    { code: "B5", labelFr: "Transparence et conformité" },
    { code: "B6", labelFr: "Groupe / support" },
    { code: "B7", labelFr: "ESG / climat" },
  ],
  criteria,
  masterScale: CORP_STD_V1.masterScale,
  structuralCaps: CORP_STD_V1.structuralCaps.filter((c) =>
    ["CAP01", "CAP03", "CAP04", "CAP09", "CAP10"].includes(c.code)
  ),
  redFlags: CORP_STD_V1.redFlags,
  confidenceWeights: CORP_STD_V1.confidenceWeights,
  confidenceCaps: CORP_STD_V1.confidenceCaps,
  segmentation: CORP_STD_V1.segmentation,
  pdStatus: "UNCALIBRATED",
  disclaimerFr: CORP_STD_V1.disclaimerFr,
};
