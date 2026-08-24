/**
 * Ajustement de la calibration : score du moteur → PD à 12 mois par grade.
 *
 * Enchaînement :
 *   1. constitution des échantillons (développement / hors-échantillon / hors-période)
 *   2. régression logistique du défaut sur le score — contrôle de cohérence du
 *      sens du modèle, et non source des PD (voir étape 3)
 *   3. PD par grade : taux observé rétréci vers une tendance lisse sur le rang
 *   4. monotonie imposée par régression isotone (PAVA)
 *   5. marge de prudence, puis plancher réglementaire
 *
 * Deux exclusions structurent l'exercice et doivent être conscientes :
 *
 *  - les contreparties DÉJÀ EN DÉFAUT à la date d'observation sont écartées.
 *    Une PD est une probabilité de PASSER en défaut : la mesurer sur des
 *    dossiers déjà en défaut n'a pas de sens et gonfle artificiellement le
 *    pouvoir discriminant ;
 *  - les dossiers sans grade final (bloqués, ou qualité de données
 *    insuffisante) sont écartés de l'affectation, puisque la calibration
 *    s'applique à un grade. Leur poids est reporté : s'il devenait important,
 *    la calibration porterait sur une population non représentative.
 */
import { createHash } from "node:crypto";

import type { CalibrationConfig, GradePd } from "../core/calibration";
import type { ModelConfig, Segment } from "../core/types";
import { Rng } from "./rng";
import type { SimulatedObligor } from "./simulate";
import {
  auc,
  binomialPValueUpper,
  bootstrapCi,
  brierScore,
  fitLogistic,
  gini,
  herfindahl,
  goodnessOfFitFromGroups,
  hosmerLemeshow,
  ksStatistic,
  pava,
  psi,
} from "./stats";

/** Plancher de PD des expositions entreprises retenu par le dispositif de Bâle. */
export const BASEL_CORPORATE_PD_FLOOR = 0.0003;

export interface Observation {
  score: number;
  grade: string;
  defaulted: 0 | 1;
  segment: Segment;
  cohort: number;
  /**
   * PD vraie du processus générateur. Disponible UNIQUEMENT en simulation, et
   * jamais utilisée pour ajuster quoi que ce soit : elle sert d'étalon pour
   * mesurer l'erreur de la calibration, ce qu'aucun exercice sur données
   * réelles ne permet de faire.
   */
  truePd?: number;
}

export interface Samples {
  development: Observation[];
  holdout: Observation[];
  outOfTime: Observation[];
  /** Diagnostic de la population écartée, pour ne pas la perdre de vue. */
  excluded: {
    alreadyInDefault: number;
    blocked: number;
    noGrade: number;
    total: number;
  };
}

/**
 * Découpe le portefeuille simulé.
 *
 * Le hors-période provient de cohortes ENTIÈRES et postérieures : il porte donc
 * son propre facteur systématique. C'est le seul découpage qui teste ce qui
 * compte vraiment — la tenue de la calibration sur une année différente, pas
 * seulement sur d'autres contreparties de la même année.
 */
export function buildSamples(
  obligors: readonly SimulatedObligor[],
  developmentCohorts: number,
  holdoutShare = 0.3,
  seed = 1
): Samples {
  const rng = new Rng(seed);
  const development: Observation[] = [];
  const holdout: Observation[] = [];
  const outOfTime: Observation[] = [];
  const excluded = { alreadyInDefault: 0, blocked: 0, noGrade: 0, total: obligors.length };

  for (const o of obligors) {
    if (o.alreadyInDefault) {
      excluded.alreadyInDefault += 1;
      continue;
    }
    if (o.rawScore === null) {
      excluded.blocked += 1;
      continue;
    }
    if (o.finalGrade === null) {
      excluded.noGrade += 1;
      continue;
    }
    const obs: Observation = {
      score: o.rawScore,
      grade: o.finalGrade,
      defaulted: o.defaulted,
      segment: o.segment,
      cohort: o.cohort,
      truePd: o.truePd,
    };
    if (o.cohort >= developmentCohorts) outOfTime.push(obs);
    else if (rng.next() < holdoutShare) holdout.push(obs);
    else development.push(obs);
  }

  return { development, holdout, outOfTime, excluded };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface GradeCheck {
  grade: string;
  n: number;
  assignedPd: number;
  observedRate: number;
  observedDefaults: number;
  /** Valeur-p du test binomial unilatéral : la PD sous-estime-t-elle le risque ? */
  pValue: number;
  /** true si le test alerte au seuil de 5 %. */
  underestimates: boolean;
  /** Moyenne des PD vraies du grade — seulement en simulation. */
  truePd: number | null;
}

/** Rupture d'ordre entre deux grades consécutifs sur les taux OBSERVÉS. */
export interface MonotonicityBreach {
  from: string;
  to: string;
  fromRate: number;
  toRate: number;
  fromN: number;
  toN: number;
}

export interface SampleValidation {
  name: string;
  n: number;
  defaults: number;
  observedRate: number;
  predictedRate: number;
  auc: number;
  gini: number;
  ks: number;
  brier: number;
  hosmerLemeshowP: number;
  /**
   * Adéquation groupée PAR GRADE — le test pertinent ici, la PD ne prenant
   * qu'une valeur par grade. Une valeur-p faible signale un désaccord réel
   * entre PD affectées et défauts observés.
   */
  gradeFitP: number;
  /** Même test, sur les PD avant marge de prudence. */
  gradeFitPBeforeMoc: number;
  /**
   * Hosmer-Lemeshow recalculé sur les PD AVANT marge de prudence. La marge
   * biaise volontairement les PD vers le haut : sur un grand échantillon, elle
   * suffit à faire rejeter le test. C'est cette valeur-ci qui renseigne sur la
   * qualité de l'ajustement, l'autre sur l'effet de la marge.
   */
  hosmerLemeshowPBeforeMoc: number;
  grades: GradeCheck[];
  monotonic: boolean;
  breaches: MonotonicityBreach[];
}

export interface ValidationReport {
  development: SampleValidation;
  holdout: SampleValidation;
  outOfTime: SampleValidation;
  giniCi: { point: number; lower: number; upper: number };
  psiHoldout: number;
  psiOutOfTime: number;
  gradeHerfindahl: number;
  excluded: Samples["excluded"];
  perSegmentGini: { segment: Segment; n: number; gini: number }[];
}

const GRADE_ORDER = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10"];

function gradeCounts(obs: readonly Observation[]): number[] {
  return GRADE_ORDER.map((g) => obs.filter((o) => o.grade === g).length);
}

function validateSample(
  name: string,
  obs: readonly Observation[],
  gradePd: Map<string, number>,
  moc: number
): SampleValidation {
  const n = obs.length;
  const defaults = obs.reduce((a, o) => a + o.defaulted, 0);
  const pd = obs.map((o) => gradePd.get(o.grade) ?? NaN);
  const d = obs.map((o) => o.defaulted);
  const scores = obs.map((o) => o.score);

  const grades: GradeCheck[] = [];
  for (const g of GRADE_ORDER) {
    const sub = obs.filter((o) => o.grade === g);
    if (sub.length === 0) continue;
    const assigned = gradePd.get(g);
    if (assigned === undefined) continue;
    const obsDef = sub.reduce((a, o) => a + o.defaulted, 0);
    const p = binomialPValueUpper(obsDef, sub.length, assigned);
    const avecEtalon = sub.filter((o) => typeof o.truePd === "number");
    grades.push({
      grade: g,
      n: sub.length,
      assignedPd: assigned,
      observedRate: obsDef / sub.length,
      observedDefaults: obsDef,
      pValue: p,
      underestimates: p < 0.05,
      truePd:
        avecEtalon.length > 0
          ? avecEtalon.reduce((a, o) => a + (o.truePd as number), 0) / avecEtalon.length
          : null,
    });
  }

  // Une rupture d'ordre est signalée avec ses effectifs : sur un grade peu
  // peuplé, une inversion de quelques dixièmes de point relève du bruit
  // d'échantillonnage, pas d'un défaut de l'échelle.
  const breaches: MonotonicityBreach[] = [];
  for (let i = 1; i < grades.length; i += 1) {
    if (grades[i].observedRate < grades[i - 1].observedRate) {
      breaches.push({
        from: grades[i - 1].grade,
        to: grades[i].grade,
        fromRate: grades[i - 1].observedRate,
        toRate: grades[i].observedRate,
        fromN: grades[i - 1].n,
        toN: grades[i].n,
      });
    }
  }
  const monotonic = breaches.length === 0;

  return {
    name,
    n,
    defaults,
    observedRate: n > 0 ? defaults / n : 0,
    predictedRate: n > 0 ? pd.reduce((a, b) => a + b, 0) / n : 0,
    auc: auc(scores, d),
    gini: gini(scores, d),
    ks: ksStatistic(scores, d),
    brier: brierScore(pd, d),
    gradeFitP: goodnessOfFitFromGroups(
      grades.map((g) => ({ n: g.n, expected: g.n * g.assignedPd, observed: g.observedDefaults }))
    ).pValue,
    gradeFitPBeforeMoc: goodnessOfFitFromGroups(
      grades.map((g) => ({
        n: g.n,
        expected: (g.n * g.assignedPd) / (1 + moc),
        observed: g.observedDefaults,
      }))
    ).pValue,
    hosmerLemeshowP: hosmerLemeshow(pd, d, 10).pValue,
    hosmerLemeshowPBeforeMoc: hosmerLemeshow(
      pd.map((p) => p / (1 + moc)),
      d,
      10
    ).pValue,
    grades,
    monotonic,
    breaches,
  };
}

// ---------------------------------------------------------------------------
// Ajustement
// ---------------------------------------------------------------------------

export interface FitOptions {
  model: ModelConfig;
  samples: Samples;
  /** Marge de prudence relative (0,10 = +10 % sur toutes les PD). */
  marginOfConservatism?: number;
  floor?: number;
  seed: number;
  calibrationId: string;
  dataSource?: "OBSERVED" | "SYNTHETIC";
  bootstrapReplicates?: number;
}

export interface FitResult {
  calibration: CalibrationConfig;
  validation: ValidationReport;
}

export function fitCalibration(opts: FitOptions): FitResult {
  const { model, samples } = opts;
  const moc = opts.marginOfConservatism ?? 0.1;
  const floor = opts.floor ?? BASEL_CORPORATE_PD_FLOOR;
  const dev = samples.development;
  if (dev.length < 1000) {
    throw new Error(
      `Échantillon de développement trop faible (${dev.length}) : une calibration par grade n'y serait pas estimable.`
    );
  }

  // --- 2. Courbe logistique ------------------------------------------------
  // Le score est ramené à [0,1] : l'échelle brute rend la hessienne mal
  // conditionnée et fait diverger Newton sur les queues.
  const x = dev.map((o) => o.score / 100);
  const y = dev.map((o) => o.defaulted);
  const curve = fitLogistic(x, y);
  if (!curve.converged) {
    throw new Error("La régression logistique n'a pas convergé : calibration refusée.");
  }
  if (curve.slope >= 0) {
    throw new Error(
      `Pente logistique positive (${curve.slope.toFixed(4)}) : un score plus élevé impliquerait une PD plus forte. Le modèle ou l'échantillon est incohérent.`
    );
  }

  // --- 3. PD par grade -----------------------------------------------------
  //
  // La PD est calibrée sur le GRADE, non sur le score. Ce choix n'est pas
  // cosmétique : le grade final intègre les caps (qualité de l'information,
  // situations structurelles), qui déplacent une contrepartie vers le bas sans
  // toucher à son score brut. Le score moyen n'est donc PAS monotone dans
  // l'échelle — un grade plafonné rassemble des dossiers bien notés — alors que
  // le risque, lui, l'est. Dériver la PD d'une courbe du score réaffecterait à
  // ces dossiers la PD de leur score et annulerait l'effet du cap.
  //
  // Procédé, classique pour une échelle maîtresse :
  //   a. taux de défaut observé par grade, avec correction de continuité ;
  //   b. tendance lisse : régression linéaire pondérée du logit sur le rang du
  //      grade — une échelle maîtresse a une PD approximativement géométrique ;
  //   c. rétrécissement du taux observé vers cette tendance, d'autant plus fort
  //      que le grade compte peu de DÉFAUTS (et non peu de dossiers : c'est le
  //      nombre de défauts qui porte l'information).
  const perGrade = GRADE_ORDER.map((g) => {
    const sub = dev.filter((o) => o.grade === g);
    return { grade: g, n: sub.length, defaults: sub.reduce((a, o) => a + o.defaulted, 0) };
  }).filter((r) => r.n > 0);

  // a. Correction de continuité : un grade sans défaut observé ne peut pas
  //    porter un logit infini.
  const logit = (p: number) => Math.log(p / (1 - p));
  const invLogit = (z: number) => 1 / (1 + Math.exp(-z));
  const corrected = perGrade.map((r) => (r.defaults + 0.5) / (r.n + 1));

  // b. Tendance lisse sur le rang, pondérée par le nombre de défauts attendus.
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  perGrade.forEach((r, i) => {
    const w = Math.max(r.defaults, 1);
    const xi = i;
    const yi = logit(corrected[i]);
    sw += w; sx += w * xi; sy += w * yi; sxx += w * xi * xi; sxy += w * xi * yi;
  });
  const den = sw * sxx - sx * sx;
  const trendSlope = den !== 0 ? (sw * sxy - sx * sy) / den : 0;
  const trendIntercept = sw !== 0 ? (sy - trendSlope * sx) / sw : 0;

  // c. Rétrécissement vers la tendance. D0 est le nombre de défauts à partir
  //    duquel un grade pèse pour moitié sur sa propre expérience.
  const D0 = 15;
  const raw: { grade: string; pd: number; count: number; observed: number | null }[] = perGrade.map(
    (r, i) => {
      const prior = trendIntercept + trendSlope * i;
      const w = r.defaults / (r.defaults + D0);
      const blended = w * logit(corrected[i]) + (1 - w) * prior;
      return {
        grade: r.grade,
        pd: invLogit(blended),
        count: r.n,
        observed: r.n > 0 ? r.defaults / r.n : null,
      };
    }
  );

  // --- 4. Monotonie --------------------------------------------------------
  // Une PD non monotone dans l'échelle est indéfendable : elle signifierait
  // qu'un meilleur grade porte un risque plus élevé.
  const isotone = pava(
    raw.map((r) => r.pd),
    raw.map((r) => r.count)
  );

  // --- 5. Marge de prudence puis plancher ----------------------------------
  // Ordre volontaire : la marge est multiplicative, elle préserve la monotonie ;
  // le plancher est appliqué en dernier pour être effectivement respecté.
  const gradePd: GradePd[] = raw.map((r, i) => ({
    grade: r.grade,
    pd: Math.max(floor, Math.min(0.9999, isotone[i] * (1 + moc))),
    count: r.count,
    observedRate: r.observed,
  }));

  const lookup = new Map(gradePd.map((g) => [g.grade, g.pd]));

  // --- Tendance centrale ---------------------------------------------------
  // Moyenne sur TOUTES les cohortes disponibles : un taux d'une seule année
  // porte le facteur systématique de cette année, pas la tendance de long terme.
  const toutes = [...samples.development, ...samples.holdout, ...samples.outOfTime];
  const centralTendency = toutes.reduce((a, o) => a + o.defaulted, 0) / Math.max(1, toutes.length);

  // --- Validation ----------------------------------------------------------
  const validation = buildValidation(samples, lookup, opts.seed, opts.bootstrapReplicates ?? 300, moc);

  const calibration: CalibrationConfig = {
    calibrationId: opts.calibrationId,
    contentHash: "",
    modelId: model.modelId,
    modelVersion: model.version,
    dataSource: opts.dataSource ?? "SYNTHETIC",
    createdAt: new Date().toISOString(),
    horizonMonths: 12,
    methodFr:
      "PD à 12 mois calibrée par grade : taux de défaut observé avec correction de continuité, rétréci vers une tendance log-linéaire sur le rang du grade proportionnellement au nombre de défauts, monotonie imposée par régression isotone pondérée, marge de prudence relative puis plancher. La calibration porte sur le grade final et non sur le score brut, afin de conserver l'effet des caps.",
    seed: opts.seed,
    floor,
    marginOfConservatism: moc,
    centralTendency,
    curve: { intercept: curve.intercept, slope: curve.slope },
    gradePd,
    defaultGradePd: 1,
    sampleSize: dev.length,
    limitationsFr:
      "Calibration établie sur des données SIMULÉES. Elle valide la chaîne de traitement et l'ordonnancement de l'échelle, non le niveau des probabilités. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une exigence en fonds propres, ni une décision d'octroi.",
  };

  calibration.contentHash = hashCalibration(calibration);
  return { calibration, validation };
}

/**
 * Empreinte du contenu de la calibration, horodatage et empreinte elle-même
 * exclus. Les clés sont triées : deux sérialisations d'un même contenu donnent
 * la même empreinte.
 */
export function hashCalibration(c: CalibrationConfig): string {
  const { createdAt: _createdAt, contentHash: _hash, ...rest } = c;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function buildValidation(
  samples: Samples,
  lookup: Map<string, number>,
  seed: number,
  replicates: number,
  moc: number
): ValidationReport {
  const dev = samples.development;
  const development = validateSample("développement", dev, lookup, moc);
  const holdout = validateSample("hors-échantillon", samples.holdout, lookup, moc);
  const outOfTime = validateSample("hors-période", samples.outOfTime, lookup, moc);

  // Intervalle de confiance du Gini par bootstrap, générateur injecté pour
  // rester reproductible d'une exécution à l'autre.
  const scores = dev.map((o) => o.score);
  const defs = dev.map((o) => o.defaulted);
  const giniCi = bootstrapCi(
    development.gini,
    (r) => {
      const rng = new Rng(seed * 7919 + r);
      const s: number[] = [];
      const d: (0 | 1)[] = [];
      for (let i = 0; i < scores.length; i += 1) {
        const j = rng.int(scores.length);
        s.push(scores[j]);
        d.push(defs[j]);
      }
      const nb = d.reduce((a: number, b) => a + b, 0);
      if (nb === 0 || nb === d.length) return NaN;
      return gini(s, d);
    },
    replicates
  );

  const perSegmentGini = (["TPE", "PME", "GE"] as Segment[])
    .map((segment) => {
      const sub = dev.filter((o) => o.segment === segment);
      const nb = sub.reduce((a, o) => a + o.defaulted, 0);
      if (sub.length < 200 || nb === 0 || nb === sub.length) {
        return { segment, n: sub.length, gini: NaN };
      }
      return {
        segment,
        n: sub.length,
        gini: gini(
          sub.map((o) => o.score),
          sub.map((o) => o.defaulted)
        ),
      };
    })
    .filter((x) => Number.isFinite(x.gini));

  return {
    development,
    holdout,
    outOfTime,
    giniCi: { point: giniCi.point, lower: giniCi.lower, upper: giniCi.upper },
    psiHoldout: psi(gradeCounts(dev), gradeCounts(samples.holdout)),
    psiOutOfTime: psi(gradeCounts(dev), gradeCounts(samples.outOfTime)),
    gradeHerfindahl: herfindahl(gradeCounts(dev)),
    excluded: samples.excluded,
    perSegmentGini,
  };
}
