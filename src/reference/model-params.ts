import type { Bin, CriterionConfig, CriterionScore, ModelConfig, Segment } from "@/core/types";

/**
 * Paramétrage des grilles à l'écran, par versions datées (décision D-54).
 *
 * Même gouvernance que l'échelle maîtresse : une version de paramètres porte
 * une date d'effet ; la version en vigueur à la date de calcul s'applique à
 * toute notation et son identifiant est consigné dans la version du modèle
 * (`3.2.0+CORP_STD_V1-P2026.1`) ; une version en vigueur est figée. La grille
 * embarquée reste la référence : une version de paramètres en est une
 * surcharge complète et contrôlée (mêmes contrôles qu'au démarrage), jamais
 * une modification du code.
 *
 * Ce qui se paramètre : libellé, poids par segment, caractère critique, score
 * d'une donnée absente, seuils des barèmes à cinq paliers, libellés des cinq
 * repères qualitatifs, retrait et ajout de critères ; grade plafond et seuil
 * de déclenchement des exceptions ; seuils des revues obligatoires ;
 * couverture ; confiance ; support groupe. Ce qui ne se paramètre pas :
 * l'ordre de calcul du moteur, les cas particuliers et les règles de
 * transfert, qui relèvent d'une nouvelle version de la grille.
 */

export type Thresholds = [number, number, number, number];

export interface CriterionParams {
  labelFr: string;
  weightsBps: Partial<Record<Segment, number>>;
  /** Donnée critique : son absence empêche la notation. */
  critical: boolean;
  /** Score retenu quand la donnée est absente (critère non critique). */
  unavailableScore: CriterionScore;
  /** Seuils [100, 75, 50, 25] par segment, barèmes à cinq paliers seulement. */
  thresholds?: Partial<Record<Segment | "ALL", Thresholds>>;
  /** Libellés des repères 100, 75, 50, 25, 0 (critère qualitatif). */
  anchors?: [string, string, string, string, string];
}

export interface NewCriterionParams extends CriterionParams {
  code: string;
  domainCode: string;
  type: "QUANTITATIVE" | "QUALITATIVE";
  direction?: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
  unit?: string;
}

export interface ModelParams {
  /** Valeurs de chaque critère conservé (code → paramètres). */
  criteria: Record<string, CriterionParams>;
  /** Critères retirés de la grille. */
  removed: string[];
  /** Critères ajoutés. */
  added: NewCriterionParams[];
  /** Exceptions non compensatoires : grade plafond et seuil de déclenchement. */
  rules: Record<string, { maxGrade: string; threshold?: number }>;
  /** Revues obligatoires : seuil par critère. */
  reviews: Record<string, number>;
  coverage: { minGlobalObservedBps: number; minDomainObservedBps: number };
  confidence: {
    weights: { completeness: number; freshness: number; reliability: number; provenance: number };
    classes: { A: number; B: number; C: number };
  };
  groupSupportMaxNotches: number;
}

export interface ModelParamVersion {
  /** Identifiant, consigné dans la version du modèle (ex. « CORP_STD_V1-P2026.1 »). */
  version: string;
  modelId: string;
  /** Version de la grille embarquée sur laquelle les paramètres ont été établis. */
  baseVersion: string;
  effectiveFrom: string;
  labelFr: string;
  noteFr?: string;
  createdBy?: string;
  createdAt?: string;
  params: ModelParams;
}

const SCORES: CriterionScore[] = [100, 75, 50, 25, 0];

/** Seuils d'un barème à cinq paliers (100 → 0), ou null s'il n'a pas cette forme. */
export function thresholdsOf(bins: Bin[] | undefined): { direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER"; t: Thresholds } | null {
  if (!bins || bins.length !== 5 || bins.some((b, i) => b.score !== SCORES[i])) return null;
  if (bins[0].max === null && bins[4].min === null) {
    const t = [bins[0].min, bins[1].min, bins[2].min, bins[3].min];
    return t.every((x) => typeof x === "number") ? { direction: "HIGHER_IS_BETTER", t: t as Thresholds } : null;
  }
  if (bins[0].min === null && bins[4].max === null) {
    const t = [bins[0].max, bins[1].max, bins[2].max, bins[3].max];
    return t.every((x) => typeof x === "number") ? { direction: "LOWER_IS_BETTER", t: t as Thresholds } : null;
  }
  return null;
}

/** Barème à cinq paliers à partir de quatre seuils (mêmes conventions que les grilles embarquées). */
export function binsFrom(direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER", [t100, t75, t50, t25]: Thresholds): Bin[] {
  if (direction === "HIGHER_IS_BETTER") {
    return [
      { min: t100, max: null, minInclusive: true, maxInclusive: true, score: 100 },
      { min: t75, max: t100, minInclusive: true, maxInclusive: false, score: 75 },
      { min: t50, max: t75, minInclusive: true, maxInclusive: false, score: 50 },
      { min: t25, max: t50, minInclusive: true, maxInclusive: false, score: 25 },
      { min: null, max: t25, minInclusive: true, maxInclusive: false, score: 0 },
    ];
  }
  return [
    { min: null, max: t100, minInclusive: true, maxInclusive: true, score: 100 },
    { min: t100, max: t75, minInclusive: false, maxInclusive: true, score: 75 },
    { min: t75, max: t50, minInclusive: false, maxInclusive: true, score: 50 },
    { min: t50, max: t25, minInclusive: false, maxInclusive: true, score: 25 },
    { min: t25, max: null, minInclusive: false, maxInclusive: true, score: 0 },
  ];
}

function directionOf(c: CriterionConfig): "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | null {
  for (const bins of Object.values(c.binsBySegment ?? {})) {
    const t = thresholdsOf(bins);
    if (t) return t.direction;
  }
  return c.direction ?? null;
}

/** Paramètres courants d'une grille (point de départ d'une nouvelle version). */
export function paramsOf(model: ModelConfig): ModelParams {
  const criteria: Record<string, CriterionParams> = {};
  for (const c of model.criteria) {
    const thresholds: Partial<Record<Segment | "ALL", Thresholds>> = {};
    for (const [seg, bins] of Object.entries(c.binsBySegment ?? {})) {
      const t = thresholdsOf(bins);
      if (t) thresholds[seg as Segment | "ALL"] = t.t;
    }
    criteria[c.code] = {
      labelFr: c.labelFr,
      weightsBps: { ...c.weightsBps },
      critical: c.unavailablePolicy === "BLOCK",
      unavailableScore: c.unavailableScore ?? 0,
      ...(Object.keys(thresholds).length ? { thresholds } : {}),
      ...(c.anchors?.length === 5 ? { anchors: c.anchors.map((a) => a.labelFr) as CriterionParams["anchors"] } : {}),
    };
  }
  const cls = Object.fromEntries(model.confidence.classes.map((k) => [k.code, k.minScore ?? 0])) as Record<string, number>;
  return {
    criteria,
    removed: [],
    added: [],
    rules: Object.fromEntries(
      model.nonCompensatoryRules.map((r) => [r.code, { maxGrade: r.maxGrade, ...(r.derivation ? { threshold: r.derivation.threshold } : {}) }])
    ),
    reviews: Object.fromEntries((model.mandatoryReviews ?? []).map((r) => [r.criterion, r.threshold])),
    coverage: { ...model.coverage },
    confidence: { weights: { ...model.confidence.weights }, classes: { A: cls.A ?? 85, B: cls.B ?? 70, C: cls.C ?? 55 } },
    groupSupportMaxNotches: model.groupSupport.maxNotches,
  };
}

function applyCriterion(c: CriterionConfig, p: CriterionParams): CriterionConfig {
  const next: CriterionConfig = {
    ...c,
    labelFr: p.labelFr.trim() || c.labelFr,
    weightsBps: { ...p.weightsBps },
    unavailablePolicy: p.critical ? "BLOCK" : "CONSERVATIVE_SCORE",
    unavailableScore: p.critical ? c.unavailableScore : p.unavailableScore,
  };
  if (p.thresholds && c.binsBySegment) {
    const dir = directionOf(c);
    const bins = { ...c.binsBySegment };
    for (const [seg, t] of Object.entries(p.thresholds)) {
      if (dir && t && thresholdsOf(c.binsBySegment[seg as Segment | "ALL"])) bins[seg as Segment | "ALL"] = binsFrom(dir, t);
    }
    next.binsBySegment = bins;
  }
  if (p.anchors && c.anchors?.length === 5) {
    next.anchors = c.anchors.map((a, i) => ({ ...a, labelFr: p.anchors![i].trim() || a.labelFr }));
  }
  return next;
}

function newCriterion(p: NewCriterionParams): CriterionConfig {
  const base: CriterionConfig = {
    code: p.code.trim(),
    domainCode: p.domainCode,
    labelFr: p.labelFr.trim(),
    type: p.type,
    weightsBps: { ...p.weightsBps },
    unavailablePolicy: p.critical ? "BLOCK" : "CONSERVATIVE_SCORE",
    unavailableScore: p.critical ? 0 : p.unavailableScore,
  };
  if (p.type === "QUANTITATIVE") {
    const dir = p.direction ?? "HIGHER_IS_BETTER";
    base.direction = dir;
    base.unit = p.unit;
    base.binsBySegment = Object.fromEntries(
      Object.entries(p.thresholds ?? {}).filter(([, t]) => t).map(([seg, t]) => [seg, binsFrom(dir, t as Thresholds)])
    );
  } else {
    base.anchors = (p.anchors ?? ["", "", "", "", ""]).map((labelFr, i) => ({ score: SCORES[i], labelFr }));
  }
  return base;
}

/**
 * Grille appliquée avec une version de paramètres. La calibration attachée,
 * établie sur la grille embarquée, est retirée (aucune PD) ; la version du
 * modèle porte l'identifiant des paramètres. Le résultat doit encore passer
 * `validateModel` (poids à 100 %, barèmes exhaustifs, plafonds connus…).
 */
export function applyModelParams(model: ModelConfig, v: ModelParamVersion): ModelConfig {
  const p = v.params;
  const removed = new Set(p.removed);
  const criteria = model.criteria
    .filter((c) => !removed.has(c.code))
    .map((c) => (p.criteria[c.code] ? applyCriterion(c, p.criteria[c.code]) : c))
    .concat(p.added.map(newCriterion));
  const classes = model.confidence.classes.map((k) =>
    k.code === "A" || k.code === "B" || k.code === "C" ? { ...k, minScore: p.confidence.classes[k.code] } : k
  );
  // Bornes hautes des classes de confiance recalculées à partir des nouvelles bornes basses.
  const ordered = classes.map((k, i) => ({ ...k, maxScore: i === 0 ? k.maxScore : classes[i - 1].minScore }));
  return {
    ...model,
    version: `${model.version}+${v.version}`,
    criteria,
    nonCompensatoryRules: model.nonCompensatoryRules.map((r) => {
      const o = p.rules[r.code];
      if (!o) return r;
      return {
        ...r,
        maxGrade: o.maxGrade,
        ...(r.derivation && typeof o.threshold === "number" ? { derivation: { ...r.derivation, threshold: o.threshold } } : {}),
      };
    }),
    mandatoryReviews: (model.mandatoryReviews ?? [])
      .filter((r) => !removed.has(r.criterion))
      .map((r) => (typeof p.reviews[r.criterion] === "number" ? { ...r, threshold: p.reviews[r.criterion] } : r)),
    coverage: { ...p.coverage },
    confidence: { ...model.confidence, weights: { ...p.confidence.weights }, classes: ordered },
    groupSupport: { ...model.groupSupport, maxNotches: p.groupSupportMaxNotches },
    calibration: undefined,
    pdStatus: model.calibration ? "UNCALIBRATED" : model.pdStatus,
  };
}

const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,47}$/;
const CODE_RE = /^[A-Z][A-Z0-9]{0,3}\.[0-9]{1,2}$/;

/** Contrôles propres au paramétrage, avant les contrôles de démarrage du modèle. */
export function checkParams(model: ModelConfig, v: ModelParamVersion): string[] {
  const issues: string[] = [];
  const p = v.params;
  if (!VERSION_RE.test(v.version ?? "")) issues.push("Identifiant de version invalide (2 à 48 caractères : lettres, chiffres, . _ -).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom ?? "")) issues.push("Date d'effet invalide (AAAA-MM-JJ).");
  if (!v.labelFr?.trim()) issues.push("Libellé de la version obligatoire.");
  const codes = new Set(model.criteria.map((c) => c.code));
  for (const code of p.removed) {
    if (!codes.has(code)) issues.push(`Critère retiré inconnu : ${code}.`);
    for (const r of model.nonCompensatoryRules) {
      if (r.derivation?.criterion === code || r.centralCriterion === code) issues.push(`${code} ne peut pas être retiré : l'exception ${r.code} s'y rattache.`);
    }
    for (const c of model.criteria) {
      if (c.notApplicableRule?.transferWeightTo === code && !p.removed.includes(c.code)) issues.push(`${code} ne peut pas être retiré : ${c.code} lui transfère son poids.`);
    }
  }
  const domains = new Set(model.domains.map((d) => d.code));
  for (const a of p.added) {
    if (!CODE_RE.test(a.code ?? "")) issues.push(`Nouveau critère : code « ${a.code} » invalide (ex. D4.9).`);
    if (codes.has(a.code) && !p.removed.includes(a.code)) issues.push(`Nouveau critère : le code ${a.code} existe déjà.`);
    if (!domains.has(a.domainCode)) issues.push(`Nouveau critère ${a.code} : domaine inconnu.`);
    if (!a.labelFr?.trim()) issues.push(`Nouveau critère ${a.code} : libellé obligatoire.`);
    if (a.type === "QUALITATIVE" && (a.anchors ?? []).filter((x) => x?.trim()).length < 5) issues.push(`Nouveau critère ${a.code} : les cinq repères sont obligatoires.`);
    if (a.type === "QUANTITATIVE" && !Object.values(a.thresholds ?? {}).some(Boolean)) issues.push(`Nouveau critère ${a.code} : seuils du barème obligatoires.`);
  }
  for (const [code, c] of Object.entries(p.criteria)) {
    for (const [seg, t] of Object.entries(c.thresholds ?? {})) {
      if (!t || t.some((x) => typeof x !== "number" || !Number.isFinite(x))) issues.push(`${code} (${seg}) : seuils numériques attendus.`);
    }
    for (const w of Object.values(c.weightsBps)) if (w !== undefined && (!Number.isInteger(w) || w < 0)) issues.push(`${code} : poids invalide.`);
  }
  const w = p.confidence.weights;
  if (w.completeness + w.freshness + w.reliability + w.provenance !== 100) issues.push("Confiance : la somme des pondérations doit faire 100.");
  const k = p.confidence.classes;
  if (!(k.A > k.B && k.B > k.C && k.C > 0 && k.A <= 100)) issues.push("Confiance : seuils A > B > C > 0 attendus.");
  if (p.coverage.minDomainObservedBps > p.coverage.minGlobalObservedBps) issues.push("Couverture : le seuil par domaine ne peut pas dépasser le seuil global.");
  if (!(Number.isInteger(p.groupSupportMaxNotches) && p.groupSupportMaxNotches >= 0 && p.groupSupportMaxNotches <= 3)) issues.push("Support groupe : de 0 à 3 crans.");
  return issues;
}
