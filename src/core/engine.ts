import { binLabel, resolveBin } from "./binning";
import { pdForGrade } from "./calibration";
import { computeConfidence, meetsMinimumClass } from "./confidence";
import { applyCap, gradeFromScore, gradeLabelFr } from "./grades";
import { applyGroupSupport } from "./group-support";
import { DEFAULT_GRADE_FALLBACK } from "@/reference/default-policy";
import { determineSegment, rulesetById } from "@/reference/segmentation";
import type {
  AppliedNonCompensatoryRule,
  ComplianceStatus,
  CoverageResult,
  CriterionConfig,
  CriterionResult,
  DomainResult,
  MaterialityFlags,
  ModelConfig,
  RatingInput,
  RatingResult,
  ResultPurpose,
  Segment,
  StructuralFlagsInput,
  TriggeredRedFlag,
  UsageRights,
} from "./types";

export const ENGINE_VERSION = "3.0.0";

/** Âge minimal, en années, en deçà duquel la contrepartie est routée hors grilles publiées. */
const YOUNG_COMPANY_YEARS = 2;

export interface EngineOptions {
  nowIso?: string;
  /**
   * Autorise l'exposition d'une PD issue d'une calibration non observée.
   *
   * Par défaut FAUX — le refus est la position sûre (constat C02). Seul un
   * environnement bac à sable explicitement déclaré peut l'activer, et le
   * résultat porte alors la finalité SIMULATION_ONLY.
   */
  syntheticPdAllowed?: boolean;
}

/**
 * Moteur canonique de notation interne — Moteur 1 sur cinq.
 *
 * PIPELINE CANONIQUE (constat H14 — l'ordre V2 était contredit par ses propres
 * exemples : les plafonds y figuraient avant le grade moteur) :
 *
 *   01 Identité, groupe, arrêté ......... en amont (service d'identité)
 *   02 Routage .......................... segment puis éligibilité du modèle
 *   03 Contrôles de relation ............ statut conformité, SANS fusion
 *   04 Défaut ........................... constat amont, force un grade défaut
 *   05 Qualité et couverture ............ classe de confiance, seuils de couverture
 *   06 Caractéristiques ................. résolution des critères
 *   07 Score brut ....................... agrégation à poids total constant
 *   08 Grade moteur ..................... échelle propre au modèle
 *   09 Exceptions non compensatoires .... APRÈS le grade moteur
 *   10 Grade risque autonome ............ standalone conservé
 *   11 Support groupe ................... relèvement plafonné et conditionné
 *   12 Dérogation ....................... hors moteur (maker-checker)
 *   13 Persistance et diffusion ......... hors moteur
 *
 * Le moteur est une fonction pure : aucune E/S, aucune lecture d'environnement,
 * aucune horloge implicite. Il ne produit JAMAIS de décision de crédit, de
 * classe réglementaire ni de stage IFRS 9 — les statuts correspondants restent
 * NOT_EVALUATED, ce qui est une information, pas un oubli.
 */
export function computeRating(
  model: ModelConfig,
  input: RatingInput,
  options: EngineOptions | string = {}
): RatingResult {
  const opts: EngineOptions = typeof options === "string" ? { nowIso: options } : options;
  const computedAt = opts.nowIso ?? new Date().toISOString();
  const warnings: string[] = [];
  const blocking: string[] = [];
  const inconsistencies: string[] = [];

  // --- 03. Contrôles de relation : statut conformité, jamais fusionné -------
  const triggeredRedFlags = resolveRedFlags(model, input.redFlags ?? [], warnings);
  const complianceStatus = resolveComplianceStatus(input.complianceStatus, triggeredRedFlags);

  // --- 05a. Confiance (classe, sans effet sur le grade) --------------------
  const confidence = computeConfidence(input.confidence, model.confidence);

  // --- 02. Routage : segment puis éligibilité du modèle --------------------
  const ruleset = rulesetById(model.segmentationRulesetId);
  const seg = determineSegment(input, ruleset);

  const shell = {
    modelId: model.modelId,
    modelVersion: model.version,
    gradeScaleId: model.gradeScale.scaleId,
    segment: seg.segment,
    segmentSource: seg.source,
    segmentationRulesetId: ruleset.rulesetId,
    asOfDate: input.asOfDate,
    complianceStatus,
    decisionStatus: "NOT_EVALUATED" as const,
    regulatoryClassStatus: "NOT_EVALUATED" as const,
    ifrs9Status: "NOT_EVALUATED" as const,
    blockingReasonsFr: blocking,
    warningsFr: warnings,
    inconsistenciesFr: inconsistencies,
    reasonCodes: [] as string[],
    topStrengthsFr: [] as string[],
    topWeaknessesFr: [] as string[],
    pdStatus: model.pdStatus,
    pd12m: null as number | null,
    calibrationId: model.calibration?.calibrationId ?? null,
    computedAt,
    engineVersion: ENGINE_VERSION,
    triggeredRedFlags,
    confidence,
    groupSupport: null,
    appliedRules: [] as AppliedNonCompensatoryRule[],
  };

  const emptyCoverage: CoverageResult = {
    globalObservedBps: 0,
    totalWeightBps: 0,
    deficientDomains: [],
    meetsPolicy: false,
  };

  if (!seg.segment) {
    blocking.push(seg.explanationFr);
    return finalize(model, opts, {
      ...shell,
      ratingStatus: "NO_RATING_SEGMENT_UNDETERMINED",
      rawScore: null,
      domainResults: [],
      coverage: emptyCoverage,
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr: seg.explanationFr,
    });
  }
  const segment = seg.segment;

  if (!model.segments.includes(segment)) {
    const msg = `Modèle ${model.modelId} non publié pour le segment ${segment} : le dossier doit être routé vers la grille applicable. Le choix du modèle ne peut pas appartenir à l'appelant.`;
    blocking.push(msg);
    return finalize(model, opts, {
      ...shell,
      ratingStatus: "NO_RATING_ROUTED_OTHER_MODEL",
      rawScore: null,
      domainResults: [],
      coverage: emptyCoverage,
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr: msg,
    });
  }

  // Route « jeune entreprise » (constat C08/H03) : remplace l'ancien plafond
  // CAP01. Un plafond de grade tenait lieu de modèle de millésime, alors que
  // 98,5 % des créations d'entreprises marocaines sont des micro-entreprises.
  // Le dossier sort des grilles publiées au lieu d'être noté puis plafonné.
  const flags = input.structuralFlags ?? {};
  if (
    flags.companyAgeYears !== undefined &&
    flags.companyAgeYears < YOUNG_COMPANY_YEARS &&
    !flags.hasStrongGroupSupport
  ) {
    const msg = `Entreprise de moins de ${YOUNG_COMPANY_YEARS} ans sans support groupe juridiquement robuste : routage vers le traitement jeune entreprise. Les grilles publiées supposent un historique que ce dossier n'a pas ; un grade plafonné donnerait une fausse impression de mesure.`;
    blocking.push(msg);
    return finalize(model, opts, {
      ...shell,
      ratingStatus: "NO_RATING_ROUTED_OTHER_MODEL",
      rawScore: null,
      domainResults: [],
      coverage: emptyCoverage,
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr: msg,
    });
  }

  // --- 06. Caractéristiques : poids effectifs puis résolution --------------
  const effectiveWeights = computeEffectiveWeights(model, segment, input, inconsistencies);
  const { domainResults, coverage } = scoreDomains(
    model,
    segment,
    input,
    effectiveWeights,
    warnings,
    blocking
  );

  if (blocking.length > 0) {
    // Donnée CRITIQUE absente : aucun score n'est publié, même partiel. Le
    // score d'un dossier amputé d'une variable bloquante ne mesure rien — à la
    // différence d'un dossier simplement peu couvert, où le score est conservé
    // pour la surveillance (porte de couverture, plus bas).
    return finalize(model, opts, {
      ...shell,
      ratingStatus: "NO_RATING_INSUFFICIENT_DATA",
      rawScore: null,
      domainResults,
      coverage,
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr:
        "Notation impossible : donnée critique manquante ou invalide. Le score brut éventuel est conservé pour la surveillance du modèle, jamais pour une décision.",
    });
  }

  // --- 07. Score brut ------------------------------------------------------
  const rawScore = aggregate(domainResults);
  if (rawScore === null) {
    blocking.push("Aucun domaine pondéré applicable : agrégation impossible.");
    return finalize(model, opts, {
      ...shell,
      ratingStatus: "NO_RATING_INSUFFICIENT_DATA",
      rawScore: null,
      domainResults,
      coverage,
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr: "Notation impossible : aucun domaine pondéré applicable.",
    });
  }
  for (const d of domainResults) {
    d.globalContribution =
      d.score !== null ? (d.score * d.weightBps) / totalDomainWeight(domainResults) : null;
  }

  const { strengths, weaknesses } = topFactors(domainResults);
  inconsistencies.push(...detectInconsistencies(triggeredRedFlags, domainResults));
  const reasonCodes = domainResults
    .flatMap((d) => d.criteria)
    .filter((c) => c.score !== null && (c.score >= 75 || c.score <= 25))
    .sort((a, b) => b.effectiveWeightBps - a.effectiveWeightBps)
    .slice(0, 15)
    .map((c) => c.reasonCode)
    .filter(Boolean);

  const scored = {
    ...shell,
    rawScore,
    domainResults,
    coverage,
    topStrengthsFr: strengths,
    topWeaknessesFr: weaknesses,
    reasonCodes,
  };

  // --- 04. Défaut : un constat, pas une estimation -------------------------
  // Évalué avant la porte de qualité : un défaut avéré s'impose quelle que
  // soit la couverture de l'information.
  if (input.defaultTriggered) {
    const defGrade = input.defaultGrade ?? DEFAULT_GRADE_FALLBACK;
    return finalize(model, opts, {
      ...scored,
      ratingStatus: "DEFAULTED",
      engineGrade: gradeFromScore(model.gradeScale, rawScore),
      standaloneGrade: defGrade,
      finalGrade: defGrade,
      explanationFr: `Défaut constaté (${defGrade}) : le grade de défaut s'impose indépendamment du score brut ${rawScore.toFixed(2)}, conservé pour la surveillance. La classification réglementaire et le stage IFRS 9 relèvent de moteurs distincts.`,
    });
  }

  // --- 05b. Porte de qualité : couverture et classe de confiance -----------
  // La confiance ne plafonne plus le grade (constat H02) : elle ouvre ou ferme
  // la porte, sans déformer l'échelle de risque.
  const confidenceOk = meetsMinimumClass(
    confidence.classCode,
    model.confidence.minimumClassForRating
  );
  if (!coverage.meetsPolicy || !confidenceOk) {
    const raisons: string[] = [];
    if (!coverage.meetsPolicy) {
      raisons.push(
        `couverture insuffisante (${(coverage.globalObservedBps / 100).toFixed(1)} % du poids porté par une donnée observée, minimum ${(model.coverage.minGlobalObservedBps / 100).toFixed(1)} %${coverage.deficientDomains.length > 0 ? ` ; domaines sous le seuil : ${coverage.deficientDomains.join(", ")}` : ""})`
      );
    }
    if (!confidenceOk) {
      raisons.push(
        `classe de confiance ${confidence.classCode} inférieure au minimum ${model.confidence.minimumClassForRating}`
      );
    }
    return finalize(model, opts, {
      ...scored,
      ratingStatus: "NO_RATING_INSUFFICIENT_DATA",
      engineGrade: null,
      standaloneGrade: null,
      finalGrade: null,
      explanationFr: `Aucun grade produit — ${raisons.join(" ; ")}. Le score brut ${rawScore.toFixed(2)} est conservé pour la surveillance du modèle. La réponse attendue est de compléter le dossier, non d'interpréter une note dégradée.`,
    });
  }

  // --- 08. Grade moteur ----------------------------------------------------
  const engineGrade = gradeFromScore(model.gradeScale, rawScore);

  // --- 09. Exceptions non compensatoires, APRÈS le grade moteur ------------
  const appliedRules: AppliedNonCompensatoryRule[] = [];
  for (const rule of model.nonCompensatoryRules) {
    if (evaluateTrigger(rule.trigger, flags)) {
      appliedRules.push({
        code: rule.code,
        labelFr: rule.labelFr,
        maxGrade: rule.maxGrade,
        source: rule.source,
        centralCriterion: rule.centralCriterion,
      });
    }
  }

  // --- 10. Grade autonome --------------------------------------------------
  let standaloneGrade: string | null = engineGrade;
  if (appliedRules.some((r) => r.maxGrade === "NO_GRADE")) {
    standaloneGrade = null;
  } else {
    for (const r of appliedRules) {
      if (r.maxGrade !== "NO_GRADE") {
        standaloneGrade = applyCap(model.gradeScale, standaloneGrade as string, r.maxGrade);
      }
    }
  }

  // --- 11. Support groupe : note autonome conservée ------------------------
  const { finalGrade, support } = applyGroupSupport(
    model.gradeScale,
    model.groupSupport,
    standaloneGrade,
    input.groupSupport
  );

  return finalize(model, opts, {
    ...scored,
    appliedRules,
    groupSupport: support,
    ratingStatus: standaloneGrade === null ? "NO_RATING_INSUFFICIENT_DATA" : "RATED",
    engineGrade,
    standaloneGrade,
    finalGrade,
    explanationFr: buildExplanation(
      model,
      rawScore,
      engineGrade,
      standaloneGrade,
      finalGrade,
      segment,
      confidence.classCode,
      triggeredRedFlags,
      support
    ),
  });
}

// ---------------------------------------------------------------------------
// Étapes internes
// ---------------------------------------------------------------------------

function resolveRedFlags(
  model: ModelConfig,
  codes: string[],
  warnings: string[]
): TriggeredRedFlag[] {
  return codes
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
}

/**
 * Statut conformité (constat C06).
 *
 * Un red flag de conformité ne supprime plus la notation : il alimente un
 * statut distinct. Refuser de noter une exposition déjà au bilan reviendrait à
 * refuser de la surveiller et de la provisionner — la conformité interdit une
 * relation ou une opération, pas la connaissance du risque.
 */
function resolveComplianceStatus(
  declared: ComplianceStatus | undefined,
  flags: TriggeredRedFlag[]
): ComplianceStatus {
  if (declared && declared !== "NOT_EVALUATED") return declared;
  const hasBlock = flags.some((f) => f.source === "COMPLIANCE" && f.level === "BLOCK");
  if (hasBlock) return "BLOCKED";
  const hasRefer = flags.some((f) => f.source === "COMPLIANCE");
  if (hasRefer) return "REFER";
  return declared ?? "NOT_EVALUATED";
}

/**
 * Poids effectifs après transferts de non-applicabilité (constat C07).
 *
 * La redistribution proportionnelle a disparu. Un critère déclaré non
 * applicable ne peut l'être que si le modèle a prévu la situation ET nommé le
 * critère du même domaine qui reçoit son poids. Le poids total reste donc
 * strictement constant d'un dossier à l'autre, condition sans laquelle deux
 * scores ne sont pas comparables.
 */
function computeEffectiveWeights(
  model: ModelConfig,
  segment: Segment,
  input: RatingInput,
  inconsistencies: string[]
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const c of model.criteria) {
    weights.set(c.code, c.weightsBps[segment] ?? 0);
  }

  for (const criterion of model.criteria) {
    const nominal = criterion.weightsBps[segment] ?? 0;
    if (nominal === 0) continue;

    const declaredNa = input.criteria[criterion.code]?.status === "NOT_APPLICABLE";
    const gatedOut = isGatedOut(criterion, input.materiality);
    if (!declaredNa && !gatedOut) continue;

    const rule = criterion.notApplicableRule;
    if (!rule) {
      // NA non prévue : la donnée est traitée comme manquante, jamais comme
      // une dispense. C'est ce qui empêche un analyste d'écarter un critère
      // défavorable en le déclarant sans objet.
      if (declaredNa) {
        inconsistencies.push(
          `${criterion.code} : non-applicabilité déclarée alors que le modèle ne la prévoit pas pour ce critère. Donnée traitée comme manquante.`
        );
      }
      continue;
    }
    const target = weights.get(rule.transferWeightTo);
    if (target === undefined) {
      inconsistencies.push(
        `${criterion.code} : critère receveur ${rule.transferWeightTo} introuvable, poids conservé.`
      );
      continue;
    }
    weights.set(rule.transferWeightTo, target + nominal);
    weights.set(criterion.code, 0);
  }
  return weights;
}

/** true si un critère conditionné à la matérialité n'est pas matériel ici. */
function isGatedOut(criterion: CriterionConfig, materiality?: MaterialityFlags): boolean {
  if (!criterion.materialityGate) return false;
  return materiality?.[criterion.materialityGate.flag] !== true;
}

function scoreDomains(
  model: ModelConfig,
  segment: Segment,
  input: RatingInput,
  effectiveWeights: Map<string, number>,
  warnings: string[],
  blocking: string[]
): { domainResults: DomainResult[]; coverage: CoverageResult } {
  const domainResults: DomainResult[] = [];
  let totalWeight = 0;
  let totalObserved = 0;
  const deficientDomains: string[] = [];

  for (const domain of model.domains) {
    const criteria = model.criteria.filter((c) => c.domainCode === domain.code);
    const criterionResults: CriterionResult[] = [];
    let weightedSum = 0;
    let domainWeight = 0;
    let observedWeight = 0;

    for (const criterion of criteria) {
      const nominal = criterion.weightsBps[segment] ?? 0;
      const effective = effectiveWeights.get(criterion.code) ?? 0;
      if (nominal === 0 && effective === 0) continue;

      const gatedOut = isGatedOut(criterion, input.materiality);
      const res = resolveCriterion(
        criterion,
        segment,
        input,
        gatedOut,
        effective,
        warnings,
        blocking
      );
      criterionResults.push({ ...res, weightBps: nominal, effectiveWeightBps: effective });

      if (effective > 0) {
        domainWeight += effective;
        if (res.score !== null) weightedSum += res.score * effective;
        if (!res.imputed && res.status === "AVAILABLE") observedWeight += effective;
      }
    }

    const score = domainWeight > 0 ? weightedSum / domainWeight : null;
    for (const cr of criterionResults) {
      cr.domainContribution =
        cr.score !== null && domainWeight > 0
          ? (cr.score * cr.effectiveWeightBps) / domainWeight
          : null;
    }

    if (domainWeight > 0) {
      totalWeight += domainWeight;
      totalObserved += observedWeight;
      const domainCoverageBps = Math.round((observedWeight / domainWeight) * 10_000);
      if (domainCoverageBps < model.coverage.minDomainObservedBps) {
        deficientDomains.push(domain.code);
      }
    }

    domainResults.push({
      code: domain.code,
      labelFr: domain.labelFr,
      score,
      weightBps: domainWeight,
      observedWeightBps: observedWeight,
      globalContribution: null,
      criteria: criterionResults,
    });
  }

  const globalObservedBps =
    totalWeight > 0 ? Math.round((totalObserved / totalWeight) * 10_000) : 0;
  const coverage: CoverageResult = {
    globalObservedBps,
    totalWeightBps: totalWeight,
    deficientDomains,
    meetsPolicy:
      globalObservedBps >= model.coverage.minGlobalObservedBps && deficientDomains.length === 0,
  };
  return { domainResults, coverage };
}

function resolveCriterion(
  criterion: CriterionConfig,
  segment: Segment,
  input: RatingInput,
  gatedOut: boolean,
  effectiveWeight: number,
  warnings: string[],
  blocking: string[]
): Omit<CriterionResult, "weightBps" | "effectiveWeightBps"> {
  const ci = input.criteria[criterion.code];
  const baseRes = {
    code: criterion.code,
    domainCode: criterion.domainCode,
    labelFr: criterion.labelFr,
    domainContribution: null as number | null,
    reasonCode: "",
    imputed: false,
  };

  if (gatedOut) {
    return {
      ...baseRes,
      status: "NOT_APPLICABLE",
      score: null,
      reasonCode: `${criterion.domainCode}.${key(criterion.code)}.NA.NOT_MATERIAL`,
      explanationFr: `Risque non matériel pour cette contrepartie : critère écarté et poids transféré à ${criterion.notApplicableRule?.transferWeightTo ?? "—"} (règle déclarée). ${criterion.materialityGate?.rationaleFr ?? ""}`.trim(),
    };
  }

  if (effectiveWeight === 0 && ci?.status === "NOT_APPLICABLE") {
    return {
      ...baseRes,
      status: "NOT_APPLICABLE",
      score: null,
      reasonCode: `${criterion.domainCode}.${key(criterion.code)}.NA.DECLARED`,
      explanationFr: `Non applicable selon la règle déclarée : poids transféré à ${criterion.notApplicableRule?.transferWeightTo ?? "—"}, poids total du modèle inchangé.`,
    };
  }

  if (!ci) {
    return handleUnavailable(criterion, "MISSING", baseRes, warnings, blocking);
  }

  if (ci.status === "NOT_APPLICABLE") {
    // NA non prévue par le modèle : traitée comme manquante (cf. computeEffectiveWeights).
    return handleUnavailable(criterion, "MISSING", baseRes, warnings, blocking);
  }

  if (ci.status === "MISSING" || ci.status === "INVALID" || ci.status === "STALE") {
    return handleUnavailable(criterion, ci.status, baseRes, warnings, blocking);
  }

  if (ci.status === "ESTIMATED") {
    warnings.push(
      `${criterion.code} : valeur estimée — comptée dans le score mais exclue de la couverture observée. Une estimation n'est pas une observation certifiée.`
    );
  }

  if (ci.specialCase) {
    const declared = criterion.specialCases?.find((sc) => sc.code === ci.specialCase);
    if (!declared) {
      warnings.push(
        `${criterion.code} : cas spécial « ${ci.specialCase} » non déclaré par le modèle — donnée traitée comme invalide.`
      );
      return handleUnavailable(criterion, "INVALID", baseRes, warnings, blocking);
    }
    return {
      ...baseRes,
      status: ci.status,
      inputValue: ci.value,
      score: declared.score,
      reasonCode: reasonCode(criterion, declared.score, `SPECIAL_${declared.code}`),
      explanationFr: `Cas spécial « ${declared.labelFr} » : score ${declared.score} imposé par la grille.`,
    };
  }

  if (criterion.type === "QUANTITATIVE") {
    if (ci.value === undefined || !Number.isFinite(ci.value)) {
      return handleUnavailable(criterion, "INVALID", baseRes, warnings, blocking);
    }
    const bins = criterion.binsBySegment?.[segment] ?? criterion.binsBySegment?.ALL;
    if (!bins) {
      throw new Error(
        `Configuration invalide : ${criterion.code} sans barème pour le segment ${segment}`
      );
    }
    const match = resolveBin(bins, ci.value);
    if (!match) {
      throw new Error(`Barème non exhaustif pour ${criterion.code} (valeur ${ci.value})`);
    }
    return {
      ...baseRes,
      status: ci.status,
      inputValue: ci.value,
      score: match.score,
      binLabel: binLabel(match.bin, criterion.unit),
      reasonCode: reasonCode(criterion, match.score, "BIN"),
      explanationFr: `${criterion.labelFr} = ${ci.value}${criterion.unit ?? ""} → bande ${binLabel(match.bin, criterion.unit)} → score ${match.score}.`,
    };
  }

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
    reasonCode: reasonCode(criterion, ci.score, "ANCHOR"),
    explanationFr: anchor
      ? `Ancrage retenu (${ci.score}) : ${anchor.labelFr}`
      : `Score qualitatif ${ci.score} retenu.`,
  };
}

/**
 * Donnée indisponible (constat C07).
 *
 * Deux issues seulement : blocage, ou catégorie « missing » au score prudent
 * déclaré. Le retrait du dénominateur a disparu — il rendait deux dossiers
 * incomparables et pouvait améliorer un score par l'absence d'une information
 * défavorable.
 */
function handleUnavailable(
  criterion: CriterionConfig,
  status: "MISSING" | "INVALID" | "STALE",
  baseRes: {
    code: string;
    domainCode: string;
    labelFr: string;
    domainContribution: number | null;
    imputed: boolean;
  },
  warnings: string[],
  blocking: string[]
): Omit<CriterionResult, "weightBps" | "effectiveWeightBps"> {
  const statusFr = { MISSING: "manquante", INVALID: "invalide", STALE: "obsolète" }[status];

  if (criterion.unavailablePolicy === "BLOCK") {
    blocking.push(
      `${criterion.code} — ${criterion.labelFr} : donnée critique ${statusFr}. Notation impossible.`
    );
    return {
      ...baseRes,
      status,
      score: null,
      reasonCode: `${criterion.domainCode}.${key(criterion.code)}.BLOCK.CRITICAL_DATA_${status}`,
      explanationFr: `Donnée ${statusFr} sur critère critique : notation impossible.`,
    };
  }

  const score = criterion.unavailableScore ?? 25;
  warnings.push(
    `${criterion.code} — ${criterion.labelFr} : donnée ${statusFr}, catégorie prudente appliquée (score ${score}). Le poids reste compté ; la couverture observée diminue.`
  );
  return {
    ...baseRes,
    status,
    imputed: true,
    score,
    reasonCode: `${criterion.domainCode}.${key(criterion.code)}.IMP.DATA_${status}`,
    explanationFr: `Donnée ${statusFr} : score prudent ${score} imposé par la catégorie « information absente » de la grille. À recalibrer sur données observées.`,
  };
}

function aggregate(domains: DomainResult[]): number | null {
  const total = totalDomainWeight(domains);
  if (total === 0) return null;
  let weighted = 0;
  for (const d of domains) {
    if (d.score !== null && d.weightBps > 0) weighted += d.score * d.weightBps;
  }
  return weighted / total;
}

function totalDomainWeight(domains: DomainResult[]): number {
  return domains.reduce((acc, d) => (d.score !== null ? acc + d.weightBps : acc), 0);
}

/** Évalue le déclencheur d'une exception non compensatoire. */
function evaluateTrigger(trigger: string, f: StructuralFlagsInput): boolean {
  switch (trigger) {
    case "GOING_CONCERN_UNCERTAINTY":
      return f.goingConcernMaterialUncertainty === true;
    case "EBITDA_NEGATIVE_2_OF_3":
      return f.ebitdaNegativeTwoOfThreeYears === true;
    case "BASE_DSCR_BELOW_1":
      return f.baseDscrBelow1 === true;
    case "GROUP_FILE_INCOMPLETE":
      return f.materialGroupFileIncomplete === true;
    default:
      throw new Error(`Déclencheur d'exception inconnu : ${trigger}`);
  }
}

/**
 * Droits d'usage et exposition de la PD (constats C02 et M01).
 *
 * Une PD issue de données simulées ne sort pas d'un environnement bac à sable
 * explicitement déclaré. Le statut CALIBRATED_SYNTHETIC reste visible — le
 * système aval sait donc POURQUOI la valeur est absente, ce qui vaut mieux
 * qu'un champ nul sans explication.
 */
function finalize(
  model: ModelConfig,
  opts: EngineOptions,
  partial: Omit<RatingResult, "usageRights" | "pd12m" | "pdStatus"> & {
    pdStatus: RatingResult["pdStatus"];
    pd12m: number | null;
  }
): RatingResult {
  const cal = model.calibration;
  const observedCalibration = cal?.dataSource === "OBSERVED";
  const published = model.status === "PUBLISHED" || model.status === "VALIDATED";

  let purpose: ResultPurpose;
  let pdDisclosed: boolean;
  if (observedCalibration && published) {
    purpose = "PRODUCTION_RATING";
    pdDisclosed = true;
  } else if (opts.syntheticPdAllowed === true) {
    purpose = "SIMULATION_ONLY";
    pdDisclosed = cal !== undefined;
  } else {
    purpose = "PILOT_SHADOW";
    pdDisclosed = false;
  }

  const pdStatus = cal
    ? cal.dataSource === "SYNTHETIC"
      ? ("CALIBRATED_SYNTHETIC" as const)
      : ("CALIBRATED" as const)
    : model.pdStatus;

  let pd12m: number | null = null;
  if (pdDisclosed && cal) {
    pd12m = pdForGrade(
      cal,
      partial.finalGrade,
      partial.ratingStatus === "DEFAULTED"
    );
  }

  const usageRights: UsageRights = {
    purpose,
    calibrationStatus: pdStatus,
    pdDisclosed: pd12m !== null,
    permittedUsesFr: permittedUses(purpose),
    restrictionsFr: restrictions(purpose, pdStatus, partial.complianceStatus),
  };

  return { ...partial, pdStatus, pd12m, usageRights };
}

function permittedUses(purpose: ResultPurpose): string[] {
  switch (purpose) {
    case "PRODUCTION_RATING":
      return [
        "Notation interne du risque de contrepartie dans le périmètre approuvé.",
        "Alimentation, en tant qu'entrée parmi d'autres, des moteurs décision, IFRS 9 et réglementaire, chacun conservant sa propre règle.",
      ];
    case "SIMULATION_ONLY":
      return [
        "Validation de la chaîne de traitement et des tests, en environnement bac à sable exclusivement.",
      ];
    case "PILOT_SHADOW":
      return [
        "Pilote en mode fantôme : notation produite en parallèle des décisions existantes, sans effet client.",
        "Aide au jugement d'un analyste, avec justification humaine et sans automatisation.",
        "Constitution de l'historique nécessaire à une calibration future.",
      ];
  }
}

function restrictions(
  purpose: ResultPurpose,
  pdStatus: RatingResult["pdStatus"],
  compliance: ComplianceStatus
): string[] {
  const out: string[] = [];
  if (purpose !== "PRODUCTION_RATING") {
    out.push(
      "Aucune décision d'octroi, de limite ou de tarification automatique ne peut s'appuyer sur ce résultat."
    );
    out.push(
      "Usage interdit en staging ou en pertes attendues IFRS 9, en classification réglementaire et en calcul d'exigence en fonds propres."
    );
  }
  if (pdStatus === "CALIBRATED_SYNTHETIC") {
    out.push(
      "La calibration attachée provient de données SIMULÉES : elle valide la chaîne de traitement, jamais le niveau du risque. Aucune probabilité de défaut n'est exposée hors bac à sable."
    );
  }
  if (pdStatus === "UNCALIBRATED") {
    out.push("Aucune calibration attachée : le grade est ordinal, sans probabilité associée.");
  }
  if (compliance === "BLOCKED") {
    out.push(
      "Statut conformité BLOQUÉ : aucune entrée en relation ni opération nouvelle. La notation reste produite pour la surveillance et le provisionnement d'une exposition existante."
    );
  }
  out.push(
    "Les grades de ce modèle ne sont comparables à ceux d'un autre modèle qu'après une étude de correspondance validée."
  );
  return out;
}

function key(criterionCode: string): string {
  return criterionCode.replace(/\./g, "_");
}

function reasonCode(criterion: CriterionConfig, score: number, motif: string): string {
  const sens = score >= 75 ? "POS" : score <= 25 ? "NEG" : "NEU";
  return `${criterion.domainCode}.${key(criterion.code)}.${sens}.${motif}`;
}

/**
 * Confronte les signaux déclarés par l'appelant aux données observées.
 * Une contradiction visible vaut mieux qu'une contradiction silencieuse.
 */
function detectInconsistencies(
  flags: TriggeredRedFlag[],
  domains: DomainResult[]
): string[] {
  const out: string[] = [];
  const scoreOf = (code: string) =>
    domains.flatMap((d) => d.criteria).find((c) => c.code === code)?.score ?? null;
  const codes = new Set(flags.map((f) => f.code));

  const dpd = scoreOf("D3.1") ?? scoreOf("B1.1");
  if (codes.has("RF06") && dpd !== null && dpd >= 75) {
    out.push(
      "RF06 « DPD ≥ seuil de défaut » est déclaré alors que le critère de retard ne relève aucun impayé matériel : vérifier la fraîcheur des données ou la déclaration du signal."
    );
  }
  if (codes.has("RF07") && dpd !== null && dpd === 100) {
    out.push(
      "RF07 « DPD 31–89 jours ou incident récurrent » est déclaré alors que le critère de retard ne relève aucun retard."
    );
  }
  const forbearance = scoreOf("D3.6");
  if (codes.has("RF08") && forbearance !== null && forbearance === 100) {
    out.push(
      "RF08 « échec de restructuration » est déclaré alors que D3.6 indique l'absence de toute restructuration."
    );
  }
  const equity = scoreOf("D1.4");
  if (codes.has("RF09") && equity !== null && equity >= 75) {
    out.push(
      "RF09 « fonds propres négatifs » est déclaré alors que D1.4 mesure des fonds propres tangibles confortables."
    );
  }
  return out;
}

function topFactors(domains: DomainResult[]): { strengths: string[]; weaknesses: string[] } {
  const all = domains.flatMap((d) => d.criteria).filter((c) => c.score !== null);
  const byImpact = (dir: 1 | -1) =>
    [...all].sort((a, b) => {
      const ia = (dir === 1 ? (a.score ?? 0) : 100 - (a.score ?? 0)) * a.effectiveWeightBps;
      const ib = (dir === 1 ? (b.score ?? 0) : 100 - (b.score ?? 0)) * b.effectiveWeightBps;
      return ib - ia;
    });
  const strengths = byImpact(1)
    .filter((c) => (c.score ?? 0) >= 75)
    .slice(0, 5)
    .map((c) => `${c.code} — ${c.labelFr} (score ${c.score})`);
  const weaknesses = byImpact(-1)
    .filter((c) => (c.score ?? 100) <= 25)
    .slice(0, 5)
    .map(
      (c) =>
        `${c.code} — ${c.labelFr} (score ${c.score}${c.imputed ? ", information absente" : ""})`
    );
  return { strengths, weaknesses };
}

function buildExplanation(
  model: ModelConfig,
  rawScore: number,
  engineGrade: string,
  standaloneGrade: string | null,
  finalGrade: string | null,
  segment: Segment,
  confidenceClass: string,
  redFlags: TriggeredRedFlag[],
  support: RatingResult["groupSupport"]
): string {
  const parts: string[] = [`Segment ${segment}.`];
  parts.push(
    `Score brut ${rawScore.toFixed(2)} / 100 → grade ${engineGrade} sur l'échelle ${model.gradeScale.scaleId}` +
      (standaloneGrade !== engineGrade
        ? `, ramené à ${standaloneGrade} par exception non compensatoire.`
        : ` (${gradeLabelFr(model.gradeScale, engineGrade)}).`)
  );
  if (support?.granted) {
    parts.push(
      `Support groupe : ${support.notchesApplied} cran(s) — note autonome ${standaloneGrade} conservée, note soutenue ${finalGrade}.`
    );
  } else if (support && support.claimed) {
    parts.push(`Support groupe revendiqué mais non accordé : ${support.rationaleFr}`);
  }
  parts.push(
    `Classe de confiance ${confidenceClass} — elle décrit la robustesse de l'estimation, elle ne modifie pas le grade.`
  );
  const refer = redFlags.filter((r) => r.level === "REFER" || r.level === "DEFAULT_CHECK");
  if (refer.length > 0) {
    parts.push(
      `Signaux à traiter par les moteurs dédiés : ${refer.map((r) => r.code).join(", ")}.`
    );
  }
  return parts.join(" ");
}
