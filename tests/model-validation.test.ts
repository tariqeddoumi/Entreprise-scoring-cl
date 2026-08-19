import { describe, expect, it } from "vitest";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "@/models";
import { validateModel, domainWeightBps } from "@/core/validate-model";
import { checkBins } from "@/core/binning";

describe("Validation des configurations de modèle", () => {
  it("CORP_STD_V1 est valide", () => {
    expect(validateModel(CORP_STD_V1)).toEqual([]);
  });

  it("CORP_TPE_BEHAV_V1 est valide", () => {
    expect(validateModel(CORP_TPE_BEHAV_V1)).toEqual([]);
  });

  it("les poids totalisent exactement 100,00 % par segment (CORP_STD_V1)", () => {
    for (const seg of ["TPE", "PME", "GE"] as const) {
      const total = CORP_STD_V1.criteria.reduce(
        (acc, c) => acc + (c.weightsBps[seg] ?? 0),
        0
      );
      expect(total).toBe(10000);
    }
  });

  it("les poids du modèle comportemental TPE totalisent 100,00 %", () => {
    const total = CORP_TPE_BEHAV_V1.criteria.reduce(
      (acc, c) => acc + (c.weightsBps.TPE ?? 0),
      0
    );
    expect(total).toBe(10000);
  });

  it("les poids de domaine correspondent aux grilles (§5.1)", () => {
    const expected: Record<string, Record<string, number>> = {
      D1: { TPE: 2500, PME: 3000, GE: 3000 },
      D2: { TPE: 1000, PME: 1500, GE: 2000 },
      D3: { TPE: 2500, PME: 2000, GE: 1000 },
      D4: { TPE: 1500, PME: 1500, GE: 1500 },
      D5: { TPE: 1500, PME: 1200, GE: 1500 },
      D6: { TPE: 700, PME: 500, GE: 500 },
      D7: { TPE: 300, PME: 300, GE: 500 },
    };
    for (const [domain, bySeg] of Object.entries(expected)) {
      for (const [seg, weight] of Object.entries(bySeg)) {
        expect(
          domainWeightBps(CORP_STD_V1, domain, seg as "TPE" | "PME" | "GE"),
          `${domain} ${seg}`
        ).toBe(weight);
      }
    }
  });

  it("le modèle compte exactement 45 critères (CORP_STD_V1)", () => {
    expect(CORP_STD_V1.criteria.length).toBe(45);
  });

  it("détecte un barème avec trou", () => {
    const issues = checkBins([
      { min: null, max: 1, minInclusive: true, maxInclusive: true, score: 100 },
      { min: 2, max: null, minInclusive: false, maxInclusive: true, score: 0 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("détecte une frontière à inclusivité incohérente", () => {
    const issues = checkBins([
      { min: null, max: 1, minInclusive: true, maxInclusive: true, score: 100 },
      { min: 1, max: null, minInclusive: true, maxInclusive: true, score: 0 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("la PD est marquée UNCALIBRATED sur les deux seeds", () => {
    expect(CORP_STD_V1.pdStatus).toBe("UNCALIBRATED");
    expect(CORP_TPE_BEHAV_V1.pdStatus).toBe("UNCALIBRATED");
  });
});
