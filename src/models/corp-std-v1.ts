import type { CalibrationConfig } from "@/core/calibration";
import type { CriterionConfig, ModelConfig } from "@/core/types";
import { anchors, bins5 } from "./helpers";
import { DEFAULT_GRADES } from "@/reference/default-policy";
import calibrationJson from "./calibrations/CORP_STD_V1-SYNTH-20260823.json";

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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
    evidenceRequiredFr: ["États financiers N, N−1, N−2", "Comparaison sectorielle datée"],
  },
  {
    code: "D1.2",
    domainCode: "D1",
    cgncEntry: "EBE_EBITDA",
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
  },
  {
    code: "D1.4",
    domainCode: "D1",
    cgncEntry: "FONDS_PROPRES_TANGIBLES",
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
        labelFr:
          "Fonds propres tangibles négatifs (contribution centrale du phénomène ; RF09 route la revue, aucun plafond ne s'y ajoute)",
        score: 0,
      },
    ],
    unavailablePolicy: "BLOCK",
    evidenceRequiredFr: ["Bilan et retraitements des incorporels/non-valeurs"],
  },
  {
    code: "D1.5",
    domainCode: "D1",
    cgncEntry: "DETTE_FINANCIERE_ECONOMIQUE",
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
    unavailablePolicy: "BLOCK",
    evidenceRequiredFr: ["États financiers", "Trace des retraitements dette/trésorerie"],
  },
  {
    code: "D1.6",
    domainCode: "D1",
    cgncEntry: "CREANCES_PUBLIQUES_TVA",
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
  },
  {
    code: "D2.2",
    domainCode: "D2",
    cgncEntry: "SERVICE_DETTE",
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "BLOCK",
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
  },
  {
    code: "D3.4",
    domainCode: "D3",
    cgncEntry: "FLUX_BANCAIRES_NETTOYES",
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    // Porte de matérialité (constat H09) : un risque physique n'est évalué que
    // s'il existe. Sans cette porte, un cabinet de conseil casablancais et une
    // conserverie du Souss recevaient le même score générique — fausse
    // précision que le diagnostic relevait explicitement.
    materialityGate: {
      flag: "esgPhysicalMaterial",
      rationaleFr:
        "Matérialité établie par le référentiel sectoriel et la localisation des sites, jamais au jugement libre de l'analyste.",
    },
    notApplicableRule: {
      allowedCasesFr:
        "Aucune exposition physique matérielle : activité hors secteurs dépendants de l'eau, de l'agriculture, du littoral ou d'installations exposées aux aléas.",
      transferWeightTo: "D7.3",
    },
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    materialityGate: {
      flag: "esgTransitionMaterial",
      rationaleFr:
        "Matérialité établie par l'intensité énergétique du secteur et l'exposition à des marchés d'exportation sous contrainte carbone.",
    },
    notApplicableRule: {
      allowedCasesFr:
        "Activité sans intensité énergétique ni exposition à une réglementation carbone, directe ou via ses donneurs d'ordre.",
      transferWeightTo: "D7.4",
    },
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
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
    unavailablePolicy: "CONSERVATIVE_SCORE",
    unavailableScore: 25,
  },
];

/**
 * Calibration attachée : DONNÉES SIMULÉES.
 *
 * L'artefact JSON est la pièce de référence — il porte son empreinte de contenu
 * et se régénère par `npx tsx scripts/calibration/run.mts`. Il est importé tel
 * quel plutôt que recopié, pour qu'aucune divergence ne puisse s'installer entre
 * la calibration auditée et celle que le moteur applique.
 */
const SYNTHETIC_CALIBRATION = calibrationJson as CalibrationConfig;

export const CORP_STD_V1: ModelConfig = {
  modelId: "CORP_STD_V1",
  version: "3.0.0",
  labelFr:
    "Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)",
  status: "DRAFT_EXPERT_SEED",
  effectiveFrom: "2026-09-17",
  conventionFr: "Score 100 = risque le plus faible ; score 0 = risque le plus élevé.",
  segments: ["TPE", "PME", "GE"],

  // Philosophie de notation (constat H01) — sans elle, calibration, backtesting
  // et IFRS 9 travaillent sur des horizons implicitement différents.
  philosophy: {
    type: "HYBRID",
    horizonMonths: 12,
    observationWindowsMonths: {
      financialStatements: 36,
      behavioral: 24,
      behavioralTarget: 36,
      sector: 60,
    },
    cycleTreatmentFr:
      "Hybride assumé : la forte pondération du comportement récent et des flux rend la note sensible au point du cycle, tandis que les grilles financières lissent sur trois exercices. Aucune correction de cycle n'est appliquée tant que l'historique ne permet pas de l'estimer ; la sensibilité au cycle est une limitation documentée, pas une propriété revendiquée.",
    migrationRuleFr:
      "Une notation reste valide jusqu'à son terme sauf événement significatif : impayé, restructuration, perte d'un client vital, changement de contrôle, arrivée d'états financiers plus récents. La migration n'est jamais lissée : le grade suit l'information disponible à la date d'arrêté.",
    refreshRuleFr:
      "Revue annuelle au minimum, trimestrielle sur les dossiers en surveillance, immédiate sur événement significatif.",
    postCutoffEventsFr:
      "Un événement postérieur à la date d'arrêté ne modifie jamais rétroactivement une notation produite : il déclenche une nouvelle notation, à une nouvelle date d'arrêté. C'est la condition du rejeu historique.",
  },

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

  /**
   * Échelle PROPRE au modèle standard (constat C03).
   *
   * Les libellés G1–G10 partagés avec le modèle comportemental ont été
   * supprimés : deux grilles qui n'observent pas la même chose ne peuvent pas
   * afficher le même grade tant qu'aucune correspondance n'a été établie sur
   * des probabilités de défaut comparables. `comparableWith` reste donc vide.
   *
   * Huit grades au lieu de dix (constat H03) : la calibration synthétique
   * montrait des grades voisins que les données ne distinguaient pas. La
   * granularité définitive est un RÉSULTAT de calibration sur défauts observés,
   * pas un choix de présentation — d'où le statut PROVISIONAL.
   */
  gradeScale: {
    scaleId: "STD-P-2026.1",
    labelFr: "Échelle provisoire du modèle standard",
    comparableWith: [],
    status: "PROVISIONAL",
    bands: [
      { grade: "STD-P1", minScore: 88, maxScore: null, labelFr: "Très solide" },
      { grade: "STD-P2", minScore: 82, maxScore: 88, labelFr: "Solide" },
      { grade: "STD-P3", minScore: 76, maxScore: 82, labelFr: "Bon" },
      { grade: "STD-P4", minScore: 70, maxScore: 76, labelFr: "Satisfaisant" },
      { grade: "STD-P5", minScore: 64, maxScore: 70, labelFr: "Acceptable" },
      { grade: "STD-P6", minScore: 57, maxScore: 64, labelFr: "Fragile" },
      { grade: "STD-P7", minScore: 48, maxScore: 57, labelFr: "Faible" },
      { grade: "STD-P8", minScore: null, maxScore: 48, labelFr: "Très faible" },
    ],
    defaultGrades: DEFAULT_GRADES,
  },

  /**
   * Exceptions non compensatoires (constat C08).
   *
   * Dix plafonds en V2, quatre ici. Chacun déclare le critère qui porte la
   * contribution centrale du phénomène et la raison pour laquelle un effet non
   * linéaire s'y ajoute ; l'inventaire phénomène-règle (core/double-counting)
   * refuse le chargement d'une exception qui ne le ferait pas.
   */
  nonCompensatoryRules: [
    {
      code: "NC01",
      labelFr: "Couverture du service de la dette inférieure à 1 en scénario de base",
      maxGrade: "STD-P7",
      source: "CREDIT_POLICY",
      trigger: "BASE_DSCR_BELOW_1",
      centralCriterion: "D2.2",
      incrementalRationaleFr:
        "Une incapacité à couvrir le service de la dette en scénario de base n'est compensable ni par la gouvernance ni par un secteur porteur : le défaut survient par manque de trésorerie à l'échéance, quelles que soient les autres qualités du dossier. L'effet incrémental par rapport au score de D2.2 reste à mesurer sur défauts observés.",
    },
    {
      code: "NC02",
      labelFr: "Incertitude matérielle sur la continuité d'exploitation",
      maxGrade: "STD-P7",
      source: "CREDIT_POLICY",
      trigger: "GOING_CONCERN_UNCERTAINTY",
      centralCriterion: "D6.1",
      incrementalRationaleFr:
        "Une réserve d'auditeur sur la continuité d'exploitation porte une information que les ratios ne contiennent pas encore : elle synthétise un jugement professionnel sur des éléments prospectifs. Son pouvoir prédictif non linéaire est largement documenté ; l'effet incrémental reste à mesurer localement.",
    },
    {
      code: "NC03",
      labelFr: "Excédent brut d'exploitation négatif deux années sur trois",
      maxGrade: "STD-P7",
      source: "CREDIT_POLICY",
      trigger: "EBITDA_NEGATIVE_2_OF_3",
      centralCriterion: "D1.2",
      incrementalRationaleFr:
        "La persistance distingue un accident d'exercice d'un modèle économique qui ne dégage pas d'excédent. Le critère D1.2 note le niveau du dernier exercice ; il ne capture pas la répétition, qui est précisément ce qui rend le redressement improbable sans apport externe.",
    },
    {
      code: "NC04",
      labelFr: "Dossier groupe incomplet alors que le groupe est matériel",
      maxGrade: "STD-P6",
      source: "CREDIT_POLICY",
      trigger: "GROUP_FILE_INCOMPLETE",
      centralCriterion: "D5.4",
      incrementalRationaleFr:
        "Contrairement aux autres insuffisances d'information, celle-ci porte sur un périmètre de consolidation entier et non sur une variable isolée : la porte de couverture, qui raisonne critère par critère, ne la détecte pas. Sans vision groupe, ni la contagion ni les sorties de trésorerie ne sont appréciables.",
    },
  ],

  redFlags: [
    { code: "RF01", labelFr: "Identité/UBO/pouvoirs impossibles à valider", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Statut conformité BLOQUÉ : pas d'entrée en relation. La notation d'une exposition existante reste produite pour la surveillance." },
    { code: "RF02", labelFr: "Sanction ou interdiction issue du système conformité autoritatif", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Décision Conformité appliquée telle quelle, jamais diluée dans le score" },
    { code: "RF03", labelFr: "Fraude ou falsification documentaire confirmée", level: "BLOCK", source: "COMPLIANCE", treatmentFr: "Escalade fraude/juridique et audit ; fiabilité des données à réexaminer intégralement" },
    { code: "RF04", labelFr: "Activité interdite par politique ou loi", level: "BLOCK", source: "CREDIT_POLICY", treatmentFr: "Rejet/routage selon politique de crédit" },
    { code: "RF05", labelFr: "Liquidation, cessation ou procédure incompatible avec le going concern", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Évaluation défaut DEF3 par le moteur dédié" },
    { code: "RF06", labelFr: "DPD ≥ seuil de défaut, UTP ou cross-default", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Évaluer défaut, contagion, IFRS 9 et classification BAM séparément" },
    { code: "RF07", labelFr: "DPD 31–89 jours ou incident matériel récurrent", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Revue risque, watchlist et augmentation significative du risque éventuelles" },
    { code: "RF08", labelFr: "Échec de restructuration ou seconde concession", level: "DEFAULT_CHECK", source: "CREDIT_POLICY", treatmentFr: "Défaut DEF2 / forbearance selon la politique validée" },
    { code: "RF09", labelFr: "Fonds propres négatifs et aucun plan ferme", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Revue ; la contribution au risque est portée par D1.4, sans plafond additionnel" },
    { code: "RF10", labelFr: "Opinion audit défavorable / refus de certifier", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Selon matérialité et fiabilité des comptes" },
    { code: "RF11", labelFr: "Dette fiscale/sociale ou saisie matérielle", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Quantifier, vérifier plan d'apurement et rang de paiement" },
    { code: "RF12", labelFr: "Litige menaçant la continuité", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Scénario de perte et avis juridique" },
    { code: "RF13", labelFr: "Perte d'un client/fournisseur/licence vital", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Reprévision et stress immédiats" },
    { code: "RF14", labelFr: "Covenant rompu non régularisé", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Vérifier exigibilité anticipée et waiver" },
    { code: "RF15", labelFr: "Transactions liées ou sortie de cash inexpliquée", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Investigation des flux avec parties liées" },
    { code: "RF16", labelFr: "Information critique manquante/incohérente", level: "REFER", source: "MODEL", treatmentFr: "Traité par la porte de couverture : sous le seuil, aucun grade n'est produit" },
    { code: "RF17", labelFr: "Risque climatique/ESG avec fermeture probable", level: "REFER", source: "CREDIT_POLICY", treatmentFr: "Scénario sectoriel et plan d'adaptation" },
    { code: "RF18", labelFr: "Contagion groupe réglementaire/politique", level: "DEFAULT_CHECK", source: "REGULATORY", treatmentFr: "Appliquer uniquement la règle validée du régime applicable" },
  ],

  /**
   * Confiance (constat H02) : une CLASSE restituée à côté du grade, jamais un
   * plafond. Sous la classe minimale, aucun grade — un dossier trop peu
   * documenté n'est pas un dossier moyen.
   */
  confidence: {
    weights: { completeness: 35, freshness: 20, reliability: 30, provenance: 15 },
    classes: [
      { code: "A", minScore: 85, maxScore: null, labelFr: "Élevée — estimation robuste" },
      { code: "B", minScore: 70, maxScore: 85, labelFr: "Moyenne — estimation utilisable avec réserve" },
      { code: "C", minScore: 55, maxScore: 70, labelFr: "Faible — estimation fragile, à compléter" },
      { code: "U", minScore: 0, maxScore: 55, labelFr: "Insuffisante — aucun grade produit" },
    ],
    minimumClassForRating: "C",
  },

  /**
   * Couverture (constat C07) : part du poids portée par une donnée réellement
   * OBSERVÉE. Une estimation n'y compte pas. Seuils seed, à recalibrer sur le
   * portefeuille réel.
   */
  coverage: {
    minGlobalObservedBps: 6000,
    minDomainObservedBps: 3000,
  },

  groupSupport: {
    maxNotches: 2,
    requiresAllConditions: true,
    methodFr:
      "Note autonome calculée et conservée. Relèvement accordé seulement si les quatre conditions sont documentées : capacité financière du garant, volonté démontrée, engagement juridiquement contraignant, transférabilité effective des fonds. Plafonné à deux crans. Une garantie qui ne remplit pas ces conditions appartient au moteur de décision et à la perte en cas de défaut, pas à la note.",
  },

  segmentationRulesetId: "SEG-2026.1",
  pdStatus: "UNCALIBRATED",
  calibration: SYNTHETIC_CALIBRATION,
  disclaimerFr:
    "Modèle expert seed, non calibré sur défauts observés et non validé indépendamment. La calibration attachée est établie sur données SIMULÉES : elle valide la chaîne de traitement et l'ordonnancement de l'échelle, jamais le niveau des probabilités. Aucune probabilité de défaut n'est exposée hors environnement bac à sable. Usage autorisé : pilote en mode fantôme et aide au jugement. Usages interdits : décision automatisée, tarification, staging ou pertes attendues IFRS 9, classification Bank Al-Maghrib, exigence en fonds propres.",
};
