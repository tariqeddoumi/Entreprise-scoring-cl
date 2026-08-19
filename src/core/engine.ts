import { binLabel, resolveBin } from "./binning";
import { computeConfidence } from "./confidence";
import { applyCap, DEFAULT_GRADE, gradeFromScore, gradeLabelFr } from "./grades";
import { determineSegment } from "./segmentation";
import type {
  AppliedCap,
  CriterionConfig,
  CriterionResult,
  DomainResult,
  ModelConfig,
  RatingInput,
  RatingResult,
  Segment,
  StructuralFlagsInput,
  TriggeredRedFlag,
} from "./types";

export const ENGINE_VERSION = "1.0.0";

/**
 * Moteur canonique de notation interne (Moteur A).
 *
 * Ordre de calcul obligatoire (grilles §4.4) :
 *  1. routage modèle — 2. segmentation — 3. complétude/validité —
 *  4-5. indicateurs et scores élémentaires — 6-7. agrégation domaine puis globale —
 *  8. caps qualité/structure — 9. red flags — 10. grade moteur —
 *  11. override (hors moteur, maker-checker) — 12. snapshot et explications.
 *
 * Le moteur est une fonction pure : aucune E/S, aucun horodatage implicite
 * autre que le champ métadonnée computedAt (fourni ou généré par l'appelant).
 */
export function computeRating(
  model: ModelConfig,
  input: RatingInput,
  nowIso?: string
): RatingResult {
  const computedAt = nowIso ?? new Date().toISOString();
  const warnings: string[] = [];
  const blocking: string[] = [];

  // --- 2. Segmentation -----------------------------------------------------
  const seg = determineSegment(input, model.segmentation);
  const base: Omit<
    RatingResult,
    | "outcome"
    | "rawScore"
    | "domainResults"
    | "engineGrade"
    | "cappedGrade"
    | "finalGrade"
    | "appliedCaps"
    | "triggeredRedFlags"
    | "confidenceScore"
    | "confidenceLevelFr"
  > = {
    modelId: model.modelId,
    modelVersion: model.version,
    segment: seg.segment,
    segmentSource: seg.source,
    asOfDate: input.asOfDate,
    blockingReasonsFr: blocking,
    warningsFr: warnings,
    topStrengthsFr: [],
    topWeaknessesFr: [],
    pdStatus: model.pdStatus,
    pd12m: null,
    explanationFr: "",
    computedAt,
    engineVersion: ENGINE_VERSION,
  };

  // --- 9a. Red flags bloquants : évalués AVANT tout score (jamais dilués) ---
  const triggeredRedFlags: TriggeredRedFlag[] = (input.redFlags ?? [])
    .map((code) => {
      const rf = model.redFlags.find((r) => r.code === code);
      if (!rf) {
        warnings.push(`Red flag inconnu ignoré : ${code}`);
        return null;
      }
      return {
        code: rf.code,
        labelFr: rf.labelFr,
        level: rf.level,
        source: rf.source,
        treatmentFr: rf.treatmentFr,
      } satisfies TriggeredRedFlag;
    })
    .filter((x): x is TriggeredRedFlag => x !== null);

  const confidence = computeConfidence(
    input.confidence,
    model.confidenceWeights,
    model.confidenceCaps
  );

  const hasBlockingFlag = triggeredRedFlags.some((rf) => rf.level === "BLOCK");
  if (hasBlockingFlag) {
    blocking.push(
      "Red flag de niveau BLOCK : la décision automatisée est arrêtée, escalade conformité/juridique/risque requise. Aucun score final n'est produit."
    );
    return {
      ...base,
      outcome: "BLOCKED_RED_FLAG",
      rawScore: null,
      domainResults: [],
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade: null,
      cappedGrade: null,
      finalGrade: null,
      appliedCaps: [],
      triggeredRedFlags,
      explanationFr: buildExplanation("BLOCKED_RED_FLAG", null, null, null, seg.segment, triggeredRedFlags),
    };
  }

  if (!seg.segment) {
    blocking.push(seg.explanationFr);
    return {
      ...base,
      outcome: "BLOCKED_SEGMENTATION",
      rawScore: null,
      domainResults: [],
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade: null,
      cappedGrade: null,
      finalGrade: null,
      appliedCaps: [],
      triggeredRedFlags,
      explanationFr: buildExplanation("BLOCKED_SEGMENTATION", null, null, null, null, triggeredRedFlags),
    };
  }
  const segment = seg.segment;

  // --- 3-7. Scores élémentaires et agrégation ------------------------------
  const domainResults: DomainResult[] = [];
  for (const domain of model.domains) {
    const criteria = model.criteria.filter((c) => c.domainCode === domain.code);
    const criterionResults: CriterionResult[] = [];
    let weightedSum = 0; // Σ(score × poids_bps)
    let applicableWeight = 0; // Σ(poids_bps applicables)
    let domainWeight = 0; // poids théorique du domaine (bps)

    for (const criterion of criteria) {
      const weightBps = criterion.weightsBps[segment] ?? 0;
      if (weightBps === 0) continue; // critère sans poids pour ce segment
      domainWeight += weightBps;

      const res = resolveCriterion(criterion, segment, input, warnings, blocking);
      criterionResults.push({ ...res, weightBps });

      if (res.score !== null) {
        weightedSum += res.score * weightBps;
        applicableWeight += weightBps;
      }
      // NOT_APPLICABLE : poids redistribué à l'intérieur du domaine
      // (exclu du dénominateur) — jamais entre domaines (grilles §4.2).
    }

    const score = applicableWeight > 0 ? weightedSum / applicableWeight : null;
    for (const cr of criterionResults) {
      cr.domainContribution =
        cr.score !== null && applicableWeight > 0
          ? (cr.score * cr.weightBps) / applicableWeight
          : null;
    }
    domainResults.push({
      code: domain.code,
      labelFr: domain.labelFr,
      score,
      weightBps: domainWeight,
      applicableWeightBps: applicableWeight,
      globalContribution: null,
      criteria: criterionResults,
    });
  }

  // Blocage donnée critique manquante/invalide.
  if (blocking.length > 0) {
    return {
      ...base,
      outcome: "BLOCKED_DATA",
      rawScore: null,
      domainResults,
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade: null,
      cappedGrade: null,
      finalGrade: null,
      appliedCaps: [],
      triggeredRedFlags,
      explanationFr: buildExplanation("BLOCKED_DATA", null, null, null, segment, triggeredRedFlags),
    };
  }

  // Agrégation globale : Σ(score_domaine × poids_domaine) / Σ(poids applicables).
  let globalWeighted = 0;
  let globalApplicableWeight = 0;
  for (const d of domainResults) {
    if (d.score !== null && d.weightBps > 0) {
      globalWeighted += d.score * d.weightBps;
      globalApplicableWeight += d.weightBps;
    } else if (d.weightBps > 0) {
      warnings.push(
        `Domaine ${d.code} entièrement non applicable : poids redistribué au niveau global (à documenter).`
      );
    }
  }
  if (globalApplicableWeight === 0) {
    blocking.push("Aucun domaine applicable : scoring impossible.");
    return {
      ...base,
      outcome: "BLOCKED_DATA",
      rawScore: null,
      domainResults,
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade: null,
      cappedGrade: null,
      finalGrade: null,
      appliedCaps: [],
      triggeredRedFlags,
      explanationFr: buildExplanation("BLOCKED_DATA", null, null, null, segment, triggeredRedFlags),
    };
  }
  const rawScore = globalWeighted / globalApplicableWeight;
  for (const d of domainResults) {
    d.globalContribution =
      d.score !== null ? (d.score * d.weightBps) / globalApplicableWeight : null;
  }

  // --- 8. Caps -------------------------------------------------------------
  const appliedCaps: AppliedCap[] = [];
  const flags = input.structuralFlags ?? {};
  for (const cap of model.structuralCaps) {
    if (evaluateCapTrigger(cap.trigger, flags)) {
      appliedCaps.push({
        code: cap.code,
        labelFr: cap.labelFr,
        maxGrade: cap.maxGrade,
        source: cap.source,
      });
    }
  }
  if (confidence.maxGrade !== "NONE") {
    appliedCaps.push({
      code: "CAP_CONFIDENCE",
      labelFr: `Niveau de confiance ${confidence.levelFr} (${confidence.score.toFixed(1)})`,
      maxGrade: confidence.maxGrade,
      source: "MODEL",
    });
  }

  // --- 10. Grades ----------------------------------------------------------
  const engineGrade = gradeFromScore(model.masterScale, rawScore);

  // Défaut avéré : grade défaut forcé, indépendamment du score (grilles §18.1).
  if (input.defaultTriggered) {
    return {
      ...base,
      outcome: "DEFAULT_GRADE",
      rawScore,
      domainResults,
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade,
      cappedGrade: DEFAULT_GRADE,
      finalGrade: DEFAULT_GRADE,
      appliedCaps,
      triggeredRedFlags,
      explanationFr: buildExplanation("DEFAULT_GRADE", rawScore, engineGrade, DEFAULT_GRADE, segment, triggeredRedFlags),
    };
  }

  const noGrade = appliedCaps.some((c) => c.maxGrade === "NO_GRADE");
  if (noGrade) {
    return {
      ...base,
      outcome: "NO_GRADE_CONFIDENCE",
      rawScore,
      domainResults,
      confidenceScore: confidence.score,
      confidenceLevelFr: confidence.levelFr,
      engineGrade,
      cappedGrade: null,
      finalGrade: null,
      appliedCaps,
      triggeredRedFlags,
      explanationFr: buildExplanation("NO_GRADE_CONFIDENCE", rawScore, engineGrade, null, segment, triggeredRedFlags),
    };
  }

  // Application du cap le plus contraignant ; le score brut est conservé.
  let cappedGrade = engineGrade;
  for (const cap of appliedCaps) {
    if (cap.maxGrade !== "NO_GRADE") {
      cappedGrade = applyCap(model.masterScale, cappedGrade, cap.maxGrade);
    }
  }

  const { strengths, weaknesses } = topFactors(domainResults);

  const result: RatingResult = {
    ...base,
    outcome: "SCORED",
    rawScore,
    domainResults,
    confidenceScore: confidence.score,
    confidenceLevelFr: confidence.levelFr,
    engineGrade,
    cappedGrade,
    finalGrade: cappedGrade,
    appliedCaps,
    triggeredRedFlags,
    explanationFr: "",
  };
  result.topStrengthsFr = strengths;
  result.topWeaknessesFr = weaknesses;
  result.explanationFr = buildExplanation(
    "SCORED",
    rawScore,
    engineGrade,
    cappedGrade,
    segment,
    triggeredRedFlags,
    gradeLabelFr(model.masterScale, cappedGrade)
  );
  return result;
}

// ---------------------------------------------------------------------------

function resolveCriterion(
  criterion: CriterionConfig,
  segment: Segment,
  input: RatingInput,
  warnings: string[],
  blocking: string[]
): Omit<CriterionResult, "weightBps"> {
  const ci = input.criteria[criterion.code];
  const baseRes = {
    code: criterion.code,
    domainCode: criterion.domainCode,
    labelFr: criterion.labelFr,
    domainContribution: null as number | null,
  };

  if (!ci) {
    // Donnée absente du payload = MISSING explicite, jamais un zéro silencieux.
    return handleUnavailable(criterion, "MISSING", baseRes, warnings, blocking);
  }

  if (ci.status === "NOT_APPLICABLE") {
    return {
      ...baseRes,
      status: "NOT_APPLICABLE",
      score: null,
      explanationFr:
        "Non applicable : poids redistribué à l'intérieur du domaine (règle versionnée).",
    };
  }

  if (ci.status === "MISSING" || ci.status === "INVALID" || ci.status === "STALE") {
    return handleUnavailable(criterion, ci.status, baseRes, warnings, blocking);
  }

  if (ci.status === "ESTIMATED") {
    warnings.push(
      `${criterion.code} : valeur estimée — à refléter dans le score de confiance (fiabilité/provenance).`
    );
  }

  // Cas spécial documenté (ex. EBITDA <= 0 pour le levier) => score 0 explicite.
  if (ci.specialCase) {
    return {
      ...baseRes,
      status: ci.status,
      inputValue: ci.value,
      score: 0,
      explanationFr: `Cas spécial « ${ci.specialCase} » : traitement économique défini par la grille — score 0.`,
    };
  }

  if (criterion.type === "QUANTITATIVE") {
    if (ci.value === undefined || !Number.isFinite(ci.value)) {
      return handleUnavailable(criterion, "INVALID", baseRes, warnings, blocking);
    }
    const bins =
      criterion.binsBySegment?.[segment] ?? criterion.binsBySegment?.ALL;
    if (!bins) {
      throw new Error(
        `Configuration invalide : ${criterion.code} sans barème pour le segment ${segment}`
      );
    }
    const match = resolveBin(bins, ci.value);
    if (!match) {
      throw new Error(
        `Barème non exhaustif pour ${criterion.code} (valeur ${ci.value})`
      );
    }
    return {
      ...baseRes,
      status: ci.status,
      inputValue: ci.value,
      score: match.score,
      binLabel: binLabel(match.bin, criterion.unit),
      explanationFr: `${criterion.labelFr} = ${ci.value}${criterion.unit ?? ""} → bande ${binLabel(match.bin, criterion.unit)} → score ${match.score}.`,
    };
  }

  // QUALITATIF : score ancré 0/25/50/75/100 sélectionné avec preuve.
  if (ci.score === undefined) {
    return handleUnavailable(criterion, "MISSING", baseRes, warnings, blocking);
  }
  if (![0, 25, 50, 75, 100].includes(ci.score)) {
    throw new Error(
      `Score qualitatif invalide pour ${criterion.code} : ${ci.score} (attendu 0/25/50/75/100)`
    );
  }
  const anchor = criterion.anchors?.find((a) => a.score === ci.score);
  return {
    ...baseRes,
    status: ci.status,
    selectedScore: ci.score,
    score: ci.score,
    explanationFr: anchor
      ? `Ancrage retenu (${ci.score}) : ${anchor.labelFr}`
      : `Score qualitatif ${ci.score} retenu.`,
  };
}

function handleUnavailable(
  criterion: CriterionConfig,
  status: "MISSING" | "INVALID" | "STALE",
  baseRes: { code: string; domainCode: string; labelFr: string; domainContribution: number | null },
  warnings: string[],
  blocking: string[]
): Omit<CriterionResult, "weightBps"> {
  const statusFr = { MISSING: "manquante", INVALID: "invalide", STALE: "obsolète" }[status];

  if (criterion.critical || criterion.missingPolicy === "BLOCK") {
    blocking.push(
      `${criterion.code} — ${criterion.labelFr} : donnée critique ${statusFr}. Scoring bloqué (politique de complétude).`
    );
    return {
      ...baseRes,
      status,
      score: null,
      explanationFr: `Donnée ${statusFr} sur critère critique : blocage.`,
    };
  }

  if (criterion.missingPolicy === "SCORE_0") {
    warnings.push(
      `${criterion.code} : donnée ${statusFr} — politique SCORE_0 appliquée (traitement conservateur documenté).`
    );
    return {
      ...baseRes,
      status,
      score: 0,
      explanationFr: `Donnée ${statusFr} : score 0 par politique conservatrice explicite.`,
    };
  }

  // WARN / CAP : le critère est exclu du calcul (dénominateur), la dégradation
  // est portée par le score de confiance — jamais un zéro silencieux.
  warnings.push(
    `${criterion.code} — ${criterion.labelFr} : donnée ${statusFr}, critère exclu du calcul. À refléter dans la complétude du score de confiance.`
  );
  return {
    ...baseRes,
    status,
    score: null,
    explanationFr: `Donnée ${statusFr} : critère exclu, impact porté par le niveau de confiance.`,
  };
}

/** Évalue un trigger de cap structurel à partir des flags fournis. */
function evaluateCapTrigger(trigger: string, f: StructuralFlagsInput): boolean {
  switch (trigger) {
    case "YOUNG_COMPANY_NO_SUPPORT":
      return (
        f.companyAgeYears !== undefined &&
        f.companyAgeYears < 2 &&
        !f.hasStrongGroupSupport
      );
    case "NEGATIVE_TANGIBLE_EQUITY":
      return f.negativeTangibleEquity === true && f.firmRecapitalizationDone !== true;
    case "GOING_CONCERN_UNCERTAINTY":
      return f.goingConcernMaterialUncertainty === true;
    case "ACCOUNTS_TOO_OLD":
      return f.accountsTooOld === true;
    case "EBITDA_NEGATIVE_2_OF_3":
      return f.ebitdaNegativeTwoOfThreeYears === true;
    case "BASE_DSCR_BELOW_1":
      return f.baseDscrBelow1 === true;
    case "STRESS_DSCR_BELOW_1":
      return f.stressDscrBelow1 === true && f.baseDscrBelow1 !== true;
    case "SINGLE_CLIENT_DEPENDENCY":
      return f.singleClientDependencyUnmitigated === true;
    case "ACTIVE_RESTRUCTURING":
      return f.activeRestructuringForbearance === true;
    case "GROUP_FILE_INCOMPLETE":
      return f.materialGroupFileIncomplete === true;
    default:
      throw new Error(`Trigger de cap inconnu : ${trigger}`);
  }
}

function topFactors(domains: DomainResult[]): {
  strengths: string[];
  weaknesses: string[];
} {
  const all = domains.flatMap((d) => d.criteria).filter((c) => c.score !== null);
  const byImpact = (dir: 1 | -1) =>
    [...all].sort((a, b) => {
      const ia = (dir === 1 ? (a.score ?? 0) : 100 - (a.score ?? 0)) * a.weightBps;
      const ib = (dir === 1 ? (b.score ?? 0) : 100 - (b.score ?? 0)) * b.weightBps;
      return ib - ia;
    });
  const strengths = byImpact(1)
    .filter((c) => (c.score ?? 0) >= 75)
    .slice(0, 5)
    .map((c) => `${c.code} — ${c.labelFr} (score ${c.score})`);
  const weaknesses = byImpact(-1)
    .filter((c) => (c.score ?? 100) <= 25)
    .slice(0, 5)
    .map((c) => `${c.code} — ${c.labelFr} (score ${c.score})`);
  return { strengths, weaknesses };
}

function buildExplanation(
  outcome: string,
  rawScore: number | null,
  engineGrade: string | null,
  finalGrade: string | null,
  segment: Segment | null,
  redFlags: TriggeredRedFlag[],
  gradeLabel?: string
): string {
  const parts: string[] = [];
  if (segment) parts.push(`Segment ${segment}.`);
  switch (outcome) {
    case "SCORED":
      parts.push(
        `Score brut ${rawScore?.toFixed(2)} / 100 → grade moteur ${engineGrade}` +
          (finalGrade !== engineGrade
            ? `, plafonné à ${finalGrade} (${gradeLabel ?? ""}) après application des caps.`
            : ` (${gradeLabel ?? ""}).`)
      );
      break;
    case "DEFAULT_GRADE":
      parts.push(
        `Définition de défaut déclenchée : grade défaut forcé (${finalGrade}), indépendamment du score brut ${rawScore?.toFixed(2)}.`
      );
      break;
    case "BLOCKED_RED_FLAG":
      parts.push("Scoring arrêté par un red flag bloquant.");
      break;
    case "BLOCKED_DATA":
      parts.push("Scoring bloqué : données critiques manquantes ou invalides.");
      break;
    case "BLOCKED_SEGMENTATION":
      parts.push("Scoring bloqué : segment TPE/PME/GE indéterminable.");
      break;
    case "NO_GRADE_CONFIDENCE":
      parts.push(
        `Aucun grade final : qualité de données insuffisante ou comptes trop anciens (score brut ${rawScore?.toFixed(2)} conservé pour le monitoring).`
      );
      break;
  }
  const refer = redFlags.filter((r) => r.level === "REFER" || r.level === "DEFAULT_CHECK");
  if (refer.length > 0) {
    parts.push(
      `Signaux nécessitant un traitement séparé : ${refer.map((r) => r.code).join(", ")}.`
    );
  }
  return parts.join(" ");
}
