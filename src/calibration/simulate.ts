/**
 * Simulation d'un portefeuille de contreparties entreprises.
 *
 * PRINCIPE DIRECTEUR — les scores ne sont jamais simulés directement. Le
 * simulateur produit des DONNÉES D'ENTRÉE (ratios, ancrages qualitatifs, flags
 * structurels, red flags, qualité de l'information), et c'est le moteur réel
 * `computeRating` qui en tire un score et un grade. Un raccourci « score
 * simulé → PD » rendrait la calibration circulaire : elle vérifierait
 * l'hypothèse posée, pas le modèle.
 *
 * Processus générateur :
 *
 *   Q_i ~ N(0,1)           qualité de crédit latente de la contrepartie
 *   B_i ~ N(0,1)           biais de mesure propre au dossier (qualité comptable,
 *                          optimisme de l'analyste) — corrèle les critères entre
 *                          eux SANS informer sur le défaut, donc borne le pouvoir
 *                          discriminant atteignable, comme dans la réalité
 *   signal_ij = a·Q_i + b·B_i + sqrt(1−a²−b²)·e_ij
 *
 * Le signal, ramené par la fonction de répartition normale à un percentile de
 * qualité, sélectionne la bande de barème (critère quantitatif) ou l'ancrage
 * (critère qualitatif). La valeur restituée est ensuite tirée À L'INTÉRIEUR de
 * la bande retenue.
 *
 *   PD vraie :  p_i = Φ(m_s − k_s·Q_i),  m_s = Φ⁻¹(p̄_s)·sqrt(1+k_s²)
 *               ce qui donne exactement E[p_i] = p̄_s, la tendance centrale visée
 *   Défaut  :   sqrt(ρ)·F_t + sqrt(1−ρ)·ε_i < Φ⁻¹(p_i)      (Vasicek / ASRF)
 *
 * F_t est le facteur systématique de la cohorte : il crée la corrélation des
 * défauts et fait varier le taux d'une année sur l'autre, ce qui est
 * indispensable pour distinguer une tendance centrale de long terme d'un taux
 * ponctuel.
 *
 * Le défaut ne dépend du score QUE par l'intermédiaire de Q : conditionnellement
 * à Q, score et défaut sont indépendants. C'est la structure correcte — le score
 * n'est informatif que parce qu'il mesure Q, imparfaitement.
 */
import { computeRating } from "../core/engine";
import type {
  Bin,
  CriterionConfig,
  CriterionScore,
  ModelConfig,
  RatingInput,
  Segment,
  StructuralFlagsInput,
} from "../core/types";
import { Rng } from "./rng";
import { normalCdf, normalInv } from "./stats";

// ---------------------------------------------------------------------------
// Hypothèses du processus générateur — toutes explicites et discutables
// ---------------------------------------------------------------------------

export interface SimulationAssumptions {
  /** Répartition du portefeuille par segment. */
  segmentMix: Record<Segment, number>;
  /** Tendance centrale de long terme du taux de défaut à 12 mois, par segment. */
  centralDefaultRate: Record<Segment, number>;
  /** Dispersion de la PD vraie autour de la tendance centrale (k_s). */
  pdDispersion: Record<Segment, number>;
  /** Corrélation d'actifs de Vasicek : intensité du cycle commun. */
  assetCorrelation: number;
  /** Part du signal d'un critère portée par la qualité latente (a). */
  signalOnQuality: number;
  /** Part portée par le biais de dossier (b) — non informative sur le défaut. */
  signalOnFileBias: number;
  /** Répartition cible des cinq niveaux de score élémentaire {0,25,50,75,100}. */
  scoreLevelMix: number[];
  /** Probabilité qu'un critère non critique soit non renseigné, par segment. */
  missingRate: Record<Segment, number>;
  /** Probabilité qu'une contrepartie soit déjà en défaut à l'observation. */
  alreadyDefaulted: Record<Segment, number>;
  /**
   * Répartition des niveaux {25, 50, 75, 100} des dimensions de qualité de
   * l'information (fraîcheur, provenance, fiabilité), par segment. La
   * complétude, elle, n'est pas tirée : elle est DÉDUITE de la part de critères
   * effectivement renseignés, sans quoi le dossier serait incohérent avec
   * lui-même.
   */
  informationQuality: Record<Segment, number[]>;
}

export const DEFAULT_ASSUMPTIONS: SimulationAssumptions = {
  // Portefeuille bancaire marocain typique : le nombre est chez les TPE,
  // l'encours chez les PME et GE.
  segmentMix: { TPE: 0.55, PME: 0.35, GE: 0.1 },
  // Ordres de grandeur plausibles pour un portefeuille entreprises marocain.
  // À REMPLACER par les taux observés de la banque avant tout usage réel.
  centralDefaultRate: { TPE: 0.06, PME: 0.035, GE: 0.012 },
  pdDispersion: { TPE: 0.95, PME: 0.9, GE: 0.85 },
  // 0,12 : ordre de grandeur des corrélations d'actifs retenues par Bâle pour
  // les entreprises (fourchette 0,12–0,24, décroissante avec la PD).
  assetCorrelation: 0.12,
  signalOnQuality: 0.5,
  signalOnFileBias: 0.42,
  // Une banque ne prête pas à la population des entreprises : elle prête à
  // celles qui ont passé son filtre d'octroi. La répartition des scores
  // élémentaires est donc décalée vers le haut par rapport à l'économie réelle.
  // Moyenne visée ≈ 69/100, ce qui centre le portefeuille sur G5-G6.
  scoreLevelMix: [0.02, 0.08, 0.25, 0.4, 0.25],
  missingRate: { TPE: 0.07, PME: 0.04, GE: 0.02 },
  alreadyDefaulted: { TPE: 0.02, PME: 0.012, GE: 0.004 },
  // Une GE produit des comptes audités et récents ; une TPE, une information
  // tardive et peu vérifiable. C'est ce qui fait que le modèle plafonne
  // structurellement les grades du bas de segment.
  informationQuality: {
    TPE: [0.04, 0.26, 0.48, 0.22],
    PME: [0.01, 0.12, 0.47, 0.4],
    GE: [0.0, 0.05, 0.35, 0.6],
  },
};

const SCORE_LEVELS: CriterionScore[] = [0, 25, 50, 75, 100];

// ---------------------------------------------------------------------------
// Observation produite
// ---------------------------------------------------------------------------

export interface SimulatedObligor {
  id: string;
  cohort: number;
  segment: Segment;
  /** Qualité latente — connue du simulateur seul, jamais du modèle. */
  latentQuality: number;
  /** PD vraie du processus générateur — sert d'étalon, jamais d'entrée. */
  truePd: number;
  /** Défaut observé sur les 12 mois suivants. */
  defaulted: 0 | 1;
  /** Déjà en défaut à la date d'observation : exclu de la calibration. */
  alreadyInDefault: boolean;
  input: RatingInput;
  outcome: string;
  rawScore: number | null;
  finalGrade: string | null;
  confidenceScore: number;
}

export interface SimulationResult {
  obligors: SimulatedObligor[];
  systematicFactors: number[];
  assumptions: SimulationAssumptions;
  seed: number;
}

// ---------------------------------------------------------------------------
// Tirage d'une valeur à l'intérieur d'une bande de barème
// ---------------------------------------------------------------------------

/**
 * Largeur de repli pour une bande semi-infinie : on prend la médiane des
 * largeurs finies du barème, de sorte que la valeur tirée reste dans un ordre
 * de grandeur crédible pour le ratio concerné.
 */
function fallbackWidth(bins: readonly Bin[]): number {
  const widths = bins
    .filter((b) => b.min !== null && b.max !== null)
    .map((b) => (b.max as number) - (b.min as number))
    .sort((a, b) => a - b);
  if (widths.length === 0) return 1;
  return widths[Math.floor(widths.length / 2)] || 1;
}

function sampleInBin(bin: Bin, bins: readonly Bin[], rng: Rng): number {
  const w = fallbackWidth(bins);
  const lo = bin.min ?? (bin.max !== null ? bin.max - w : -w);
  const hi = bin.max ?? (bin.min !== null ? bin.min + w : w);
  // Marge de sécurité : on ne tire jamais exactement sur une borne, pour ne pas
  // dépendre de la convention d'inclusion.
  const eps = Math.max(Math.abs(hi - lo) * 1e-3, 1e-6);
  const v = rng.uniform(lo + eps, hi - eps);
  // Arrondi au centième : les ratios saisis par un analyste ne portent pas
  // quinze décimales, et cela crée des ex æquo réalistes.
  return Math.round(v * 100) / 100;
}

/** Bandes applicables à un critère quantitatif pour un segment donné. */
function binsFor(criterion: CriterionConfig, segment: Segment): readonly Bin[] {
  const bins = criterion.binsBySegment?.[segment] ?? criterion.binsBySegment?.ALL;
  if (!bins) throw new Error(`${criterion.code} : aucun barème pour le segment ${segment}`);
  return bins;
}

/** Niveau de score sélectionné par un percentile de qualité. */
function levelFromQuantile(u: number, mix: readonly number[]): CriterionScore {
  let cum = 0;
  for (let i = 0; i < mix.length; i += 1) {
    cum += mix[i];
    if (u < cum) return SCORE_LEVELS[i];
  }
  return SCORE_LEVELS[SCORE_LEVELS.length - 1];
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export interface SimulationOptions {
  model: ModelConfig;
  seed: number;
  cohorts: number;
  obligorsPerCohort: number;
  assumptions?: SimulationAssumptions;
  /** Date d'arrêté de la première cohorte (les suivantes avancent d'un an). */
  firstAsOfYear?: number;
}

export function simulatePortfolio(opts: SimulationOptions): SimulationResult {
  const a = opts.assumptions ?? DEFAULT_ASSUMPTIONS;
  const rng = new Rng(opts.seed);
  const model = opts.model;
  const firstYear = opts.firstAsOfYear ?? 2021;

  const varianceLeft = 1 - a.signalOnQuality ** 2 - a.signalOnFileBias ** 2;
  if (varianceLeft <= 0) {
    throw new Error(
      "signalOnQuality² + signalOnFileBias² doit rester < 1 : sinon le signal d'un critère n'a plus de part idiosyncratique."
    );
  }
  const idioWeight = Math.sqrt(varianceLeft);

  const segments = Object.keys(a.segmentMix) as Segment[];
  const segWeights = segments.map((s) => a.segmentMix[s]);

  const obligors: SimulatedObligor[] = [];
  const systematicFactors: number[] = [];

  for (let cohort = 0; cohort < opts.cohorts; cohort += 1) {
    // Un facteur systématique par cohorte : le cycle est commun à tous les
    // débiteurs de l'année, ce qui fait varier le taux de défaut réalisé.
    const F = rng.normal();
    systematicFactors.push(F);
    const asOfDate = `${firstYear + cohort}-12-31`;

    for (let k = 0; k < opts.obligorsPerCohort; k += 1) {
      const segment = rng.pick(segments, segWeights);
      const Q = rng.normal();
      const B = rng.normal();

      // --- PD vraie et réalisation du défaut ------------------------------
      const kS = a.pdDispersion[segment];
      // m choisi pour que E[Φ(m − k·Q)] = tendance centrale visée, exactement.
      const m = normalInv(a.centralDefaultRate[segment]) * Math.sqrt(1 + kS * kS);
      const truePd = normalCdf(m - kS * Q);
      const rho = a.assetCorrelation;
      const assetReturn = Math.sqrt(rho) * F + Math.sqrt(1 - rho) * rng.normal();
      const defaulted: 0 | 1 = assetReturn < normalInv(Math.min(Math.max(truePd, 1e-12), 1 - 1e-12)) ? 1 : 0;

      // Contrepartie déjà en défaut à l'observation : plus probable si Q est bas.
      // Plafonnée : sans borne, exp(−0,8·Q) dépasse 1 dans la queue basse.
      const alreadyInDefault = rng.bernoulli(
        Math.min(0.6, a.alreadyDefaulted[segment] * Math.exp(-0.8 * Q))
      );

      // --- Données d'entrée -----------------------------------------------
      const input = buildInput(model, segment, Q, B, a, idioWeight, rng, asOfDate, alreadyInDefault);

      const result = computeRating(model, input, `${asOfDate}T12:00:00.000Z`);

      obligors.push({
        id: `SIM-${cohort}-${k}`,
        cohort,
        segment,
        latentQuality: Q,
        truePd,
        defaulted,
        alreadyInDefault,
        input,
        outcome: result.outcome,
        rawScore: result.rawScore,
        finalGrade: result.finalGrade,
        confidenceScore: result.confidenceScore,
      });
    }
  }

  return { obligors, systematicFactors, assumptions: a, seed: opts.seed };
}

// ---------------------------------------------------------------------------
// Construction d'un dossier
// ---------------------------------------------------------------------------

function buildInput(
  model: ModelConfig,
  segment: Segment,
  Q: number,
  B: number,
  a: SimulationAssumptions,
  idioWeight: number,
  rng: Rng,
  asOfDate: string,
  alreadyInDefault: boolean
): RatingInput {
  const criteria: RatingInput["criteria"] = {};
  // Niveaux retenus, conservés pour dériver des signaux COHÉRENTS avec les
  // données : un red flag doit découler du dossier, pas d'un tirage parallèle.
  const levels: Record<string, CriterionScore> = {};

  for (const c of model.criteria) {
    const signal = a.signalOnQuality * Q + a.signalOnFileBias * B + idioWeight * rng.normal();
    const u = normalCdf(signal);
    const level = levelFromQuantile(u, a.scoreLevelMix);
    levels[c.code] = level;

    const critique = c.critical === true || c.missingPolicy === "BLOCK";
    // Une donnée critique manquante bloque le scoring : c'est le comportement
    // recherché du moteur, mais un portefeuille de calibration majoritairement
    // bloqué n'apprendrait rien. On ne l'omet donc que rarement.
    const pManquant = critique ? a.missingRate[segment] * 0.15 : a.missingRate[segment];
    if (rng.bernoulli(pManquant)) {
      criteria[c.code] = { status: "MISSING" };
      continue;
    }

    if (c.type === "QUANTITATIVE") {
      const bins = binsFor(c, segment);
      const candidates = bins.filter((b) => b.score === level);
      const bin = candidates.length > 0 ? candidates[rng.int(candidates.length)] : bins[rng.int(bins.length)];
      criteria[c.code] = { status: "AVAILABLE", value: sampleInBin(bin, bins, rng) };
    } else {
      criteria[c.code] = { status: "AVAILABLE", score: level };
    }
  }

  // --- Cas spéciaux : uniquement ceux que le modèle déclare -----------------
  // Ils traduisent une situation économique extrême : on ne les déclenche donc
  // que dans le bas de la distribution de qualité.
  const flags: StructuralFlagsInput = {};
  const fpTangibles = model.criteria.find((c) => c.code === "D1.4");
  if (fpTangibles?.specialCases?.some((s) => s.code === "NEGATIVE_TANGIBLE_EQUITY")) {
    if (Q < -1.2 && rng.bernoulli(0.35)) {
      criteria["D1.4"] = { status: "AVAILABLE", specialCase: "NEGATIVE_TANGIBLE_EQUITY" };
      levels["D1.4"] = 0;
      // Le flag structurel accompagne le cas spécial : sans cela on fabriquerait
      // une incohérence que le moteur signalerait à juste titre.
      flags.negativeTangibleEquity = true;
    }
  }
  const levier = model.criteria.find((c) => c.code === "D1.5");
  if (levier?.specialCases?.some((s) => s.code === "EBITDA_LTE_0")) {
    if (Q < -1.4 && rng.bernoulli(0.3)) {
      criteria["D1.5"] = { status: "AVAILABLE", specialCase: "EBITDA_LTE_0" };
      levels["D1.5"] = 0;
      flags.ebitdaNegativeTwoOfThreeYears = true;
    }
  }

  // --- Flags structurels ----------------------------------------------------
  // L'âge est indépendant de la qualité : une entreprise jeune n'est pas
  // mauvaise, elle est mal observée — c'est précisément ce que CAP01 traduit.
  // Loi log-normale d'ancienneté : médiane ≈ 8 ans, environ 3 % sous 2 ans, ce
  // qui correspond à un encours bancaire établi et non à la démographie des
  // créations d'entreprises.
  flags.companyAgeYears = Math.round(Math.exp(2.1 + 0.75 * rng.normal()) * 10) / 10;
  if ((flags.companyAgeYears ?? 99) < 2) flags.hasStrongGroupSupport = rng.bernoulli(0.25);

  // Les caps liés au service de la dette découlent du critère mesuré, pas d'un
  // tirage indépendant : cohérence entre le flag et la donnée.
  if (levels["D2.2"] === 0) flags.baseDscrBelow1 = true;
  else if (levels["D2.5"] === 0) flags.stressDscrBelow1 = true;
  if (levels["D3.6"] === 0) flags.activeRestructuringForbearance = true;
  if (levels["D4.3"] === 0 && rng.bernoulli(0.4)) flags.singleClientDependencyUnmitigated = true;
  if (Q < -1.8 && rng.bernoulli(0.15)) flags.goingConcernMaterialUncertainty = true;

  // --- Red flags dérivés du dossier ----------------------------------------
  const redFlags: string[] = [];
  if (levels["D3.1"] === 0 && rng.bernoulli(0.55)) redFlags.push("RF06");
  else if (levels["D3.1"] === 25 && rng.bernoulli(0.5)) redFlags.push("RF07");
  if (levels["D3.6"] === 0 && rng.bernoulli(0.35)) redFlags.push("RF08");
  if (flags.negativeTangibleEquity && rng.bernoulli(0.5)) redFlags.push("RF09");
  // Signaux de conformité : rares et sans lien avec la qualité financière.
  if (rng.bernoulli(0.0015)) redFlags.push("RF01");

  // --- Qualité de l'information --------------------------------------------
  // La complétude est DÉDUITE du dossier : c'est la part de critères
  // effectivement renseignés. La tirer indépendamment produirait un dossier
  // incohérent — complétude annoncée à 100 % alors que des critères manquent.
  const total = model.criteria.length;
  const renseignes = Object.values(criteria).filter((x) => x.status !== "MISSING").length;
  const partRenseignee = renseignes / total;
  const completeness: number =
    partRenseignee >= 0.98 ? 100 : partRenseignee >= 0.93 ? 75 : partRenseignee >= 0.85 ? 50 : 25;

  // Les autres dimensions dépendent du segment — une GE produit des comptes
  // audités et récents — et se dégradent modérément avec la qualité de crédit :
  // un dossier qui va mal est aussi, souvent, un dossier mal tenu.
  const mix = a.informationQuality[segment];
  const niveaux = [25, 50, 75, 100];
  const tirageQualite = (): number => {
    // Le décalage par Q est appliqué sur le percentile, pas sur le niveau :
    // il déforme la répartition sans jamais sortir de l'échelle.
    const u = Math.min(0.9999, Math.max(0.0001, normalCdf(normalInv(rng.nextOpen()) + 0.28 * Q)));
    let cum = 0;
    for (let i = 0; i < mix.length; i += 1) {
      cum += mix[i];
      if (u < cum) return niveaux[i];
    }
    return 100;
  };

  return {
    modelId: model.modelId,
    segment,
    asOfDate,
    criteria,
    structuralFlags: flags,
    redFlags: redFlags.length > 0 ? redFlags : undefined,
    defaultTriggered: alreadyInDefault ? true : undefined,
    confidence: {
      completeness,
      freshness: tirageQualite(),
      provenance: tirageQualite(),
      reliability: tirageQualite(),
    },
  };
}
