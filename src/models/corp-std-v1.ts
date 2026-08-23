import type { CriterionConfig, ModelConfig } from "@/core/types";
import { anchors, bins5 } from "./helpers";

/**
 * CORP_STD_V1 — Modèle expert initial de notation interne des entreprises
 * non financières marocaines (TPE, PME, GE).
 *
 * Source : « Modèle de scoring entreprises Maroc V1.0 — grilles détaillées ».
 * Statut : DRAFT_EXPERT_SEED — pondérations, seuils et barèmes experts,
 * NON calibrés, NON réglementaires. À challenger sur l'historique de la
 * banque, calibrer, valider indépendamment et approuver avant tout usage
 * de décision automatisée, IFRS 9, tarification ou capital réglementaire.
 *
 * Poids exprimés en points de base du score global (300 = 3,00 %).
 */

const criteria: CriterionConfig[] = [
  // =========================================================================
  // D1 — Performance financière et structure bilancielle
  // =========================================================================
  {
    code: "D1.1",
    domainCode: "D1",
    labelFr: "Croissance et stabilité du chiffre d'affaires",
    descriptionFr:
      "CAGR sur trois exercices, nombre d'années en baisse et volatilité vs secteur. Une croissance excessive financée par dette/BFR est examinée aussi en D4.8.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 300, GE: 300 },
    anchors: anchors(
      "CAGR +3 % à +20 %, aucune baisse annuelle > 10 %, volatilité faible, ≥ médiane sectorielle",
      "CAGR 0 % à +3 % ou +20 % à +30 % ; une baisse ponctuelle ≤ 10 % expliquée et corrigée",
      "CAGR −5 % à 0 %, ou > +30 % avec tension BFR maîtrisable, ou volatilité matérielle sans tendance durable",
      "CAGR −15 % à −5 %, ou deux exercices consécutifs en baisse, ou écart défavorable au secteur > 10 points",
      "CAGR < −15 %, effondrement récent > 25 %, perte majeure de clientèle ou CA non fiable"
    ),
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["États financiers N, N−1, N−2", "Comparaison sectorielle datée"],
  },
  {
    code: "D1.2",
    domainCode: "D1",
    labelFr: "Marge EBITDA / performance opérationnelle",
    descriptionFr:
      "EBITDA ajusté/CA, percentile sectoriel, tendance sur trois ans. Si l'EBITDA est non pertinent pour l'activité, utiliser un indicateur opérationnel équivalent validé.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 400, GE: 400 },
    anchors: anchors(
      "Marge ≥ P75 sectoriel, positive sur trois ans et stable/améliorée de ≥ 1 point",
      "Marge entre P50 et P75, positive et stable à ±1 point",
      "Marge entre P25 et P50, ou baisse de 1 à 3 points en restant positive",
      "Marge entre P10 et P25, ou baisse > 3 points, ou un exercice proche de zéro",
      "Marge négative au dernier exercice, < P10, pertes opérationnelles récurrentes ou EBITDA non fiable"
    ),
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["EBITDA ajusté et trace des retraitements", "Référentiel sectoriel daté"],
  },
  {
    code: "D1.3",
    domainCode: "D1",
    labelFr: "Rentabilité économique / ROA ajusté",
    descriptionFr:
      "Résultat opérationnel après impôt normatif / actifs économiques moyens, comparaison sectorielle et volatilité.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 300, GE: 300 },
    anchors: anchors(
      "≥ P75 sectoriel, positif sur trois ans, sans dépendance à un produit exceptionnel",
      "P50 à P75, positif et stable",
      "P25 à P50, faible mais positif, ou un exercice déficitaire non récurrent",
      "P10 à P25, proche de zéro ou forte dépendance à des éléments non récurrents",
      "Négatif au dernier exercice et tendance non corrigée, ou < P10 sur deux exercices"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D1.4",
    domainCode: "D1",
    labelFr: "Fonds propres tangibles / total bilan",
    descriptionFr:
      "FP tangibles / total bilan ajusté, en %. Une réévaluation non liquide ou une créance sur associé ne vaut pas recapitalisation en cash. Comptes courants d'associés assimilés aux FP uniquement si subordination, blocage et permanence approuvés.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    formulaFr: "FP_tangibles / total_bilan_ajusté",
    weightsBps: { TPE: 400, PME: 500, GE: 400 },
    binsBySegment: {
      TPE: bins5("HIGHER_IS_BETTER", [35, 25, 15, 5]),
      PME: bins5("HIGHER_IS_BETTER", [35, 25, 15, 8]),
      GE: bins5("HIGHER_IS_BETTER", [30, 20, 12, 5]),
    },
    specialCases: [
      {
        code: "NEGATIVE_TANGIBLE_EQUITY",
        labelFr: "Fonds propres tangibles négatifs — déclenche également le cap CAP02",
        score: 0,
      },
    ],
    missingPolicy: "BLOCK",
    critical: true,
    evidenceRequiredFr: ["Bilan et retraitements des incorporels/non-valeurs"],
  },
  {
    code: "D1.5",
    domainCode: "D1",
    labelFr: "Dette financière nette / EBITDA ajusté",
    descriptionFr:
      "Dette nette négative : score 100 uniquement si trésorerie libre, durable, rapprochée et non affectée. Holding : look-through des flux/dividendes, pas d'application mécanique.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: "x",
    formulaFr: "dette_financière_nette / EBITDA_ajusté",
    weightsBps: { TPE: 400, PME: 500, GE: 500 },
    binsBySegment: {
      TPE: bins5("LOWER_IS_BETTER", [1.0, 2.0, 3.5, 5.0]),
      PME: bins5("LOWER_IS_BETTER", [1.5, 2.5, 3.5, 5.0]),
      GE: bins5("LOWER_IS_BETTER", [1.5, 2.5, 3.5, 4.5]),
    },
    specialCases: [
      {
        code: "EBITDA_LTE_0",
        labelFr: "EBITDA nul ou négatif : le levier n'est pas calculable, la situation est défavorable",
        score: 0,
      },
    ],
    missingPolicy: "BLOCK",
    critical: true,
    evidenceRequiredFr: ["États financiers", "Trace des retraitements dette/trésorerie"],
  },
  {
    code: "D1.6",
    domainCode: "D1",
    labelFr: "Liquidité court terme",
    descriptionFr:
      "Actif circulant réalisable CT / passif circulant exigible, stocks obsolètes et créances douteuses retraités. Secteurs à BFR structurellement négatif : sous-modèle cash/stress validé.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 400, PME: 400, GE: 300 },
    binsBySegment: {
      TPE: bins5("HIGHER_IS_BETTER", [1.5, 1.25, 1.0, 0.8]),
      PME: bins5("HIGHER_IS_BETTER", [1.5, 1.25, 1.0, 0.8]),
      GE: bins5("HIGHER_IS_BETTER", [1.4, 1.2, 1.0, 0.85]),
    },
    specialCases: [
      {
        code: "CASH_BREAK",
        labelFr: "Rupture de trésorerie avérée sur la période",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D1.7",
    domainCode: "D1",
    labelFr: "BFR et cycle de conversion de trésorerie",
    descriptionFr:
      "DSO + DIO − DPO, évolution en jours et percentile sectoriel. Un DPO artificiellement élevé lié à des fournisseurs impayés est défavorable.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 300, GE: 300 },
    anchors: anchors(
      "Cycle ≤ P25 sectoriel, stable ou amélioré ; aucune tension fournisseur",
      "Entre P25 et P50 ; détérioration ≤ 5 jours",
      "Entre P50 et P75 ou détérioration de 6 à 15 jours, financée sans dépassement",
      "> P75 ou détérioration de 16 à 45 jours ; stocks/créances vieillissants",
      "> P90 avec détérioration > 45 jours, actifs non recouvrables, fournisseurs durablement impayés ou BFR non finançable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D1.8",
    domainCode: "D1",
    labelFr: "Conversion EBITDA en cash-flow opérationnel",
    descriptionFr:
      "Moyenne pondérée sur trois ans de CFO ajusté / EBITDA ajusté (50 % N, 30 % N−1, 20 % N−2), en %. Si EBITDA ≤ 0 : score 0 sauf règle spécifique documentée.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    formulaFr: "0,5×(CFO/EBITDA)_N + 0,3×(CFO/EBITDA)_N−1 + 0,2×(CFO/EBITDA)_N−2",
    weightsBps: { TPE: 200, PME: 300, GE: 500 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [90, 70, 50, 20]) },
    specialCases: [
      {
        code: "EBITDA_LTE_0",
        labelFr: "EBITDA nul ou négatif : la conversion en trésorerie n'est pas mesurable",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D2 — Capacité de remboursement et stress
  // =========================================================================
  {
    code: "D2.1",
    domainCode: "D2",
    labelFr: "Couverture des intérêts",
    descriptionFr:
      "EBITDA ajusté / charges financières cash ajustées. Holding : cash-flow récurrent disponible / intérêts.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 150, PME: 200, GE: 300 },
    binsBySegment: {
      TPE: bins5("HIGHER_IS_BETTER", [5.0, 3.0, 2.0, 1.0]),
      PME: bins5("HIGHER_IS_BETTER", [5.0, 3.0, 2.0, 1.2]),
      GE: bins5("HIGHER_IS_BETTER", [6.0, 4.0, 2.5, 1.5]),
    },
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D2.2",
    domainCode: "D2",
    labelFr: "DSCR / couverture du service de la dette",
    descriptionFr:
      "CFADS / (intérêts + principal exigibles), service de dette complet y compris leasing et dette assimilée. Revolving sans amortissement : convention de conversion documentée.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 300, PME: 400, GE: 500 },
    binsBySegment: {
      TPE: bins5("HIGHER_IS_BETTER", [1.5, 1.3, 1.15, 1.0]),
      PME: bins5("HIGHER_IS_BETTER", [1.6, 1.35, 1.2, 1.0]),
      GE: bins5("HIGHER_IS_BETTER", [1.75, 1.4, 1.2, 1.0]),
    },
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["Échéancier complet de la dette", "CFADS et retraitements"],
  },
  {
    code: "D2.3",
    domainCode: "D2",
    labelFr: "Free cash-flow / dette financière",
    descriptionFr:
      "FCF récurrent / dette financière brute moyenne, en %. Un ratio élevé dû à des capex de maintien artificiellement faibles doit être retraité.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 100, PME: 200, GE: 300 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [20, 12, 5, 0]) },
    specialCases: [
      {
        code: "FCF_NEGATIVE_2_OF_3",
        labelFr: "Free cash-flow négatif deux années sur trois",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D2.4",
    domainCode: "D2",
    labelFr: "Liquidité disponible et mur de dette",
    descriptionFr:
      "Cash libre + lignes confirmées disponibles rapportés aux besoins et échéances des 12 prochains mois.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 150, PME: 200, GE: 300 },
    anchors: anchors(
      "Couverture ≥ 12 mois, headroom ≥ 30 %, aucune échéance concentrée non financée",
      "Couverture 9–12 mois, headroom 20–30 %, refinancement très probable et documenté",
      "Couverture 6–9 mois, headroom 10–20 %, dépendance modérée au renouvellement",
      "Couverture 3–6 mois, headroom < 10 %, mur de dette proche ou lignes non confirmées",
      "Couverture < 3 mois, gap avéré, refinancement non sécurisé ou rupture prévisible"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D2.5",
    domainCode: "D2",
    labelFr: "Résistance au scénario de stress",
    descriptionFr:
      "DSCR minimal sous choc combiné seed (CA −10 %, marge −2 pts, taux +200 pb, DSO +15 j, change) — chocs définitifs calibrés sur l'historique et les stress BAM/internes (Directive 2/G/10).",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: "x",
    weightsBps: { TPE: 200, PME: 300, GE: 400 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [1.4, 1.2, 1.0, 0.8]) },
    specialCases: [
      {
        code: "STRESS_LIQUIDITY_BREAK",
        labelFr: "Rupture de liquidité sous stress, sans mesure de redressement crédible",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D2.6",
    domainCode: "D2",
    labelFr: "Covenants et marge de sécurité",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 200, GE: 200 },
    anchors: anchors(
      "Aucun covenant financier ou marge ≥ 30 % sur tous les covenants ; reporting à jour",
      "Marge entre 20 % et 30 % ; aucune tendance de rupture",
      "Marge entre 10 % et 20 % ou waiver ancien régularisé",
      "Marge entre 0 % et 10 %, waiver en cours ou reporting incomplet",
      "Covenant rompu non régularisé, information dissimulée ou accélération possible de dette"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D3 — Comportement bancaire, incidents et historique de crédit
  // =========================================================================
  {
    code: "D3.1",
    domainCode: "D3",
    labelFr: "Retards de paiement / DPD",
    descriptionFr:
      "Maximum de jours de retard sur 12 mois (fréquence et 24 mois pour récidive en analyse). La définition de défaut et la classification réglementaire s'appliquent séparément.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 600, PME: 500, GE: 250 },
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
    evidenceRequiredFr: ["Système autoritatif DPD banque"],
  },
  {
    code: "D3.2",
    domainCode: "D3",
    labelFr: "Dépassements et irrégularités de compte",
    descriptionFr: "Sur 12 mois glissants.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 300, GE: 150 },
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
    code: "D3.3",
    domainCode: "D3",
    labelFr: "Utilisation des lignes",
    descriptionFr:
      "Moyenne, maximum, saisonnalité et variation de l'utilisation des lignes confirmées. Une utilisation moyenne saine se situe entre 20 % et 70 %.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 200, GE: 100 },
    anchors: anchors(
      "Utilisation moyenne 20–70 %, pics cohérents avec la saisonnalité, marge disponible",
      "10–20 % ou 70–85 %, utilisation stable et justifiée",
      "85–95 %, ou hausse > 20 points sur six mois, sans dépassement",
      "> 95 % pendant plus de trois mois, pics fréquents ou dépendance au renouvellement",
      "> 100 % non autorisé, ligne saturée sans capacité de réduction ou besoin structurel non financé"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D3.4",
    domainCode: "D3",
    labelFr: "Mouvements créditeurs et domiciliation",
    descriptionFr:
      "Mouvements créditeurs observés / flux attendus (%), tendance 12 mois et part des flux domiciliés. Virements circulaires et mouvements artificiels exclus.",
    type: "QUANTITATIVE",
    direction: "HIGHER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 400, PME: 300, GE: 150 },
    binsBySegment: { ALL: bins5("HIGHER_IS_BETTER", [110, 90, 70, 50]) },
    specialCases: [
      {
        code: "ARTIFICIAL_FLOWS",
        labelFr: "Mouvements créditeurs artificiels (virements circulaires, allers-retours)",
        score: 0,
      },
      {
        code: "BANKING_ACTIVITY_STOPPED",
        labelFr: "Activité bancaire quasi arrêtée sur la période",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D3.5",
    domainCode: "D3",
    labelFr: "Incidents chèques et effets de commerce",
    descriptionFr: "Sur 24 mois, sources autorisées (SCIP/centrale des incidents).",
    type: "QUALITATIVE",
    weightsBps: { TPE: 400, PME: 300, GE: 100 },
    anchors: anchors(
      "Absence d'incident vérifiée auprès des sources autorisées",
      "Un incident mineur, erreur technique démontrée, régularisé ≤ 5 jours",
      "Un à deux incidents régularisés ≤ 30 jours, montant non matériel",
      "Incidents récurrents, régularisation tardive ou incident matériel",
      "Incident grave/non régularisé, interdiction ou signal bloquant selon dispositif applicable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D3.6",
    domainCode: "D3",
    labelFr: "Restructuration et forbearance",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 200, GE: 150 },
    anchors: anchors(
      "Aucune restructuration ni concession liée à une difficulté financière",
      "Restructuration ancienne > 36 mois, période probatoire achevée, performance durable",
      "Restructuration entre 24 et 36 mois, paiements réguliers, surveillance en cours",
      "Restructuration < 24 mois, concession significative ou dépendance à un moratoire",
      "Échec de restructuration, seconde concession, impayé post-restructuration ou défaut"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D3.7",
    domainCode: "D3",
    labelFr: "Tendance de l'endettement système et groupe",
    descriptionFr: "Données centrale des risques et vision groupe, dans les limites légales.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 200, GE: 100 },
    anchors: anchors(
      "Endettement stable/en baisse, aucun incident groupe, capacité consolidée confortable",
      "Hausse ≤ 10 % cohérente avec croissance et cash-flow",
      "Hausse de 10–25 %, nouvelle banque/ligne ou concentration accrue mais justifiée",
      "Hausse > 25 %, dette non expliquée, multiplication de demandes ou dégradation d'une entité liée",
      "Cross-default, contagion applicable, dette cachée, incident majeur groupe ou soutien inversé non soutenable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D4 — Activité, secteur, position concurrentielle et concentrations
  // =========================================================================
  {
    code: "D4.1",
    domainCode: "D4",
    labelFr: "Risque sectoriel interne",
    descriptionFr:
      "Grade issu du référentiel sectoriel interne séparé, daté et approuvé (S1=100, S2=75, S3=50, S4=25, S5=0). Jamais saisi librement par l'analyste.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 300, GE: 300 },
    anchors: anchors(
      "S1 — secteur très résilient",
      "S2 — secteur résilient",
      "S3 — secteur moyen/cyclique maîtrisable",
      "S4 — secteur vulnérable/sous surveillance",
      "S5 — secteur très vulnérable/crise structurelle"
    ),
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["Référentiel sectoriel interne daté et version"],
  },
  {
    code: "D4.2",
    domainCode: "D4",
    labelFr: "Position concurrentielle",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 250, GE: 300 },
    anchors: anchors(
      "Leader ou niche dominante ; avantages défendables ; pouvoir de prix ; preuves de parts de marché",
      "Position forte ; différenciation claire ; bonne fidélité ; marges au moins sectorielles",
      "Position moyenne ; offre comparable au marché ; pression concurrentielle normale",
      "Position faible ; perte de parts/clients ; pression prix élevée ; dépendance à un canal",
      "Position marginale/non viable ; produit obsolète ; rupture de licence ; perte du marché essentiel"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D4.3",
    domainCode: "D4",
    labelFr: "Concentration clients",
    descriptionFr:
      "Part du premier client (ou groupe client) dans le chiffre d'affaires, en %, après élimination des ventes liées et circulaires. Le barème est appliqué par le moteur : l'analyste renseigne une mesure, il ne choisit pas un niveau. Une mitigation contractuelle documentée peut relever d'un cran au maximum, via une dérogation tracée.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    formulaFr: "CA_premier_client / CA_total",
    weightsBps: { TPE: 250, PME: 200, GE: 150 },
    binsBySegment: {
      TPE: bins5("LOWER_IS_BETTER", [15, 25, 35, 50]),
      PME: bins5("LOWER_IS_BETTER", [10, 20, 30, 45]),
      GE: bins5("LOWER_IS_BETTER", [10, 15, 25, 40]),
    },
    specialCases: [
      {
        code: "MAIN_CLIENT_LOSS_LIKELY",
        labelFr: "Perte probable du client principal (préavis reçu, appel d'offres perdu)",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["Balance clients", "Élimination des ventes intragroupe"],
  },
  {
    code: "D4.4",
    domainCode: "D4",
    labelFr: "Concentration fournisseurs",
    descriptionFr:
      "Part du premier fournisseur dans les achats, en %. La substituabilité et le délai de remplacement sont appréciés séparément en D4.7 (risque opérationnel) : le présent critère mesure la dépendance, pas sa mitigation.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    formulaFr: "achats_premier_fournisseur / achats_totaux",
    weightsBps: { TPE: 200, PME: 150, GE: 150 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [15, 25, 40, 60]) },
    specialCases: [
      {
        code: "VITAL_SINGLE_SOURCE",
        labelFr: "Mono-source vitale sans alternative qualifiée, ou fournisseur lié en difficulté",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
    evidenceRequiredFr: ["Balance fournisseurs", "Cartographie des alternatives"],
  },
  {
    code: "D4.5",
    domainCode: "D4",
    labelFr: "Visibilité des revenus / carnet de commandes",
    descriptionFr:
      "Commandes : mois de CA sécurisé et qualité juridique du carnet. Récurrent : rétention/churn. Retail : historique comparable et saisonnalité.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 200, GE: 200 },
    anchors: anchors(
      "≥ 12 mois de revenus sécurisés ou > 80 % récurrents avec rétention > 90 % ; contreparties solides",
      "9–12 mois ou 60–80 % récurrents ; annulations historiques faibles",
      "6–9 mois ou 40–60 % récurrents ; visibilité moyenne cohérente au secteur",
      "3–6 mois, carnet non ferme, churn élevé ou dépendance à appels d'offres non acquis",
      "< 3 mois, annulations matérielles, carnet artificiel ou arrêt d'activité prévisible"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D4.6",
    domainCode: "D4",
    labelFr: "Exposition pays, change et matières premières",
    descriptionFr:
      "Exposition nette après couverture juridiquement efficace, rapportée à EBITDA/achats/CA.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 150, GE: 150 },
    anchors: anchors(
      "Exposition nette < 10 % de l'EBITDA ou couverture complète ; pays stables",
      "Exposition 10–25 %, couverture > 75 %, répercussion prix démontrée",
      "Exposition 25–50 %, couverture 50–75 %, volatilité absorbable",
      "Exposition 50–100 %, couverture < 50 %, risque pays/transfert ou commodity matériel",
      "Exposition > 100 % de l'EBITDA, aucune couverture, continuité menacée ou pays bloqué"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D4.7",
    domainCode: "D4",
    labelFr: "Risque opérationnel, technologie et capex",
    type: "QUALITATIVE",
    weightsBps: { TPE: 150, PME: 150, GE: 150 },
    anchors: anchors(
      "Processus robustes, redondance, maintenance et assurance adéquates, capex financé, aucun incident matériel",
      "Contrôles satisfaisants, dépendances connues et plans testés, capex maîtrisé",
      "Contrôles moyens, quelques dépendances/sites uniques, capex nécessaire mais finançable",
      "Outil vieillissant, incidents fréquents, sous-investissement, dépendance critique, assurance insuffisante",
      "Arrêt majeur non résolu, technologie obsolète, perte de licence/certification ou capex vital non financé"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D4.8",
    domainCode: "D4",
    labelFr: "Qualité et soutenabilité de la croissance",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 100, GE: 100 },
    anchors: anchors(
      "Croissance rentable, financée majoritairement par cash-flow/fonds propres, BFR et capacités maîtrisés",
      "Croissance rentable avec dette modérée, plan capacitaire et commercial prouvé",
      "Croissance correcte mais dépendante de dette/BFR ; hypothèses raisonnables, mitigations identifiées",
      "Croissance non rentable, BFR tendu, expansion trop rapide ou investissements sous-estimés",
      "Croissance artificielle/circulaire, acquisitions non intégrées, destruction de cash ou plan irréaliste"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D5 — Management, gouvernance, actionnariat et soutien groupe
  // =========================================================================
  {
    code: "D5.1",
    domainCode: "D5",
    labelFr: "Expérience et stabilité du management",
    type: "QUALITATIVE",
    weightsBps: { TPE: 300, PME: 250, GE: 250 },
    anchors: anchors(
      "Équipe complète, > 10 ans d'expérience pertinente, stabilité > 5 ans, succession en place, réalisations vérifiées",
      "Expérience 5–10 ans, faible turnover, compétences adaptées et résultats cohérents",
      "Expérience 3–5 ans ou changement récent maîtrisé ; quelques lacunes compensées",
      "Équipe incomplète, turnover élevé, expérience limitée, objectifs régulièrement non atteints",
      "Incompétence manifeste, départs critiques, information trompeuse ou incapacité à exploiter"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.2",
    domainCode: "D5",
    labelFr: "Dépendance homme-clé et succession",
    type: "QUALITATIVE",
    weightsBps: { TPE: 250, PME: 150, GE: 150 },
    anchors: anchors(
      "Responsabilités distribuées, délégations formelles, successeurs identifiés et plan testé",
      "Dépendance limitée ; adjoint compétent et documentation suffisante",
      "Dépendance réelle mais remplaçable en 3–6 mois ; plan partiel",
      "Dirigeant concentre clients, technique et pouvoirs ; absence de succession crédible",
      "Indisponibilité de l'homme-clé compromettant immédiatement l'activité, sans solution"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.3",
    domainCode: "D5",
    labelFr: "Gouvernance et contrôle interne",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 200, GE: 300 },
    anchors: anchors(
      "Organes actifs et documentés, séparation des pouvoirs, audit/risques/conformité proportionnés",
      "Gouvernance structurée, contrôles réguliers, incidents corrigés dans les délais",
      "Gouvernance informelle mais fonctionnelle ; contrôles essentiels présents",
      "Pouvoirs concentrés, contrôles faibles, recommandations récurrentes non clôturées",
      "Absence de contrôle, fraude/irrégularité de gouvernance, décisions non autorisées"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.4",
    domainCode: "D5",
    labelFr: "Actionnariat, groupe et soutien",
    descriptionFr:
      "Note standalone conservée. Le support groupe n'améliore le grade que via la méthode dédiée (capacité + volonté + cadre juridique), jamais dans ce critère.",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 150, GE: 250 },
    anchors: anchors(
      "Actionnariat stable et transparent ; parent très solide ; support juridiquement engageant ou historique incontestable",
      "Actionnaires solides et impliqués ; soutien documenté mais non totalement contraignant",
      "Actionnariat stable, capacité de soutien moyenne ou entité autonome sans besoin de support",
      "Conflits, dilution probable, actionnaires endettés ou soutien incertain",
      "Groupe en difficulté, ponctions de cash, litige actionnarial majeur ou opacité"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.5",
    domainCode: "D5",
    labelFr: "Stratégie et qualité d'exécution",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 150, GE: 200 },
    anchors: anchors(
      "Stratégie documentée et cohérente ; réalisations ≥ 90 % des budgets ajustés",
      "Stratégie crédible ; réalisations 75–90 % ; écarts expliqués et corrigés",
      "Plan raisonnable mais partiellement documenté ; réalisations 60–75 %",
      "Plans fréquemment révisés, réalisations < 60 %, hypothèses trop optimistes",
      "Absence de stratégie, budgets manipulés ou décisions menaçant la continuité"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.6",
    domainCode: "D5",
    labelFr: "Transactions avec parties liées",
    type: "QUALITATIVE",
    weightsBps: { TPE: 150, PME: 150, GE: 150 },
    anchors: anchors(
      "Transactions limitées, aux conditions de marché, approuvées, documentées et rapprochées",
      "Transactions significatives mais transparentes, contractuelles et recouvrées normalement",
      "Transactions fréquentes, documentation partielle, impact financier limité",
      "Créances/avances importantes, prix non démontrés, cash-pooling défavorable",
      "Détournement de ressources, créances irrécouvrables, garanties cachées ou transactions non autorisées"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D5.7",
    domainCode: "D5",
    labelFr: "Pilotage financier et culture du risque",
    type: "QUALITATIVE",
    weightsBps: { TPE: 200, PME: 150, GE: 200 },
    anchors: anchors(
      "Reporting mensuel fiable, cash forecast glissant, scénarios, limites et alertes formalisés",
      "Reporting trimestriel fiable, budget/forecast et suivi de trésorerie réguliers",
      "Reporting annuel/intermédiaire suffisant mais peu prospectif ; dépendance à l'expert-comptable",
      "Pilotage tardif, absence de forecast, données contradictoires, réaction après incident",
      "Aucun pilotage fiable, refus de transparence ou dissimulation de difficultés"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D6 — Transparence, qualité de l'information et conformité
  // =========================================================================
  {
    code: "D6.1",
    domainCode: "D6",
    labelFr: "Qualité / certification des états financiers",
    type: "QUALITATIVE",
    weightsBps: { TPE: 150, PME: 125, GE: 150 },
    anchors: anchors(
      "Comptes audités/certifiés sans réserve matérielle ; ou TPE non soumise avec comptes rapprochés à fiabilité élevée",
      "Opinion avec réserve non matérielle ou revue limitée solide ; écarts corrigés",
      "Comptes non audités mais cohérents, documentés et rapprochés ; qualité moyenne",
      "Réserves matérielles, nombreux retraitements ou périmètre incomplet",
      "Comptes non fiables/refusés, soupçon de falsification ou continuité non reflétée"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D6.2",
    domainCode: "D6",
    labelFr: "Délai de production de l'information",
    descriptionFr: "Jours entre la clôture et la réception d'un dossier exploitable.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " j",
    weightsBps: { TPE: 150, PME: 100, GE: 75 },
    binsBySegment: {
      TPE: bins5("LOWER_IS_BETTER", [120, 180, 240, 365]),
      PME: bins5("LOWER_IS_BETTER", [90, 150, 210, 300]),
      GE: bins5("LOWER_IS_BETTER", [75, 120, 180, 270]),
    },
    specialCases: [
      {
        code: "PRODUCTION_REFUSED",
        labelFr: "Refus de produire l'information financière",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D6.3",
    domainCode: "D6",
    labelFr: "Cohérence et rapprochements",
    descriptionFr:
      "Écart inexpliqué (%) entre CA comptable, déclaratif/fiscal, flux bancaires annualisés et informations commerciales.",
    type: "QUANTITATIVE",
    direction: "LOWER_IS_BETTER",
    unit: " %",
    weightsBps: { TPE: 150, PME: 100, GE: 100 },
    binsBySegment: { ALL: bins5("LOWER_IS_BETTER", [2, 5, 10, 20]) },
    specialCases: [
      {
        code: "PROBABLE_MANIPULATION",
        labelFr: "Manipulation probable de l'information — à instruire avec RF03/RF16",
        score: 0,
      },
    ],
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D6.4",
    domainCode: "D6",
    labelFr: "Situation juridique, fiscale et sociale",
    type: "QUALITATIVE",
    weightsBps: { TPE: 150, PME: 100, GE: 75 },
    anchors: anchors(
      "Obligations à jour, aucune dette/litige matériel, certificats et documents valides",
      "Retard mineur régularisé, contrôle courant sans enjeu matériel",
      "Plan d'apurement respecté ou litige provisionné et maîtrisable",
      "Arriérés/litige matériel, plan fragile, saisie ou risque de sanction significatif",
      "Mesure d'exécution majeure, dette non soutenable, procédure menaçant l'activité ou document falsifié"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D6.5",
    domainCode: "D6",
    labelFr: "Transparence actionnariat et documents",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 75, GE: 100 },
    anchors: anchors(
      "Actionnariat, UBO, pouvoirs, groupe et engagements complets, à jour, vérifiés",
      "Lacune mineure sans ambiguïté sur contrôle/pouvoirs, correction rapide",
      "Documents partiels mais contrôle et structure raisonnablement établis",
      "Chaîne de détention complexe/opaque, documents expirés ou hors bilan incomplet",
      "UBO/pouvoirs impossibles à établir, faux document ou blocage KYC"
    ),
    missingPolicy: "WARN",
    critical: false,
  },

  // =========================================================================
  // D7 — Risques ESG et climatiques matériels
  // =========================================================================
  {
    code: "D7.1",
    domainCode: "D7",
    labelFr: "Risque climatique physique",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 100, GE: 150 },
    anchors: anchors(
      "Exposition faible vérifiée ou actifs résilients ; assurances et plans de continuité testés",
      "Exposition modérée, mitigations financées, couverture assurance adéquate",
      "Exposition matérielle mais cartographiée ; plan partiel et pertes absorbables",
      "Exposition élevée (eau/chaleur/inondation/sécheresse), données ou mitigation insuffisantes",
      "Actifs critiques menacés à court terme, sinistres récurrents, absence de solution viable"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D7.2",
    domainCode: "D7",
    labelFr: "Risque de transition",
    type: "QUALITATIVE",
    weightsBps: { TPE: 50, PME: 75, GE: 150 },
    anchors: anchors(
      "Faible intensité/dépendance, réglementation anticipée, offre compatible avec la transition",
      "Exposition modérée, investissements identifiés et finançables, capacité de répercussion",
      "Exposition matérielle, trajectoire et budget partiels, risque absorbable",
      "Forte dépendance énergie/carbone/réglementation, capex important non totalement financé",
      "Modèle économique menacé, interdiction/obsolescence probable, aucun plan crédible"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D7.3",
    domainCode: "D7",
    labelFr: "Conformité environnementale et sociale",
    type: "QUALITATIVE",
    weightsBps: { TPE: 100, PME: 75, GE: 100 },
    anchors: anchors(
      "Autorisations à jour, absence d'incident matériel, système de gestion et indicateurs suivis",
      "Écart mineur corrigé, contrôles adaptés et historique satisfaisant",
      "Écarts modérés avec plan daté/financé ; aucun arrêt probable",
      "Non-conformité matérielle, accident/litige, plan incomplet ou passif potentiel important",
      "Autorisation retirée, fermeture/sanction grave, dommage majeur ou violation bloquante"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
  {
    code: "D7.4",
    domainCode: "D7",
    labelFr: "Gouvernance ESG et plan d'adaptation",
    type: "QUALITATIVE",
    weightsBps: { TPE: 50, PME: 50, GE: 100 },
    anchors: anchors(
      "Responsabilités conseil/direction, données fiables, objectifs, budget, scénarios et suivi",
      "Gouvernance formalisée et plan financé sur les risques matériels",
      "Responsables identifiés, diagnostic initial et actions partielles",
      "Approche réactive, données faibles, plan non chiffré ou sans propriétaire",
      "Déni d'un risque matériel, aucune gouvernance, information trompeuse ou greenwashing démontré"
    ),
    missingPolicy: "WARN",
    critical: false,
  },
];

export const CORP_STD_V1: ModelConfig = {
  modelId: "CORP_STD_V1",
  version: "1.0.0",
  labelFr:
    "Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)",
  status: "DRAFT_EXPERT_SEED",
  effectiveFrom: "2026-08-18",
  conventionFr: "Score 100 = risque le plus faible ; score 0 = risque le plus élevé.",
  segments: ["TPE", "PME", "GE"],
  domains: [
    { code: "D1", labelFr: "Performance financière et structure bilancielle" },
    { code: "D2", labelFr: "Capacité de remboursement et stress" },
    { code: "D3", labelFr: "Comportement bancaire et historique de crédit" },
    { code: "D4", labelFr: "Activité, secteur et positionnement" },
    { code: "D5", labelFr: "Management, gouvernance et groupe" },
    { code: "D6", labelFr: "Transparence et conformité" },
    { code: "D7", labelFr: "ESG et climat" },
  ],
  criteria,
  masterScale: [
    { grade: "G1", minScore: 90, maxScore: null, labelFr: "Excellent", indicativeDecisionFr: "Délégation favorable sous contrôles usuels" },
    { grade: "G2", minScore: 85, maxScore: 90, labelFr: "Très solide", indicativeDecisionFr: "Favorable" },
    { grade: "G3", minScore: 80, maxScore: 85, labelFr: "Solide", indicativeDecisionFr: "Favorable" },
    { grade: "G4", minScore: 75, maxScore: 80, labelFr: "Bon", indicativeDecisionFr: "Favorable avec conditions usuelles" },
    { grade: "G5", minScore: 70, maxScore: 75, labelFr: "Satisfaisant", indicativeDecisionFr: "Analyse normale / conditions selon produit" },
    { grade: "G6", minScore: 65, maxScore: 70, labelFr: "Acceptable", indicativeDecisionFr: "Conditions renforcées et suivi" },
    { grade: "G7", minScore: 60, maxScore: 65, labelFr: "Fragile", indicativeDecisionFr: "Comité / revue renforcée, watchlist possible" },
    { grade: "G8", minScore: 55, maxScore: 60, labelFr: "Faible", indicativeDecisionFr: "Exception très encadrée ou réduction du risque" },
    { grade: "G9", minScore: 45, maxScore: 55, labelFr: "Très faible", indicativeDecisionFr: "Généralement défavorable, stratégie de réduction" },
    { grade: "G10", minScore: null, maxScore: 45, labelFr: "Risque très élevé", indicativeDecisionFr: "Défavorable sauf décision exceptionnelle formelle" },
  ],
  structuralCaps: [
    { code: "CAP01", labelFr: "Entreprise de moins de 2 ans, hors support groupe juridiquement robuste", maxGrade: "G7", source: "CREDIT_POLICY", trigger: "YOUNG_COMPANY_NO_SUPPORT" },
    { code: "CAP02", labelFr: "Fonds propres tangibles négatifs sans recapitalisation ferme et réalisée", maxGrade: "G9", source: "CREDIT_POLICY", trigger: "NEGATIVE_TANGIBLE_EQUITY" },
    { code: "CAP03", labelFr: "Incertitude matérielle sur la continuité d'exploitation", maxGrade: "G9", source: "CREDIT_POLICY", trigger: "GOING_CONCERN_UNCERTAINTY" },
    { code: "CAP04", labelFr: "Comptes annuels trop anciens (au-delà du maximum segment)", maxGrade: "NO_GRADE", source: "CREDIT_POLICY", trigger: "ACCOUNTS_TOO_OLD" },
    { code: "CAP05", labelFr: "EBITDA négatif deux années sur trois", maxGrade: "G9", source: "CREDIT_POLICY", trigger: "EBITDA_NEGATIVE_2_OF_3" },
    { code: "CAP06", labelFr: "DSCR < 1,0× en scénario de base", maxGrade: "G9", source: "CREDIT_POLICY", trigger: "BASE_DSCR_BELOW_1" },
    { code: "CAP07", labelFr: "DSCR < 1,0× uniquement en stress", maxGrade: "G7", source: "CREDIT_POLICY", trigger: "STRESS_DSCR_BELOW_1" },
    { code: "CAP08", labelFr: "Dépendance client unique sans contrat ferme ni mitigation", maxGrade: "G8", source: "CREDIT_POLICY", trigger: "SINGLE_CLIENT_DEPENDENCY" },
    { code: "CAP09", labelFr: "Restructuration active / forbearance", maxGrade: "G8", source: "CREDIT_POLICY", trigger: "ACTIVE_RESTRUCTURING" },
    { code: "CAP10", labelFr: "Dossier groupe incomplet alors que le groupe est matériel", maxGrade: "G7", source: "CREDIT_POLICY", trigger: "GROUP_FILE_INCOMPLETE" },
  ],
  redFlags: [
    { code: "RF01", labelFr: "Identité/UBO/pouvoirs impossibles à valider", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Stop KYC, pas de score final" },
    { code: "RF02", labelFr: "Sanction ou interdiction issue du système conformité autoritatif", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Suivre la décision Conformité, jamais diluer dans le score" },
    { code: "RF03", labelFr: "Fraude ou falsification documentaire confirmée", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Escalade fraude/juridique et audit" },
    { code: "RF04", labelFr: "Activité interdite par politique ou loi", level: "BLOCK", source: "CREDIT_POLICY", treatmentFr: "Rejet/routage selon politique" },
    { code: "RF05", labelFr: "Liquidation, cessation ou procédure incompatible avec le going concern", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Classe/grade défaut selon règles applicables" },
    { code: "RF06", labelFr: "DPD ≥ seuil de défaut, UTP ou cross-default", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Évaluer défaut, contagion, IFRS 9 et BAM séparément" },
    { code: "RF07", labelFr: "DPD 31–89 jours ou incident matériel récurrent", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Revue risque, watchlist/SICR éventuels" },
    { code: "RF08", labelFr: "Échec de restructuration ou seconde concession", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Défaut/forbearance selon politique" },
    { code: "RF09", labelFr: "Fonds propres négatifs et aucun plan ferme", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Cap G9, recapitalisation comme condition éventuelle" },
    { code: "RF10", labelFr: "Opinion audit défavorable / refus de certifier", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Selon matérialité et fiabilité des comptes (peut devenir BLOCK)" },
    { code: "RF11", labelFr: "Dette fiscale/sociale ou saisie matérielle", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Quantifier, vérifier plan et priorité de paiement" },
    { code: "RF12", labelFr: "Litige menaçant la continuité", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Scénario de perte et avis juridique" },
    { code: "RF13", labelFr: "Perte d'un client/fournisseur/licence vital", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Reforecast et stress immédiats" },
    { code: "RF14", labelFr: "Covenant rompu non régularisé", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Vérifier exigibilité et waiver" },
    { code: "RF15", labelFr: "Transactions liées ou sortie de cash inexpliquée", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Investigation et cap selon impact" },
    { code: "RF16", labelFr: "Information critique manquante/incohérente", level: "REFER", source: "MODEL", treatmentFr: "Appliquer la politique de complétude (peut devenir BLOCK)" },
    { code: "RF17", labelFr: "Risque climatique/ESG avec fermeture probable", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Scénario, cap et plan d'adaptation" },
    { code: "RF18", labelFr: "Contagion groupe réglementaire/politique", level: "DEFAULT_CHECK", source: "REGULATORY", treatmentFr: "Appliquer uniquement la règle validée du régime applicable" },
  ],
  confidenceWeights: { completeness: 35, freshness: 20, reliability: 30, provenance: 15 },
  confidenceCaps: [
    { minConfidence: 0, maxConfidence: 55, levelFr: "Insuffisant", maxGrade: "NO_GRADE" },
    { minConfidence: 55, maxConfidence: 70, levelFr: "Faible", maxGrade: "G7" },
    { minConfidence: 70, maxConfidence: 85, levelFr: "Moyen", maxGrade: "G4" },
    { minConfidence: 85, maxConfidence: null, levelFr: "Élevé", maxGrade: "NONE" },
  ],
  segmentation: {
    geTurnoverThreshold: 175_000_000,
    smeTurnoverThreshold: 10_000_000,
    smeExposureThreshold: 2_000_000,
    currency: "MAD",
    sourceFr:
      "Seed inspiré de la segmentation prudentielle des entreprises (BAM) — seuils, définitions de CA/exposition et traitement du groupe À CONFIRMER dans le corpus BAM applicable avant production.",
    status: "SEED_TO_CONFIRM",
  },
  pdStatus: "UNCALIBRATED",
  disclaimerFr:
    "Modèle expert seed non calibré. Aucune PD n'est produite tant que la calibration empirique n'est pas réalisée et validée indépendamment (pd_status = UNCALIBRATED). Les seuils ne sont ni des règles BAM ni des paramètres IFRS 9.",
};
