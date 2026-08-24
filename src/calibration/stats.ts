/**
 * Statistiques de validation d'un modèle de notation.
 *
 * Toutes les fonctions sont pures et déterministes. Elles sont vérifiées dans
 * `tests/stats.test.ts` contre des valeurs de référence calculées à la main ou
 * publiées : une bibliothèque de validation fausse produit des indicateurs
 * rassurants sur un modèle défaillant, ce qui est pire que pas d'indicateur.
 */

// ---------------------------------------------------------------------------
// Loi normale
// ---------------------------------------------------------------------------

/** Fonction de répartition de la normale centrée réduite (précision ~1e-15). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/**
 * Fonction d'erreur complémentaire, méthode de Chebyshev (Numerical Recipes,
 * erfc avec erreur relative < 1.2e-7 raffinée par une itération de Newton sur
 * la série, ici implémentée par l'approximation rationnelle à 10 chiffres).
 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11,
    2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13,
    3.81e-16, 7.106e-15,
  ];
  let d = 0;
  let dd = 0;
  for (let j = cof.length - 1; j > 0; j -= 1) {
    const tmp = d;
    d = ty * d - dd + cof[j];
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

/** Quantile de la normale centrée réduite (Acklam, raffiné par Halley). */
export function normalInv(p: number): number {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new Error(`normalInv : probabilité hors ]0,1[ : ${p}`);
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Un pas de Halley : ramène l'erreur au niveau de la précision machine.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ---------------------------------------------------------------------------
// Loi du khi-deux (valeurs-p des tests d'adéquation)
// ---------------------------------------------------------------------------

function lnGamma(x: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Fonction gamma incomplète régularisée inférieure P(a, x). */
function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new Error("gammaP : arguments invalides");
  if (x === 0) return 0;
  if (x < a + 1) {
    // Développement en série.
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // Fraction continue (Lentz) pour Q(a, x), puis P = 1 − Q.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  return 1 - q;
}

/** P(X > x) pour X suivant un khi-deux à `df` degrés de liberté. */
export function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1;
  return 1 - gammaP(df / 2, x / 2);
}

// ---------------------------------------------------------------------------
// Pouvoir discriminant
// ---------------------------------------------------------------------------

/**
 * Aire sous la courbe ROC, par la statistique de Mann-Whitney sur les rangs
 * moyens — les ex æquo sont donc traités correctement, ce qui compte ici :
 * un score de notation prend un nombre limité de valeurs distinctes.
 *
 * Convention : `score` est un indicateur de QUALITÉ (plus haut = meilleur).
 * L'AUC renvoyée est celle du pouvoir de séparation des défauts.
 */
export function auc(scores: readonly number[], defaults: readonly (0 | 1)[]): number {
  if (scores.length !== defaults.length) throw new Error("auc : longueurs différentes");
  const n = scores.length;
  const nBad = defaults.reduce((a: number, b) => a + b, 0);
  const nGood = n - nBad;
  if (nBad === 0 || nGood === 0) {
    throw new Error("auc : il faut au moins un défaut et un non-défaut.");
  }
  const ranks = averageRanks(scores);
  let sumRankBad = 0;
  for (let i = 0; i < n; i += 1) if (defaults[i] === 1) sumRankBad += ranks[i];
  // U = somme des rangs des défauts − minimum possible ; AUC vue « qualité ».
  const u = sumRankBad - (nBad * (nBad + 1)) / 2;
  return 1 - u / (nBad * nGood);
}

export function gini(scores: readonly number[], defaults: readonly (0 | 1)[]): number {
  return 2 * auc(scores, defaults) - 1;
}

/** Rangs moyens (1-indexés), ex æquo partagés. */
function averageRanks(values: readonly number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j += 1;
    const avg = (i + j + 2) / 2; // moyenne des rangs 1-indexés i+1..j+1
    for (let k = i; k <= j; k += 1) ranks[idx[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Statistique de Kolmogorov-Smirnov entre distributions cumulées des sains et des défauts. */
export function ksStatistic(scores: readonly number[], defaults: readonly (0 | 1)[]): number {
  const pairs = scores.map((s, i) => ({ s, d: defaults[i] })).sort((a, b) => a.s - b.s);
  const nBad = defaults.reduce((a: number, b) => a + b, 0);
  const nGood = scores.length - nBad;
  if (nBad === 0 || nGood === 0) throw new Error("ksStatistic : un seul groupe présent.");
  let cb = 0;
  let cg = 0;
  let ks = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].d === 1) cb += 1;
    else cg += 1;
    // On ne mesure l'écart qu'en fin de palier d'ex æquo.
    if (i + 1 < pairs.length && pairs[i + 1].s === pairs[i].s) continue;
    ks = Math.max(ks, Math.abs(cb / nBad - cg / nGood));
  }
  return ks;
}

// ---------------------------------------------------------------------------
// Qualité de la calibration
// ---------------------------------------------------------------------------

/** Score de Brier : erreur quadratique moyenne entre PD prédite et défaut observé. */
export function brierScore(pd: readonly number[], defaults: readonly (0 | 1)[]): number {
  if (pd.length !== defaults.length || pd.length === 0) throw new Error("brierScore : entrées invalides");
  let s = 0;
  for (let i = 0; i < pd.length; i += 1) s += (pd[i] - defaults[i]) ** 2;
  return s / pd.length;
}

export interface HosmerLemeshowResult {
  statistic: number;
  df: number;
  pValue: number;
  groups: { n: number; expected: number; observed: number }[];
}

/**
 * Test de Hosmer-Lemeshow sur groupes de PD prédite.
 *
 * Lecture : une valeur-p FAIBLE indique un rejet de l'adéquation. Le test est
 * connu pour être très sensible sur de grands échantillons — sur un portefeuille
 * simulé de plusieurs dizaines de milliers de lignes, un rejet doit être lu avec
 * l'écart absolu, pas seulement avec la valeur-p.
 */
/**
 * Test d'adéquation à partir de groupes DÉJÀ CONSTITUÉS.
 *
 * C'est la forme pertinente pour un système de notation : la PD n'y prend
 * qu'un nombre fini de valeurs — une par grade. Découper la population en
 * déciles de PD prédite, comme le fait le test de Hosmer-Lemeshow usuel,
 * scinde alors un même grade en plusieurs groupes de PD identique dont les
 * taux observés diffèrent par le seul hasard : le test rejette pour une
 * mauvaise raison. On groupe donc par grade.
 */
export function goodnessOfFitFromGroups(
  groups: readonly { n: number; expected: number; observed: number }[]
): HosmerLemeshowResult {
  let statistic = 0;
  const kept = groups.filter((g) => g.n > 0);
  for (const g of kept) {
    const denom = g.expected * (1 - g.expected / g.n);
    if (denom > 1e-12) statistic += (g.observed - g.expected) ** 2 / denom;
  }
  const df = Math.max(1, kept.length - 2);
  return { statistic, df, pValue: chiSquareSurvival(statistic, df), groups: [...kept] };
}

export function hosmerLemeshow(
  pd: readonly number[],
  defaults: readonly (0 | 1)[],
  groupCount = 10
): HosmerLemeshowResult {
  const order = pd.map((p, i) => ({ p, d: defaults[i] })).sort((a, b) => a.p - b.p);
  const n = order.length;
  const groups: { n: number; expected: number; observed: number }[] = [];
  let statistic = 0;
  for (let g = 0; g < groupCount; g += 1) {
    const from = Math.floor((g * n) / groupCount);
    const to = Math.floor(((g + 1) * n) / groupCount);
    if (to <= from) continue;
    const slice = order.slice(from, to);
    const expected = slice.reduce((a, x) => a + x.p, 0);
    const observed = slice.reduce((a, x) => a + x.d, 0);
    const m = slice.length;
    groups.push({ n: m, expected, observed });
    const denom = expected * (1 - expected / m);
    if (denom > 1e-12) statistic += (observed - expected) ** 2 / denom;
  }
  const df = Math.max(1, groups.length - 2);
  return { statistic, df, pValue: chiSquareSurvival(statistic, df), groups };
}

/**
 * Test binomial unilatéral : la PD affectée à un grade sous-estime-t-elle le
 * taux de défaut observé ?
 *
 * Hypothèse d'indépendance des défauts au sein du grade. Sur un portefeuille
 * réel, la corrélation la rend ANTICONSERVATRICE (les vraies valeurs-p sont
 * plus élevées) : le test sert d'alerte, pas de preuve d'insuffisance.
 */
export function binomialPValueUpper(observed: number, n: number, p: number): number {
  if (n === 0) return 1;
  if (p <= 0) return observed > 0 ? 0 : 1;
  if (p >= 1) return 1;
  // P(X >= observed) exact par sommation en espace logarithmique.
  let total = 0;
  for (let k = observed; k <= n; k += 1) {
    total += Math.exp(
      lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p)
    );
  }
  return Math.min(1, Math.max(0, total));
}

// ---------------------------------------------------------------------------
// Stabilité et monotonie
// ---------------------------------------------------------------------------

/**
 * Indice de stabilité de population entre deux répartitions par classe.
 * Lecture usuelle : < 0,10 stable ; 0,10–0,25 à surveiller ; > 0,25 instable.
 */
export function psi(expected: readonly number[], actual: readonly number[]): number {
  if (expected.length !== actual.length) throw new Error("psi : longueurs différentes");
  const se = expected.reduce((a, b) => a + b, 0);
  const sa = actual.reduce((a, b) => a + b, 0);
  if (se === 0 || sa === 0) throw new Error("psi : effectif total nul");
  let out = 0;
  for (let i = 0; i < expected.length; i += 1) {
    // Plancher : une classe vide rendrait le logarithme infini.
    const e = Math.max(expected[i] / se, 1e-6);
    const a = Math.max(actual[i] / sa, 1e-6);
    out += (a - e) * Math.log(a / e);
  }
  return out;
}

/**
 * Régression isotone par « pool adjacent violators ».
 *
 * Sert à imposer la monotonie des PD par grade : une PD non monotone dans
 * l'échelle de notation est indéfendable — elle signifierait qu'un grade
 * meilleur porte un risque plus élevé.
 *
 * `values` doit être ordonné du meilleur grade au pire ; la sortie est
 * croissante. `weights` pondère par effectif.
 */
export function pava(values: readonly number[], weights: readonly number[]): number[] {
  if (values.length !== weights.length) throw new Error("pava : longueurs différentes");
  const blocks: { sum: number; w: number; count: number }[] = [];
  for (let i = 0; i < values.length; i += 1) {
    // Un bloc de poids nul ne doit pas absorber le voisin : poids plancher.
    const w = Math.max(weights[i], 1e-9);
    blocks.push({ sum: values[i] * w, w, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].w > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].w) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({ sum: a.sum + b.sum, w: a.w + b.w, count: a.count + b.count });
    }
  }
  const out: number[] = [];
  for (const b of blocks) {
    const v = b.sum / b.w;
    for (let k = 0; k < b.count; k += 1) out.push(v);
  }
  return out;
}

/** Indice de Herfindahl-Hirschman sur une répartition d'effectifs (concentration des grades). */
export function herfindahl(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return counts.reduce((a, c) => a + (c / total) ** 2, 0);
}

// ---------------------------------------------------------------------------
// Régression logistique (score → PD)
// ---------------------------------------------------------------------------

export interface LogisticFit {
  intercept: number;
  slope: number;
  iterations: number;
  converged: boolean;
  logLikelihood: number;
}

/**
 * Régression logistique à une variable, par Newton-Raphson (IRLS).
 *
 * Une seule variable explicative — le score du moteur — car l'objet de la
 * calibration est de transformer le score en PD, pas de re-modéliser le risque
 * à côté du modèle.
 */
export function fitLogistic(
  x: readonly number[],
  y: readonly (0 | 1)[],
  maxIter = 100,
  tol = 1e-10
): LogisticFit {
  if (x.length !== y.length || x.length === 0) throw new Error("fitLogistic : entrées invalides");
  let b0 = 0;
  let b1 = 0;
  let converged = false;
  let iter = 0;
  for (; iter < maxIter; iter += 1) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < x.length; i += 1) {
      const eta = b0 + b1 * x[i];
      const p = 1 / (1 + Math.exp(-eta));
      const r = y[i] - p;
      g0 += r;
      g1 += r * x[i];
      const w = p * (1 - p);
      h00 += w;
      h01 += w * x[i];
      h11 += w * x[i] * x[i];
    }
    const det = h00 * h11 - h01 * h01;
    if (Math.abs(det) < 1e-14) break;
    // Pas de Newton : delta = H^{-1} g (H est la hessienne de la log-vraisemblance négative).
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (h00 * g1 - h01 * g0) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) < tol && Math.abs(d1) < tol) {
      converged = true;
      iter += 1;
      break;
    }
  }
  let ll = 0;
  for (let i = 0; i < x.length; i += 1) {
    const eta = b0 + b1 * x[i];
    // Forme numériquement stable de log(sigmoid).
    const logSig = eta > 0 ? -Math.log1p(Math.exp(-eta)) : eta - Math.log1p(Math.exp(eta));
    const logOneMinus = eta > 0 ? -eta - Math.log1p(Math.exp(-eta)) : -Math.log1p(Math.exp(eta));
    ll += y[i] === 1 ? logSig : logOneMinus;
  }
  return { intercept: b0, slope: b1, iterations: iter, converged, logLikelihood: ll };
}

export function logisticPredict(fit: { intercept: number; slope: number }, x: number): number {
  return 1 / (1 + Math.exp(-(fit.intercept + fit.slope * x)));
}

// ---------------------------------------------------------------------------
// Intervalles de confiance par bootstrap
// ---------------------------------------------------------------------------

export interface BootstrapCi {
  point: number;
  lower: number;
  upper: number;
  replicates: number;
}

/**
 * Intervalle de confiance par bootstrap percentile.
 * `draw` doit renvoyer un tirage avec remise ; le générateur est injecté pour
 * que l'intervalle soit lui aussi reproductible.
 */
export function bootstrapCi(
  point: number,
  replicate: (r: number) => number,
  replicates: number,
  level = 0.95
): BootstrapCi {
  const vals: number[] = [];
  for (let r = 0; r < replicates; r += 1) {
    const v = replicate(r);
    if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  if (vals.length === 0) return { point, lower: NaN, upper: NaN, replicates: 0 };
  const alpha = (1 - level) / 2;
  const q = (p: number) => {
    const pos = p * (vals.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return vals[lo] + (vals[hi] - vals[lo]) * (pos - lo);
  };
  return { point, lower: q(alpha), upper: q(1 - alpha), replicates: vals.length };
}
