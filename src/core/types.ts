import type { CalibrationConfig } from "./calibration";
/**
 * Types du domaine — moteur de notation interne entreprises (TPE/PME/GE).
 *
 * Ce module est PUR : aucune dépendance framework, base de données ou réseau.
 * Toutes les décisions du moteur sont déterministes et reproductibles :
 * même snapshot + même version de modèle => même résultat.
 *
 * VERSION 3 — refonte issue du diagnostic indépendant du 16 septembre 2026.
 * Les cinq changements structurants portés par ces types :
 *  - les finalités ne sont plus mélangées : cinq statuts distincts (C06) ;
 *  - la qualité de l'information ne plafonne plus le grade (H02) ;
 *  - une donnée absente n'est plus retirée du dénominateur (C07) ;
 *  - chaque modèle porte sa propre échelle de grades (C03) ;
 *  - la PD non calibrée ne sort pas de l'environnement bac à sable (C02).
 */

/** Segments de contreparties supportés (référentiel effectif-daté, cf. reference/segmentation). */
export type Segment = "TPE" | "PME" | "GE";

/** Convention : 100 = meilleur risque, 0 = pire risque. */
export type CriterionScore = 0 | 25 | 50 | 75 | 100;

/** Statut d'une donnée d'entrée. La valeur zéro est une valeur économique, jamais un code manquant. */
export type DataStatus =
  | "AVAILABLE"
  | "MISSING"
  | "NOT_APPLICABLE"
  | "INVALID"
  | "STALE"
  | "ESTIMATED";

/**
 * Traitement d'une donnée indisponible (MISSING / INVALID / STALE).
 *
 * V3 — le retrait du dénominateur a disparu. Le diagnostic (C07) montrait qu'il
 * rendait deux dossiers incomparables et pouvait *améliorer* un score par
 * l'absence d'une information défavorable. Désormais un critère sans donnée
 * porte soit un blocage, soit une catégorie « missing » au score prudent
 * déclaré : le poids total reste stable dans tous les cas.
 */
export type UnavailablePolicy = "BLOCK" | "CONSERVATIVE_SCORE";

/** Sens économique d'un ratio quantitatif. */
export type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

/** Sévérité d'un red flag. */
export type RedFlagLevel = "BLOCK" | "DEFAULT_CHECK" | "REFER" | "WARNING" | "INFO";

/** Source d'une règle : un red flag interne ne doit jamais être présenté comme une exigence BAM. */
export type RuleSource = "REGULATORY" | "IFRS9" | "CREDIT_POLICY" | "COMPLIANCE" | "MODEL";

/**
 * Statut de calibration de la PD. Tant que UNCALIBRATED, aucune PD n'est exposée.
 *
 * CALIBRATED_SYNTHETIC est délibérément distinct de CALIBRATED : une PD issue de
 * données simulées valide la chaîne de traitement, jamais le niveau du risque.
 */
export type PdStatus =
  | "UNCALIBRATED"
  | "CALIBRATED"
  | "CALIBRATED_SYNTHETIC"
  | "TECHNICAL_ONLY_DISABLED";

// ---------------------------------------------------------------------------
// Statuts séparés par finalité (C06)
// ---------------------------------------------------------------------------

/**
 * Statut du seul moteur implémenté ici : la notation du risque intrinsèque.
 *
 * Il ne dit rien de la décision de crédit, de la classe réglementaire ni du
 * stage IFRS 9 — ces trois-là portent leur propre statut, toujours
 * NOT_EVALUATED tant que leur moteur n'existe pas.
 */
export type RatingStatus =
  | "RATED"
  | "DEFAULTED"
  | "NO_RATING_INSUFFICIENT_DATA"
  | "NO_RATING_SEGMENT_UNDETERMINED"
  | "NO_RATING_ROUTED_OTHER_MODEL";

/**
 * Statut conformité, produit par les systèmes amont (KYC, sanctions).
 *
 * BLOCKED interdit l'entrée en relation ou l'opération ; il n'empêche plus de
 * mesurer le risque d'une exposition déjà au bilan (C06) : on ne peut pas
 * provisionner ni surveiller ce qu'on refuse de noter.
 */
export type ComplianceStatus = "NOT_EVALUATED" | "CLEAR" | "REFER" | "BLOCKED";

/** Moteurs non implémentés : le statut l'affirme explicitement plutôt que de rester vide. */
export type PendingEngineStatus = "NOT_EVALUATED";

// ---------------------------------------------------------------------------
// Droits d'usage attachés à un résultat (C02, M01)
// ---------------------------------------------------------------------------

/**
 * Finalité autorisée du résultat. Portée par la sortie elle-même : un système
 * aval n'a pas à deviner ce qu'il a le droit de faire d'un grade.
 */
export type ResultPurpose = "SIMULATION_ONLY" | "PILOT_SHADOW" | "PRODUCTION_RATING";

export interface UsageRights {
  purpose: ResultPurpose;
  calibrationStatus: PdStatus;
  /** true seulement si une PD numérique accompagne le résultat. */
  pdDisclosed: boolean;
  permittedUsesFr: string[];
  restrictionsFr: string[];
}

// ---------------------------------------------------------------------------
// Configuration de modèle (version immuable, publiée)
// ---------------------------------------------------------------------------

/** Une bande de barème quantitatif. Bornes null = infini. */
export interface Bin {
  min: number | null;
  max: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  score: CriterionScore;
  label?: string;
}

/** Niveau d'ancrage d'un critère qualitatif. */
export interface QualitativeAnchor {
  score: CriterionScore;
  labelFr: string;
}

/**
 * Cas spécial d'un critère : situation économique où le barème ordinaire ne
 * s'applique pas et où la grille impose un score.
 */
export interface SpecialCaseConfig {
  code: string;
  labelFr: string;
  score: CriterionScore;
}

/**
 * Règle de non-applicabilité (C07).
 *
 * Un critère n'est « non applicable » que si le modèle l'a prévu ET déclare où
 * son poids va. La redistribution proportionnelle silencieuse a disparu : le
 * poids est transféré à un critère nommé du même domaine, ce qui laisse le
 * poids total du modèle strictement constant et la règle auditable.
 */
export interface NotApplicableRule {
  /** Situations où la non-applicabilité est admise, en clair, pour l'analyste et l'auditeur. */
  allowedCasesFr: string;
  /** Critère du même domaine qui reçoit le poids. Configuration alternative fixe. */
  transferWeightTo: string;
}

/**
 * Condition de matérialité (H09).
 *
 * Un critère ainsi conditionné n'est évalué que si l'exposition au risque est
 * matérielle. Sinon il devient non applicable selon sa règle déclarée — plutôt
 * que de produire un score générique qui traite de la même façon un hôtel du
 * Souss et une société de conseil casablancaise.
 */
export interface MaterialityGate {
  flag: keyof MaterialityFlags;
  rationaleFr: string;
}

export interface CriterionConfig {
  code: string; // ex. "D1.5"
  domainCode: string; // ex. "D1"
  labelFr: string;
  descriptionFr?: string;
  type: "QUANTITATIVE" | "QUALITATIVE";
  direction?: Direction;
  unit?: string; // ex. "x", "%", "jours"
  /** Poids en points de base du score global (300 = 3,00 %), par segment. */
  weightsBps: Partial<Record<Segment, number>>;
  /** Barèmes par segment (quantitatif). "ALL" = barème commun. */
  binsBySegment?: Partial<Record<Segment | "ALL", Bin[]>>;
  /** Ancrages (qualitatif). */
  anchors?: QualitativeAnchor[];
  /** Cas spéciaux admis pour ce critère. Un code non déclaré rend la donnée invalide. */
  specialCases?: SpecialCaseConfig[];
  /** Traitement d'une donnée indisponible. */
  unavailablePolicy: UnavailablePolicy;
  /**
   * Score imposé quand la donnée est indisponible et que la politique n'est pas
   * BLOCK. Valeur prudente déclarée par la grille, à recalibrer sur données
   * observées comme une catégorie « missing » à part entière.
   */
  unavailableScore?: CriterionScore;
  /** Règle de non-applicabilité. Absente = NOT_APPLICABLE refusé pour ce critère. */
  notApplicableRule?: NotApplicableRule;
  /** Condition de matérialité (ESG, covenants…). */
  materialityGate?: MaterialityGate;
  /** Référence au dictionnaire CGNC (reference/cgnc) pour les retraitements. */
  cgncEntry?: string;
  evidenceRequiredFr?: string[];
  formulaFr?: string;
}

export interface DomainConfig {
  code: string; // "D1".."D7" ou "B1".."B7"
  labelFr: string;
  descriptionFr?: string;
}

/**
 * Bande de grade.
 *
 * V3 — `indicativeDecisionFr` a disparu (C06) : une échelle de risque ne porte
 * pas de décision de crédit. La décision appartient au moteur crédit, qui tient
 * compte de l'exposition, du produit, des garanties et de l'appétence.
 */
export interface GradeBand {
  grade: string; // ex. "STD-P3", "TPE-B2"
  minScore: number | null; // inclus
  maxScore: number | null; // exclu (null = +inf)
  labelFr: string;
}

/**
 * Grade de défaut (H03).
 *
 * Les grades de défaut restent COMMUNS aux modèles, contrairement aux grades
 * performants : un défaut est un état constaté selon une définition unique, pas
 * une estimation produite par une grille. Deux modèles peuvent diverger sur
 * l'estimation du risque ; ils ne peuvent pas diverger sur le constat d'un
 * impayé de plus de 90 jours.
 */
export interface DefaultGradeConfig {
  grade: "DEF1" | "DEF2" | "DEF3";
  labelFr: string;
  entryCriteriaFr: string[];
  cureRuleFr: string;
}

/**
 * Échelle de grades propre à une version de modèle (C03).
 *
 * `comparableWith` est vide tant qu'aucune étude de correspondance n'a été
 * validée : c'est ce qui empêche techniquement d'afficher le même libellé de
 * grade pour deux modèles qui n'observent pas la même chose.
 */
export interface GradeScaleConfig {
  scaleId: string; // ex. "STD-P-2026.1"
  labelFr: string;
  /** Identifiants d'échelles avec lesquelles une correspondance a été validée. */
  comparableWith: string[];
  /** Statut : provisoire tant que la granularité n'est pas dérivée de défauts observés. */
  status: "PROVISIONAL" | "CALIBRATED";
  bands: GradeBand[];
  defaultGrades: DefaultGradeConfig[];
}

/**
 * Exception non compensatoire (ex-cap structurel).
 *
 * V3 — le diagnostic (C08) a montré qu'un même phénomène pouvait être compté
 * jusqu'à quatre fois. Chaque exception conservée doit désormais déclarer le
 * critère qui porte sa contribution centrale et la raison pour laquelle un
 * effet non linéaire supplémentaire est justifié.
 */
export interface NonCompensatoryRuleConfig {
  code: string;
  labelFr: string;
  /** Grade plafond. "NO_GRADE" = aucun grade final. */
  maxGrade: string | "NO_GRADE";
  source: RuleSource;
  /** Identifiant du trigger évalué par le moteur à partir des inputs. */
  trigger: string;
  /** Critère portant la contribution centrale du même phénomène. */
  centralCriterion: string | null;
  /** Pourquoi un effet non linéaire s'ajoute à cette contribution centrale. */
  incrementalRationaleFr: string;
}

export interface RedFlagConfig {
  code: string;
  labelFr: string;
  level: RedFlagLevel;
  source: RuleSource;
  treatmentFr: string;
}

/** Pondérations du score de confiance (somme = 100). */
export interface ConfidenceWeights {
  completeness: number;
  freshness: number;
  reliability: number;
  provenance: number;
}

/**
 * Classe de confiance (H02).
 *
 * V3 — la confiance ne plafonne plus le grade. Elle décrit la robustesse de
 * l'estimation, pas le niveau de risque économique : les deux sont restitués
 * côte à côte. Sous la classe minimale, aucun grade n'est produit — un dossier
 * insuffisamment documenté est un dossier non notable, pas un dossier moyen.
 */
export interface ConfidenceClassBand {
  code: "A" | "B" | "C" | "U";
  minScore: number; // inclus
  maxScore: number | null; // exclu
  labelFr: string;
}

export interface ConfidencePolicy {
  weights: ConfidenceWeights;
  classes: ConfidenceClassBand[];
  /** Classe minimale acceptable pour produire un grade. */
  minimumClassForRating: "A" | "B" | "C";
}

/**
 * Seuils de couverture (C07).
 *
 * La couverture mesure la part du poids portée par une donnée réellement
 * observée. Sous le seuil, le score existe (il est conservé pour la
 * surveillance) mais aucun grade n'est produit : sans cela, un dossier
 * majoritairement « prudent par défaut » recevrait un grade d'apparence
 * normale.
 */
export interface CoveragePolicy {
  minGlobalObservedBps: number;
  minDomainObservedBps: number;
}

/**
 * Philosophie de notation (H01).
 *
 * Sans elle, la calibration, le backtesting et l'IFRS 9 travaillent sur des
 * horizons implicitement différents.
 */
export interface RatingPhilosophy {
  type: "PIT" | "TTC" | "HYBRID";
  horizonMonths: number;
  /** Fenêtre d'observation par famille de données, en mois. */
  observationWindowsMonths: {
    financialStatements: number;
    behavioral: number;
    behavioralTarget: number;
    sector: number;
  };
  cycleTreatmentFr: string;
  migrationRuleFr: string;
  refreshRuleFr: string;
  postCutoffEventsFr: string;
}

/**
 * Méthode de support groupe (H05).
 *
 * La note autonome est toujours conservée ; le relèvement est plafonné et
 * conditionné aux quatre preuves. Un groupe solide ne rend pas l'emprunteur
 * meilleur : il rend un soutien probable, ce qui n'est pas la même chose.
 */
export interface GroupSupportConfig {
  maxNotches: number;
  methodFr: string;
  /** Les quatre conditions sont cumulatives : capacité, volonté, droit, transférabilité. */
  requiresAllConditions: boolean;
}

export interface ModelConfig {
  modelId: string;
  version: string;
  labelFr: string;
  status: "DRAFT_EXPERT_SEED" | "REVIEW" | "VALIDATED" | "PUBLISHED" | "RETIRED";
  effectiveFrom: string; // ISO date
  conventionFr: string;
  segments: Segment[];
  philosophy: RatingPhilosophy;
  domains: DomainConfig[];
  criteria: CriterionConfig[];
  gradeScale: GradeScaleConfig;
  /** Calibration attachée. Absente = aucune PD produite. */
  calibration?: CalibrationConfig;
  nonCompensatoryRules: NonCompensatoryRuleConfig[];
  redFlags: RedFlagConfig[];
  confidence: ConfidencePolicy;
  coverage: CoveragePolicy;
  groupSupport: GroupSupportConfig;
  /** Identifiant du référentiel de segmentation applicable (reference/segmentation). */
  segmentationRulesetId: string;
  pdStatus: PdStatus;
  disclaimerFr: string;
}

// ---------------------------------------------------------------------------
// Entrées d'un run de notation
// ---------------------------------------------------------------------------

export interface CriterionInput {
  status: DataStatus;
  /** Valeur mesurée (critère quantitatif). */
  value?: number;
  /** Score sélectionné 0/25/50/75/100 (critère qualitatif, ancré par preuves). */
  score?: CriterionScore;
  /** Cas spécial invoqué, parmi ceux déclarés par le critère. */
  specialCase?: string;
  /** Justification / preuve (référence GED, commentaire analyste). */
  evidence?: string;
}

/** Composantes du score de confiance, chacune notée 0/25/50/75/100. */
export interface ConfidenceInput {
  completeness: number;
  freshness: number;
  reliability: number;
  provenance: number;
}

/** Déclencheurs d'exceptions non compensatoires observés. */
export interface StructuralFlagsInput {
  companyAgeYears?: number;
  hasStrongGroupSupport?: boolean;
  negativeTangibleEquity?: boolean;
  firmRecapitalizationDone?: boolean;
  goingConcernMaterialUncertainty?: boolean;
  accountsTooOld?: boolean;
  ebitdaNegativeTwoOfThreeYears?: boolean;
  baseDscrBelow1?: boolean;
  stressDscrBelow1?: boolean;
  singleClientDependencyUnmitigated?: boolean;
  activeRestructuringForbearance?: boolean;
  materialGroupFileIncomplete?: boolean;
}

/**
 * Matérialité des risques conditionnels (H09).
 *
 * Renseignée depuis le référentiel sectoriel et la localisation des sites, pas
 * au jugement libre de l'analyste.
 */
export interface MaterialityFlags {
  esgPhysicalMaterial?: boolean;
  esgTransitionMaterial?: boolean;
  esgComplianceMaterial?: boolean;
  covenantsMaterial?: boolean;
}

/** Support groupe déclaré (H05). */
export interface GroupSupportInput {
  claimed: boolean;
  capacityDocumented?: boolean;
  willingnessDocumented?: boolean;
  legallyBinding?: boolean;
  fundsTransferable?: boolean;
  /** Écart de qualité entre le garant et la contrepartie, en crans demandés. */
  requestedNotches?: number;
}

export interface RatingInput {
  modelId: string;
  /** Segment fourni ou calculé par le référentiel de segmentation. */
  segment?: Segment;
  segmentationData?: {
    annualTurnover?: number; // CA HT MAD (entreprise)
    groupAnnualTurnover?: number;
    globalBankExposure?: number; // créances globales banque/groupe MAD
  };
  criteria: Record<string, CriterionInput>;
  confidence: ConfidenceInput;
  structuralFlags?: StructuralFlagsInput;
  materiality?: MaterialityFlags;
  groupSupport?: GroupSupportInput;
  /** Codes de red flags observés (issus des contrôles amont / conformité). */
  redFlags?: string[];
  /** Statut conformité amont. */
  complianceStatus?: ComplianceStatus;
  /**
   * Exposition déjà au bilan : autorise la notation sous voie contrôlée même
   * quand la conformité bloque l'entrée en relation (C06, étape 03 du pipeline).
   */
  existingExposure?: boolean;
  /** Défaut avéré selon la définition applicable : force un grade défaut. */
  defaultTriggered?: boolean;
  /** Grade de défaut constaté (DEF1/DEF2/DEF3) ; DEF1 par défaut. */
  defaultGrade?: "DEF1" | "DEF2" | "DEF3";
  asOfDate: string; // ISO date — date d'arrêté
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

export interface CriterionResult {
  code: string;
  domainCode: string;
  labelFr: string;
  /** Code d'explication stable : <DOMAINE>.<CRITERE>.<SENS>.<MOTIF>. */
  reasonCode: string;
  status: DataStatus;
  inputValue?: number;
  selectedScore?: CriterionScore;
  score: number | null; // null seulement si le poids a été transféré (NA déclarée)
  weightBps: number; // poids nominal
  /** Poids effectivement appliqué après transferts de non-applicabilité. */
  effectiveWeightBps: number;
  /** true si le score provient de la catégorie « missing » et non d'une observation. */
  imputed: boolean;
  domainContribution: number | null;
  explanationFr: string;
  binLabel?: string;
}

export interface DomainResult {
  code: string;
  labelFr: string;
  score: number | null;
  weightBps: number; // poids du domaine dans le score global
  /** Poids porté par une donnée réellement observée (hors imputation). */
  observedWeightBps: number;
  globalContribution: number | null;
  criteria: CriterionResult[];
}

export interface AppliedNonCompensatoryRule {
  code: string;
  labelFr: string;
  maxGrade: string | "NO_GRADE";
  source: RuleSource;
  centralCriterion: string | null;
}

export interface TriggeredRedFlag {
  code: string;
  labelFr: string;
  level: RedFlagLevel;
  source: RuleSource;
  treatmentFr: string;
}

/** Résultat de l'application de la méthode de support groupe (H05). */
export interface GroupSupportResult {
  claimed: boolean;
  granted: boolean;
  notchesApplied: number;
  missingConditionsFr: string[];
  rationaleFr: string;
}

export interface CoverageResult {
  globalObservedBps: number;
  totalWeightBps: number;
  /** Domaines sous le seuil de couverture. */
  deficientDomains: string[];
  meetsPolicy: boolean;
}

export interface ConfidenceResultView {
  score: number;
  classCode: "A" | "B" | "C" | "U";
  labelFr: string;
  /** La confiance ne plafonne plus le grade : ce champ le rappelle explicitement. */
  affectsGrade: false;
}

export interface RatingResult {
  /** Statut du moteur de notation — jamais une décision de crédit. */
  ratingStatus: RatingStatus;
  complianceStatus: ComplianceStatus;
  decisionStatus: PendingEngineStatus;
  regulatoryClassStatus: PendingEngineStatus;
  ifrs9Status: PendingEngineStatus;

  modelId: string;
  modelVersion: string;
  gradeScaleId: string;
  segment: Segment | null;
  segmentSource: "PROVIDED" | "COMPUTED" | "UNDETERMINED";
  segmentationRulesetId: string;
  asOfDate: string;

  rawScore: number | null; // score brut 0-100, conservé même sans grade
  domainResults: DomainResult[];
  coverage: CoverageResult;
  confidence: ConfidenceResultView;

  /** Grade issu du score, avant exceptions non compensatoires. */
  engineGrade: string | null;
  /** Grade après exceptions non compensatoires — note autonome. */
  standaloneGrade: string | null;
  /** Grade après relèvement de support groupe éventuel. */
  finalGrade: string | null;
  groupSupport: GroupSupportResult | null;

  appliedRules: AppliedNonCompensatoryRule[];
  triggeredRedFlags: TriggeredRedFlag[];
  blockingReasonsFr: string[];
  warningsFr: string[];
  inconsistenciesFr: string[];
  reasonCodes: string[];
  topStrengthsFr: string[];
  topWeaknessesFr: string[];

  pdStatus: PdStatus;
  /** PD à 12 mois. Nulle hors bac à sable tant que la calibration n'est pas observée (C02). */
  pd12m: number | null;
  calibrationId: string | null;
  usageRights: UsageRights;

  explanationFr: string;
  computedAt: string;
  engineVersion: string;
}
