/**
 * Types du domaine — moteur de notation interne entreprises (TPE/PME/GE).
 *
 * Ce module est PUR : aucune dépendance framework, base de données ou réseau.
 * Toutes les décisions du moteur sont déterministes et reproductibles :
 * même snapshot + même version de modèle => même résultat.
 */

/** Segments de contreparties supportés (segmentation BAM seed, paramétrable). */
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

/** Politique appliquée quand la donnée d'un critère est manquante/invalide. */
export type MissingPolicy = "BLOCK" | "CAP" | "SCORE_0" | "WARN";

/** Sens économique d'un ratio quantitatif. */
export type Direction = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

/** Sévérité d'un red flag. */
export type RedFlagLevel = "BLOCK" | "DEFAULT_CHECK" | "REFER" | "WARNING" | "INFO";

/** Source d'une règle : un red flag interne ne doit jamais être présenté comme une exigence BAM. */
export type RuleSource = "REGULATORY" | "IFRS9" | "CREDIT_POLICY" | "COMPLIANCE" | "MODEL";

/** Statut de calibration de la PD. Tant que UNCALIBRATED, aucune PD n'est exposée. */
export type PdStatus = "UNCALIBRATED" | "CALIBRATED" | "TECHNICAL_ONLY_DISABLED";

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
  /** Cas spéciaux : ex. EBITDA <= 0 => score 0. Documenté, jamais silencieux. */
  specialCasesFr?: string[];
  missingPolicy: MissingPolicy;
  /** true si la donnée est critique : MISSING/INVALID => blocage du scoring. */
  critical: boolean;
  evidenceRequiredFr?: string[];
  formulaFr?: string;
}

export interface DomainConfig {
  code: string; // "D1".."D7" ou "B1".."B7"
  labelFr: string;
  descriptionFr?: string;
}

export interface GradeBand {
  grade: string; // "G1".."G10"
  minScore: number | null; // inclus
  maxScore: number | null; // exclu (null = +inf)
  labelFr: string;
  indicativeDecisionFr: string;
}

/** Cap structurel : le grade final ne peut être meilleur que maxGrade. */
export interface StructuralCapConfig {
  code: string;
  labelFr: string;
  /** Grade plafond (ex. "G7" : pas mieux que G7). "NONE" = aucun grade final. */
  maxGrade: string | "NO_GRADE";
  source: RuleSource;
  /** Identifiant du trigger évalué par le moteur à partir des inputs. */
  trigger: string;
}

export interface RedFlagConfig {
  code: string; // RF01..RF18
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

/** Cap de grade en fonction du niveau de confiance. */
export interface ConfidenceCapBand {
  minConfidence: number; // inclus
  maxConfidence: number | null; // exclu, null = +inf
  levelFr: string;
  maxGrade: string | "NO_GRADE" | "NONE"; // NONE = pas de cap
}

export interface SegmentationRuleConfig {
  /** Seuil CA HT (MAD) au-delà duquel la contrepartie est GE. */
  geTurnoverThreshold: number;
  /** Seuil CA HT (MAD) TPE/PME. */
  smeTurnoverThreshold: number;
  /** Seuil d'exposition globale banque/groupe (MAD) TPE/PME. */
  smeExposureThreshold: number;
  currency: string;
  sourceFr: string;
  status: "SEED_TO_CONFIRM" | "CONFIRMED";
}

export interface ModelConfig {
  modelId: string; // "CORP_STD_V1" | "CORP_TPE_BEHAV_V1"
  version: string; // "1.0.0"
  labelFr: string;
  status: "DRAFT_EXPERT_SEED" | "REVIEW" | "VALIDATED" | "PUBLISHED" | "RETIRED";
  effectiveFrom: string; // ISO date
  conventionFr: string;
  segments: Segment[];
  domains: DomainConfig[];
  criteria: CriterionConfig[];
  masterScale: GradeBand[];
  structuralCaps: StructuralCapConfig[];
  redFlags: RedFlagConfig[];
  confidenceWeights: ConfidenceWeights;
  confidenceCaps: ConfidenceCapBand[];
  segmentation: SegmentationRuleConfig;
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
  /** Cas spécial déclaré (ex. "EBITDA_LTE_0", "NEGATIVE_TANGIBLE_EQUITY"). */
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

/** Déclencheurs de caps structurels observés (booléens fournis ou dérivés). */
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

export interface RatingInput {
  modelId: string;
  /** Segment fourni ou calculé par le moteur de segmentation. */
  segment?: Segment;
  segmentationData?: {
    annualTurnover?: number; // CA HT MAD (entreprise ou groupe)
    groupAnnualTurnover?: number;
    globalBankExposure?: number; // créances globales banque/groupe MAD
  };
  criteria: Record<string, CriterionInput>;
  confidence: ConfidenceInput;
  structuralFlags?: StructuralFlagsInput;
  /** Codes de red flags observés (issus des contrôles amont / conformité). */
  redFlags?: string[];
  /** Défaut avéré selon la définition applicable : force un grade défaut. */
  defaultTriggered?: boolean;
  asOfDate: string; // ISO date — date d'arrêté
}

// ---------------------------------------------------------------------------
// Résultats
// ---------------------------------------------------------------------------

export interface CriterionResult {
  code: string;
  domainCode: string;
  labelFr: string;
  status: DataStatus;
  inputValue?: number;
  selectedScore?: CriterionScore;
  score: number | null; // null si NOT_APPLICABLE / bloquant
  weightBps: number;
  /** Contribution au score du domaine (points). */
  domainContribution: number | null;
  explanationFr: string;
  binLabel?: string;
}

export interface DomainResult {
  code: string;
  labelFr: string;
  score: number | null;
  weightBps: number; // poids du domaine dans le score global
  applicableWeightBps: number; // poids effectivement applicables (après NA)
  globalContribution: number | null;
  criteria: CriterionResult[];
}

export interface AppliedCap {
  code: string;
  labelFr: string;
  maxGrade: string | "NO_GRADE";
  source: RuleSource;
}

export interface TriggeredRedFlag {
  code: string;
  labelFr: string;
  level: RedFlagLevel;
  source: RuleSource;
  treatmentFr: string;
}

export type RatingOutcome =
  | "SCORED"
  | "BLOCKED_RED_FLAG"
  | "BLOCKED_DATA"
  | "BLOCKED_SEGMENTATION"
  | "DEFAULT_GRADE"
  | "NO_GRADE_CONFIDENCE";

export interface RatingResult {
  outcome: RatingOutcome;
  modelId: string;
  modelVersion: string;
  segment: Segment | null;
  segmentSource: "PROVIDED" | "COMPUTED" | "UNDETERMINED";
  asOfDate: string;
  rawScore: number | null; // score brut 0-100, toujours conservé si calculable
  domainResults: DomainResult[];
  confidenceScore: number;
  confidenceLevelFr: string;
  engineGrade: string | null; // grade moteur avant caps
  cappedGrade: string | null; // grade après caps (structurels + confiance)
  finalGrade: string | null; // = cappedGrade ; l'override est géré hors moteur
  appliedCaps: AppliedCap[];
  triggeredRedFlags: TriggeredRedFlag[];
  blockingReasonsFr: string[];
  warningsFr: string[];
  topStrengthsFr: string[];
  topWeaknessesFr: string[];
  pdStatus: PdStatus;
  pd12m: number | null; // toujours null tant que pdStatus != CALIBRATED
  explanationFr: string;
  computedAt: string;
  engineVersion: string;
}
