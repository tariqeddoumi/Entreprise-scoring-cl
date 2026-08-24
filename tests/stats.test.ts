import { describe, expect, it } from "vitest";
import {
  auc,
  binomialPValueUpper,
  bootstrapCi,
  brierScore,
  chiSquareSurvival,
  fitLogistic,
  gini,
  herfindahl,
  hosmerLemeshow,
  ksStatistic,
  logisticPredict,
  normalCdf,
  normalInv,
  pava,
  psi,
} from "../src/calibration/stats";
import { Rng } from "../src/calibration/rng";

// Les valeurs de référence proviennent de tables statistiques publiées ou de
// cas analytiques. Une bibliothèque de validation fausse rassure sur un modèle
// défaillant : elle doit donc être testée contre l'extérieur, pas contre
// elle-même.

describe("loi normale", () => {
  it("reproduit les valeurs tabulées de la fonction de répartition", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 10);
    expect(normalCdf(-1)).toBeCloseTo(0.15865525393145705, 10);
    expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 10);
    expect(normalCdf(-2.5758293035489004)).toBeCloseTo(0.005, 10);
    expect(normalCdf(4)).toBeCloseTo(0.9999683287581669, 12);
  });

  it("reproduit les quantiles usuels", () => {
    expect(normalInv(0.5)).toBeCloseTo(0, 12);
    expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 9);
    expect(normalInv(0.995)).toBeCloseTo(2.5758293035489004, 9);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232306167813, 9);
    // Les PD utiles descendent très bas : la queue doit rester exacte.
    expect(normalInv(0.0003)).toBeCloseTo(-3.4316, 3);
  });

  it("est réciproque de la fonction de répartition", () => {
    for (const p of [1e-6, 0.001, 0.03, 0.5, 0.9, 0.999, 1 - 1e-9]) {
      expect(normalCdf(normalInv(p))).toBeCloseTo(p, 10);
    }
  });
});

describe("khi-deux", () => {
  it("reproduit les valeurs critiques tabulées", () => {
    // Points à 5 % : df=1 → 3,841 ; df=8 → 15,507 ; df=10 → 18,307.
    expect(chiSquareSurvival(3.841458820694124, 1)).toBeCloseTo(0.05, 8);
    expect(chiSquareSurvival(15.50731305586545, 8)).toBeCloseTo(0.05, 8);
    expect(chiSquareSurvival(18.30703805327515, 10)).toBeCloseTo(0.05, 8);
    expect(chiSquareSurvival(0, 5)).toBe(1);
  });
});

describe("pouvoir discriminant", () => {
  it("vaut 1 quand la séparation est parfaite", () => {
    // Score = qualité : les défauts ont les scores les plus bas.
    const scores = [10, 20, 30, 80, 90, 95];
    const d: (0 | 1)[] = [1, 1, 1, 0, 0, 0];
    expect(auc(scores, d)).toBeCloseTo(1, 12);
    expect(gini(scores, d)).toBeCloseTo(1, 12);
  });

  it("vaut 0 quand le classement est parfaitement inversé", () => {
    const scores = [10, 20, 30, 80, 90, 95];
    const d: (0 | 1)[] = [0, 0, 0, 1, 1, 1];
    expect(auc(scores, d)).toBeCloseTo(0, 12);
  });

  it("vaut 0,5 quand tous les scores sont ex æquo", () => {
    const scores = [50, 50, 50, 50];
    const d: (0 | 1)[] = [1, 0, 1, 0];
    expect(auc(scores, d)).toBeCloseTo(0.5, 12);
  });

  it("traite les ex æquo par rangs moyens", () => {
    // Un défaut et un sain au même score : contribution 1/2.
    // Paires (défaut, sain) : (10,50) bien classée, (10,50bis)... ici
    // défauts {10, 50} et sains {50, 90}. Paires : (10,50)=1, (10,90)=1,
    // (50,50)=0,5, (50,90)=1 → AUC = 3,5/4.
    const scores = [10, 50, 50, 90];
    const d: (0 | 1)[] = [1, 1, 0, 0];
    expect(auc(scores, d)).toBeCloseTo(3.5 / 4, 12);
  });

  it("refuse un échantillon sans défaut", () => {
    expect(() => auc([1, 2, 3], [0, 0, 0])).toThrow(/au moins un défaut/);
  });

  it("calcule la statistique de Kolmogorov-Smirnov", () => {
    // Séparation parfaite → KS = 1.
    expect(ksStatistic([1, 2, 8, 9], [1, 1, 0, 0])).toBeCloseTo(1, 12);
    // Alternance stricte → écart maximal de 0,5.
    expect(ksStatistic([1, 2, 3, 4], [1, 0, 1, 0])).toBeCloseTo(0.5, 12);
  });
});

describe("qualité de la calibration", () => {
  it("calcule le score de Brier", () => {
    // (0,2−0)² + (0,8−1)² sur 2 = 0,04.
    expect(brierScore([0.2, 0.8], [0, 1])).toBeCloseTo(0.04, 12);
    expect(brierScore([1, 0], [1, 0])).toBeCloseTo(0, 12);
  });

  it("ne rejette pas l'adéquation quand la PD prédite est juste", () => {
    const rng = new Rng(7);
    const pd: number[] = [];
    const d: (0 | 1)[] = [];
    for (let i = 0; i < 20000; i += 1) {
      const p = 0.005 + 0.15 * rng.next();
      pd.push(p);
      d.push(rng.bernoulli(p) ? 1 : 0);
    }
    const hl = hosmerLemeshow(pd, d, 10);
    expect(hl.df).toBe(8);
    expect(hl.pValue).toBeGreaterThan(0.01);
  });

  it("rejette l'adéquation quand la PD est systématiquement sous-estimée", () => {
    const rng = new Rng(11);
    const pd: number[] = [];
    const d: (0 | 1)[] = [];
    for (let i = 0; i < 20000; i += 1) {
      const vraie = 0.02 + 0.2 * rng.next();
      pd.push(vraie / 3); // sous-estimation grossière
      d.push(rng.bernoulli(vraie) ? 1 : 0);
    }
    expect(hosmerLemeshow(pd, d, 10).pValue).toBeLessThan(1e-6);
  });

  it("calcule un test binomial unilatéral exact", () => {
    // P(X >= 1) avec n=1, p=0,25 → 0,25.
    expect(binomialPValueUpper(1, 1, 0.25)).toBeCloseTo(0.25, 12);
    // P(X >= 0) = 1 quel que soit le paramètre.
    expect(binomialPValueUpper(0, 10, 0.3)).toBeCloseTo(1, 12);
    // P(X >= 2) avec n=2, p=0,5 → 0,25.
    expect(binomialPValueUpper(2, 2, 0.5)).toBeCloseTo(0.25, 12);
    // Un taux observé très au-dessus de la PD affectée doit alerter.
    expect(binomialPValueUpper(60, 1000, 0.02)).toBeLessThan(0.001);
  });
});

describe("stabilité et monotonie", () => {
  it("donne un indice de stabilité nul pour deux répartitions identiques", () => {
    expect(psi([10, 20, 30], [10, 20, 30])).toBeCloseTo(0, 12);
    expect(psi([10, 20, 30], [20, 40, 60])).toBeCloseTo(0, 12); // invariant d'échelle
  });

  it("croît avec le déplacement de la population", () => {
    const leger = psi([50, 50], [45, 55]);
    const fort = psi([50, 50], [10, 90]);
    expect(leger).toBeGreaterThan(0);
    expect(fort).toBeGreaterThan(leger);
    expect(fort).toBeGreaterThan(0.25);
  });

  it("laisse inchangée une suite déjà croissante", () => {
    const v = [0.001, 0.01, 0.05, 0.2];
    expect(pava(v, [1, 1, 1, 1])).toEqual(v);
  });

  it("corrige une inversion en moyennant les blocs par effectif", () => {
    // 0,10 puis 0,02 avec effectifs égaux → les deux valent 0,06.
    const out = pava([0.1, 0.02], [100, 100]);
    expect(out[0]).toBeCloseTo(0.06, 12);
    expect(out[1]).toBeCloseTo(0.06, 12);
    // Le résultat est croissant, par construction.
    const out2 = pava([0.3, 0.1, 0.2, 0.05], [10, 10, 10, 10]);
    for (let i = 1; i < out2.length; i += 1) expect(out2[i]).toBeGreaterThanOrEqual(out2[i - 1] - 1e-12);
  });

  it("pondère la fusion par les effectifs", () => {
    // 0,10 (n=10) puis 0,02 (n=90) → moyenne pondérée 0,028.
    const out = pava([0.1, 0.02], [10, 90]);
    expect(out[0]).toBeCloseTo(0.028, 12);
  });

  it("mesure la concentration par l'indice de Herfindahl", () => {
    expect(herfindahl([100])).toBeCloseTo(1, 12);
    expect(herfindahl([25, 25, 25, 25])).toBeCloseTo(0.25, 12);
    expect(herfindahl([])).toBe(0);
  });
});

describe("régression logistique", () => {
  it("retrouve les coefficients d'un processus générateur connu", () => {
    const rng = new Rng(2024);
    const x: number[] = [];
    const y: (0 | 1)[] = [];
    const vraiB0 = -1.5;
    const vraiB1 = -2.5;
    for (let i = 0; i < 200000; i += 1) {
      const xi = rng.next() * 2 - 1;
      const p = 1 / (1 + Math.exp(-(vraiB0 + vraiB1 * xi)));
      x.push(xi);
      y.push(rng.bernoulli(p) ? 1 : 0);
    }
    const fit = fitLogistic(x, y);
    expect(fit.converged).toBe(true);
    expect(fit.intercept).toBeCloseTo(vraiB0, 1);
    expect(fit.slope).toBeCloseTo(vraiB1, 1);
  });

  it("prédit une probabilité dans ]0,1[ et monotone dans le bon sens", () => {
    const fit = { intercept: 2, slope: -0.05 };
    const bas = logisticPredict(fit, 20);
    const haut = logisticPredict(fit, 90);
    expect(bas).toBeGreaterThan(haut); // score élevé = meilleure qualité = PD plus faible
    expect(haut).toBeGreaterThan(0);
    expect(bas).toBeLessThan(1);
  });
});

describe("bootstrap", () => {
  it("encadre le point estimé et est reproductible", () => {
    const rng = new Rng(5);
    const echantillon = Array.from({ length: 500 }, () => rng.normal());
    const moyenne = echantillon.reduce((a, b) => a + b, 0) / echantillon.length;
    const faire = (graine: number) => {
      const r = new Rng(1000 + graine);
      let s = 0;
      for (let i = 0; i < echantillon.length; i += 1) s += echantillon[r.int(echantillon.length)];
      return s / echantillon.length;
    };
    const ci = bootstrapCi(moyenne, faire, 400);
    expect(ci.lower).toBeLessThan(moyenne);
    expect(ci.upper).toBeGreaterThan(moyenne);
    expect(ci.replicates).toBe(400);
    const ci2 = bootstrapCi(moyenne, faire, 400);
    expect(ci2.lower).toBe(ci.lower);
    expect(ci2.upper).toBe(ci.upper);
  });
});

describe("générateur déterministe", () => {
  it("rejoue exactement la même suite à graine égale", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i += 1) expect(a.next()).toBe(b.next());
  });

  it("produit des suites différentes pour des graines différentes", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it("engendre une normale de moyenne et variance correctes", () => {
    const r = new Rng(99);
    const n = 200000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i += 1) {
      const z = r.normal();
      s += z;
      s2 += z * z;
    }
    expect(s / n).toBeCloseTo(0, 2);
    expect(s2 / n).toBeCloseTo(1, 1);
  });

  it("respecte les poids d'un tirage discret", () => {
    const r = new Rng(7);
    const compte = { a: 0, b: 0 };
    for (let i = 0; i < 100000; i += 1) compte[r.pick(["a", "b"] as const, [0.25, 0.75])] += 1;
    expect(compte.a / 100000).toBeCloseTo(0.25, 2);
  });
});
