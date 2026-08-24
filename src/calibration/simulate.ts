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
import { CAP_TRIGGER_TO_FLAG } from "../core/structural-flags";
import { Rng } from "./rng";
import { wiringFor, type SimulationWiring } from "./wiring";
import { normalCdf, normalInv } from "./stats";

// ---------------------------------------------------------------------------
// Hypothèses du processus générateur — toutes explicites et discutables
// ---------------------------------------------------------------------------

export interface SimulationAssumptions {
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
  /** Grade issu du seul barème, avant application des caps. */
  engineGrade: string | null;
  finalGrade: string | null;
  confidenceScore: number;
  /**
   * Code du cap réellement MORDANT, c'est-à-dire celui qui a déplacé le grade.
   * Nul quand aucun cap n'a modifié le grade moteur : un cap déclaré mais moins
   * contraignant que le grade obtenu n'a rien changé, et le compter fausserait
   * toute lecture de l'origine des grades.
   */
  bindingCap: string | null;
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

  // La répartition effective vient du câblage : un modèle mono-segment ne doit
  // pas se voir attribuer des contreparties qu'il ne sait pas noter.
  const wiring = wiringFor(model.modelId);
  const segments = (Object.keys(wiring.segmentMix) as Segment[]).filter(
    (x) => (wiring.segmentMix[x] ?? 0) > 0
  );
  const segWeights = segments.map((x) => wiring.segmentMix[x] as number);
  if (segments.length === 0) throw new Error(`Câblage de ${model.modelId} : aucun segment couvert.`);

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
      const input = buildInput(model, wiring, segment, Q, B, a, idioWeight, rng, asOfDate, alreadyInDefault);

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
        engineGrade: result.engineGrade,
        finalGrade: result.finalGrade,
        confidenceScore: result.confidenceScore,
        bindingCap: bindingCapCode(model, result.engineGrade, result.finalGrade, result.appliedCaps),
      });
    }
  }

  return { obligors, systematicFactors, assumptions: a, seed: opts.seed };
}

/**
 * Identifie le cap qui a effectivement déplacé le grade.
 *
 * Un cap est déclaré dès que sa condition est remplie, mais il n'agit que si son
 * plafond est plus sévère que le grade obtenu au barème. Attribuer un grade à un
 * cap non mordant surestimerait massivement le rôle des caps dans le bas de
 * l'échelle, où le barème suffit déjà à dégrader.
 */
function bindingCapCode(
  model: ModelConfig,
  engineGrade: string | null,
  finalGrade: string | null,
  appliedCaps: readonly { code: string; maxGrade: string }[]
): string | null {
  if (!engineGrade || !finalGrade || engineGrade === finalGrade) return null;
  const rank = (g: string) => model.masterScale.findIndex((b) => b.grade === g);
  // Le cap mordant est celui dont le plafond correspond au grade final retenu.
  const mordants = appliedCaps.filter((c) => c.maxGrade !== "NO_GRADE" && rank(c.maxGrade) === rank(finalGrade));
  if (mordants.length > 0) return mordants[0].code;
  // Repli : le plus sévère des caps appliqués.
  const trie = [...appliedCaps]
    .filter((c) => c.maxGrade !== "NO_GRADE")
    .sort((a, b) => rank(b.maxGrade) - rank(a.maxGrade));
  return trie.length > 0 ? trie[0].code : null;
}

// ---------------------------------------------------------------------------
// Construction d'un dossier
// ---------------------------------------------------------------------------

function buildInput(
  model: ModelConfig,
  wiring: SimulationWiring,
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

  // --- Cas spéciaux ---------------------------------------------------------
  // Uniquement ceux que le modèle DÉCLARE, et seulement dans le bas de la
  // distribution de qualité : ce sont des situations économiques extrêmes.
  // Le premier cas déclenché sur un critère l'emporte — deux cas spéciaux
  // simultanés sur le même critère n'auraient pas de sens.
  const flags: StructuralFlagsInput = {};
  const dejaTraites = new Set<string>();
  for (const sc of wiring.specialCases) {
    if (dejaTraites.has(sc.criterion)) continue;
    const critere = model.criteria.find((c) => c.code === sc.criterion);
    if (!critere?.specialCases?.some((x) => x.code === sc.code)) {
      throw new Error(
        `Câblage incohérent : ${model.modelId} ne déclare pas le cas spécial ${sc.code} sur ${sc.criterion}.`
      );
    }
    if (Q < sc.qBelow && rng.bernoulli(sc.probability)) {
      criteria[sc.criterion] = { status: "AVAILABLE", specialCase: sc.code };
      levels[sc.criterion] = critere.specialCases.find((x) => x.code === sc.code)!.score;
      // Le flag structurel accompagne le cas spécial : sans cela on fabriquerait
      // une incohérence que le moteur signalerait à juste titre.
      if (sc.flag) (flags as Record<string, unknown>)[sc.flag] = true;
      dejaTraites.add(sc.criterion);
    }
  }

  // --- Flags structurels ----------------------------------------------------
  // L'ancienneté est indépendante de la qualité : une entreprise jeune n'est pas
  // mauvaise, elle est mal observée — c'est précisément ce que CAP01 traduit.
  flags.companyAgeYears =
    Math.round(Math.exp(wiring.age.logMean + wiring.age.logSd * rng.normal()) * 10) / 10;
  if ((flags.companyAgeYears ?? 99) < 2) flags.hasStrongGroupSupport = rng.bernoulli(0.25);

  // Les autres flags découlent du niveau atteint par le critère qui mesure la
  // même chose, jamais d'un tirage indépendant.
  for (const f of wiring.flags) {
    const niveau = levels[f.criterion];
    if (niveau === undefined || !f.whenLevelIn.includes(niveau)) continue;
    // Une probabilité certaine ne consomme pas d'aléa : le flux aléatoire ne
    // doit dépendre que des tirages réellement incertains, sans quoi ajouter
    // une règle déterministe déplacerait toute la simulation en aval.
    if (f.probability >= 1 || rng.bernoulli(f.probability)) {
      (flags as Record<string, unknown>)[f.flag] = true;
    }
  }
  if (wiring.goingConcern && Q < wiring.goingConcern.qBelow && rng.bernoulli(wiring.goingConcern.probability)) {
    flags.goingConcernMaterialUncertainty = true;
  }

  // Un flag que le modèle ne sait pas exploiter est retiré : il ne déclencherait
  // aucun cap et brouillerait la lecture du dossier.
  const flagsExploitables = new Set(
    model.structuralCaps.map((c) => CAP_TRIGGER_TO_FLAG[c.trigger]).filter(Boolean)
  );
  for (const k of Object.keys(flags) as (keyof StructuralFlagsInput)[]) {
    if (k === "companyAgeYears" || k === "hasStrongGroupSupport") continue;
    if (!flagsExploitables.has(k)) delete flags[k];
  }

  // --- Red flags dérivés du dossier ----------------------------------------
  const redFlags = new Set<string>();
  for (const rf of wiring.redFlags) {
    if (!model.redFlags.some((x) => x.code === rf.code)) {
      throw new Error(`Câblage incohérent : ${model.modelId} ne déclare pas le red flag ${rf.code}.`);
    }
    const declenche =
      rf.whenFlag !== undefined
        ? flags[rf.whenFlag] === true
        : rf.criterion !== undefined &&
          levels[rf.criterion] !== undefined &&
          (rf.whenLevelIn as CriterionScore[]).includes(levels[rf.criterion]);
    if (!declenche) continue;
    if (rf.probability >= 1 || rng.bernoulli(rf.probability)) redFlags.add(rf.code);
  }
  for (const rf of wiring.independentRedFlags) {
    if (rng.bernoulli(rf.probability)) redFlags.add(rf.code);
  }

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
    redFlags: redFlags.size > 0 ? [...redFlags].sort() : undefined,
    defaultTriggered: alreadyInDefault ? true : undefined,
    confidence: {
      completeness,
      freshness: tirageQualite(),
      provenance: tirageQualite(),
      reliability: tirageQualite(),
    },
  };
}
