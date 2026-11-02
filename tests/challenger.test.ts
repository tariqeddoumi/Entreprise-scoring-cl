import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import type { CriterionInput, RatingInput } from "@/core/types";
import { CORP_STD_CHALLENGER_V1, CORP_TPE_CHALLENGER_V1 } from "@/models";

const AT = "2026-11-01T12:00:00.000Z";
const q = (score: 0 | 25 | 50 | 75 | 100): CriterionInput => ({ status: "AVAILABLE", score });
const v = (value: number): CriterionInput => ({ status: "AVAILABLE", value });

/**
 * Cas chiffré du document 03 (§ 8) : PME, F1 à F6 = 75, 50, 75, 50, 50, 75 ;
 * B1 à B4 = 100, 75, 50, 50 ; A1 à A3 = 50, 25, 75 ; G1, G2, C1 = 75, 50, 50.
 * Valeurs choisies au milieu de la bande qui donne chaque score.
 */
function exemple(): RatingInput {
  return {
    modelId: "CORP_STD_CHALLENGER_V1",
    segment: "PME",
    asOfDate: "2026-10-31",
    confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
    criteria: {
      F1: v(30), // [25 ; 35[ → 75
      F2: v(3), // ]2 ; 3,5] → 50
      F3: v(1.6), // [1,4 ; 1,8[ → 75
      F4: v(1.1), // [1 ; 1,25[ → 50
      F5: q(50),
      F6: v(80), // [70 ; 90[ → 75
      B1: v(0), // 0 → 100
      B2: v(2), // 1 à 3 → 75
      B3: v(-5), // [-10 ; 0[ → 50
      B4: q(50),
      A1: q(50),
      A2: q(25),
      A3: q(75),
      G1: q(75),
      G2: q(50),
      C1: q(50),
    },
  };
}

describe("Grille challenger standard (document 03)", () => {
  it("retrouve le cas chiffré : 64,25 points, soit la classe 6", () => {
    const r = computeRating(CORP_STD_CHALLENGER_V1, exemple(), AT);
    expect(r.ratingStatus).toBe("RATED");
    expect(r.rawScore).toBeCloseTo(64.25, 10);
    expect(r.finalGrade).toBe("6");
    expect(r.mandatoryReviewsFr).toEqual([]);
  });

  it("F3 de 75 à 0 : 55,25 points, classe 8, et revue risques obligatoire si le DSCR est sous 1", () => {
    const base = exemple();
    const r = computeRating(CORP_STD_CHALLENGER_V1, { ...base, criteria: { ...base.criteria, F3: v(0.9) } }, AT);
    expect(r.rawScore).toBeCloseTo(55.25, 10);
    expect(r.finalGrade).toBe("8");
    expect(r.mandatoryReviewsFr.join(" ")).toContain("F3");
    // Aucun plafond numéroté : la revue s'ajoute, le grade reste celui du score.
    expect(r.appliedRules).toEqual([]);
  });

  it("chaque colonne de poids totalise 100 %", () => {
    for (const seg of ["TPE", "PME", "GE"] as const) {
      expect(CORP_STD_CHALLENGER_V1.criteria.reduce((a, c) => a + (c.weightsBps[seg] ?? 0), 0)).toBe(10000);
    }
    expect(CORP_STD_CHALLENGER_V1.criteria).toHaveLength(16);
    expect(CORP_TPE_CHALLENGER_V1.criteria).toHaveLength(12);
  });

  it("noyau obligatoire : sans DSCR, aucune note ; un dossier sans dette vérifiée transfère le poids de F3 à F4", () => {
    const base = exemple();
    expect(
      computeRating(CORP_STD_CHALLENGER_V1, { ...base, criteria: { ...base.criteria, F3: { status: "MISSING" } } }, AT).ratingStatus
    ).toBe("NO_RATING_INSUFFICIENT_DATA");
    const sansDette = computeRating(
      CORP_STD_CHALLENGER_V1,
      { ...base, criteria: { ...base.criteria, F3: { status: "NOT_APPLICABLE" } } },
      AT
    );
    expect(sansDette.ratingStatus).toBe("RATED");
    const f4 = sansDette.domainResults.flatMap((d) => d.criteria).find((c) => c.code === "F4")!;
    expect(f4.effectiveWeightBps).toBe(800 + 1200);
  });

  it("porte de données à 80 % : trop de critères non instruits, pas de note", () => {
    const base = exemple();
    const criteria = { ...base.criteria };
    for (const c of ["F5", "F6", "B2", "B3", "B4"]) criteria[c] = { status: "MISSING" };
    const r = computeRating(CORP_STD_CHALLENGER_V1, { ...base, criteria }, AT);
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
    expect(r.explanationFr).toContain("couverture insuffisante");
  });

  it("aucun cran de soutien n'est accordé par la grille", () => {
    const r = computeRating(
      CORP_STD_CHALLENGER_V1,
      {
        ...exemple(),
        groupSupport: { claimed: true, capacityDocumented: true, willingnessDocumented: true, legallyBinding: true, fundsTransferable: true, requestedNotches: 2 },
      },
      AT
    );
    expect(r.finalGrade).toBe(r.standaloneGrade);
  });
});

describe("Grille challenger TPE comportementale (document 03)", () => {
  function tpe(): RatingInput {
    return {
      modelId: "CORP_TPE_CHALLENGER_V1",
      segment: "TPE",
      asOfDate: "2026-10-31",
      confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
      routing: { reliableFinancialStatements: false, behavioralHistoryMonths: 30 },
      criteria: {
        T1: v(0), T2: v(2), T3: v(1.6), T4: v(2), T5: v(20), T6: v(35),
        T7: q(75), T8: q(50), T9: q(50), T10: q(75), T11: q(75), T12: q(50),
      },
    };
  }

  it("note une TPE routée vers le comportemental, sur sa propre échelle", () => {
    const r = computeRating(CORP_TPE_CHALLENGER_V1, tpe(), AT);
    // 15 + 7,5 + 15 + 7,5 + 6 + 5,25 + 3,75 + 2,5 + 2,5 + 3,75 + 3,75 + 2,5 = 75
    expect(r.rawScore).toBeCloseTo(75, 10);
    expect(r.finalGrade).toBe("4");
  });

  it("refuse une TPE dont les comptes sont exploitables", () => {
    const r = computeRating(CORP_TPE_CHALLENGER_V1, { ...tpe(), routing: { reliableFinancialStatements: true, behavioralHistoryMonths: 30 } }, AT);
    expect(r.ratingStatus).toBe("NO_RATING_ROUTED_OTHER_MODEL");
  });
});
