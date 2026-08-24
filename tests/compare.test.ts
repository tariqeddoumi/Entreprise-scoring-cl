import { describe, expect, it } from "vitest";
import { compareRuns } from "@/core/compare";
import { computeRating } from "@/core/engine";
import { CORP_STD_V1 } from "@/models";
import { tpeGoldenInput } from "./fixtures";

const run = (mutate: (i: ReturnType<typeof tpeGoldenInput>) => void = () => {}) => {
  const input = tpeGoldenInput();
  mutate(input);
  return computeRating(CORP_STD_V1, input, "2026-08-19T00:00:00Z");
};

describe("Comparaison de deux notations", () => {
  it("détecte l'absence de changement", () => {
    const c = compareRuns(run(), run());
    expect(c.comparable).toBe(true);
    expect(c.scoreDelta).toBeCloseTo(0, 10);
    expect(c.criterionDeltas).toEqual([]);
    expect(c.gradeChanged).toBe(false);
    expect(c.summaryFr).toContain("Aucun critère");
  });

  it("attribue l'écart au critère qui a bougé", () => {
    const before = run();
    // D1.4 passe de 30 % (score 75) à 10 % (score 25), poids TPE 4,00 %.
    const after = run((i) => {
      i.criteria["D1.4"] = { status: "AVAILABLE", value: 10 };
    });
    const c = compareRuns(before, after);

    expect(c.comparable).toBe(true);
    expect(c.scoreDelta!).toBeLessThan(0);
    expect(c.criterionDeltas).toHaveLength(1);

    const d = c.criterionDeltas[0];
    expect(d.code).toBe("D1.4");
    expect(d.previousScore).toBe(75);
    expect(d.currentScore).toBe(25);
    expect(d.natureFr).toBe("dégradation");
    // (25 − 75) × 4,00 % = −2,00 points de score global.
    expect(d.impact).toBeCloseTo(-2, 10);
  });

  it("l'attribution par critère reconstitue l'écart global", () => {
    const before = run();
    const after = run((i) => {
      i.criteria["D1.4"] = { status: "AVAILABLE", value: 10 };
      i.criteria["D3.1"] = { status: "AVAILABLE", value: 45 };
      i.criteria["D2.2"] = { status: "AVAILABLE", value: 1.7 };
    });
    const c = compareRuns(before, after);
    const somme = c.criterionDeltas.reduce((a, d) => a + d.impact, 0);
    // Sans changement de poids applicable, la somme des effets élémentaires
    // égale exactement l'écart de score global.
    expect(somme).toBeCloseTo(c.scoreDelta!, 8);
  });

  it("classe les écarts par effet décroissant", () => {
    const before = run();
    const after = run((i) => {
      i.criteria["D7.4"] = { status: "AVAILABLE", score: 0 }; // poids 0,50 %
      i.criteria["D3.1"] = { status: "AVAILABLE", value: 45 }; // poids 6,00 %
    });
    const c = compareRuns(before, after);
    expect(Math.abs(c.criterionDeltas[0].impact)).toBeGreaterThanOrEqual(
      Math.abs(c.criterionDeltas[1].impact)
    );
    expect(c.criterionDeltas[0].code).toBe("D3.1");
  });

  it("signale un cap apparu", () => {
    const before = run();
    const after = run((i) => {
      i.structuralFlags = { baseDscrBelow1: true };
    });
    const c = compareRuns(before, after);
    expect(c.capChangesFr.join(" ")).toContain("CAP06");
    expect(c.gradeChanged).toBe(true);
  });

  it("signale un red flag levé", () => {
    const before = run((i) => {
      i.redFlags = ["RF07"];
    });
    const after = run();
    const c = compareRuns(before, after);
    expect(c.redFlagChangesFr.join(" ")).toContain("RF07 levé");
  });

  it("refuse de comparer deux segments différents", () => {
    const before = run();
    const after = run((i) => {
      i.segment = "PME";
    });
    const c = compareRuns(before, after);
    expect(c.comparable).toBe(false);
    expect(c.incomparableReasonFr).toContain("Segment");
  });

  it("refuse de comparer deux modèles différents", async () => {
    const { CORP_TPE_BEHAV_V1 } = await import("@/models");
    const before = run();
    const after = { ...before, modelId: CORP_TPE_BEHAV_V1.modelId };
    const c = compareRuns(before, after);
    expect(c.comparable).toBe(false);
    expect(c.incomparableReasonFr).toContain("Modèles différents");
  });

  it("refuse de comparer lorsqu'une exécution n'a pas produit de score", () => {
    const before = run();
    const after = run((i) => {
      i.redFlags = ["RF01"]; // bloquant : aucun score
    });
    const c = compareRuns(before, after);
    expect(c.comparable).toBe(false);
    expect(c.incomparableReasonFr).toContain("n'a pas produit de score");
    expect(c.summaryFr).toContain("sans score");
  });
});
