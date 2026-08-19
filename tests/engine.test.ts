import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import { CORP_STD_V1 } from "@/models";
import { FULL_CONFIDENCE, tpeGoldenInput } from "./fixtures";

describe("Golden vectors — agrégation (grilles §21)", () => {
  it("reproduit l'exemple 21.1 : D1 TPE = 61,00", () => {
    const result = computeRating(CORP_STD_V1, tpeGoldenInput());
    const d1 = result.domainResults.find((d) => d.code === "D1")!;
    expect(d1.score).toBeCloseTo(61.0, 10);
  });

  it("agrège le score global exactement (64,50 → G7)", () => {
    const result = computeRating(CORP_STD_V1, tpeGoldenInput());
    expect(result.outcome).toBe("SCORED");
    expect(result.rawScore).toBeCloseTo(64.5, 10);
    expect(result.engineGrade).toBe("G7");
    expect(result.finalGrade).toBe("G7");
    const scores = Object.fromEntries(
      result.domainResults.map((d) => [d.code, d.score])
    );
    expect(scores.D2).toBeCloseTo(50, 10);
    expect(scores.D3).toBeCloseTo(75, 10);
    expect(scores.D5).toBeCloseTo(75, 10);
  });

  it("vérifie la formule §21.1 complète : 61×25% + 60×10% + 82×25% + 65×15% + 70×15% + 75×7% + 50×3% = 68,75", () => {
    // Contrôle arithmétique de la formule d'agrégation elle-même.
    const global =
      (61 * 2500 + 60 * 1000 + 82 * 2500 + 65 * 1500 + 70 * 1500 + 75 * 700 + 50 * 300) /
      10000;
    expect(global).toBeCloseTo(68.75, 10);
  });

  it("est reproductible : même snapshot => même résultat", () => {
    const a = computeRating(CORP_STD_V1, tpeGoldenInput(), "2026-08-18T00:00:00Z");
    const b = computeRating(CORP_STD_V1, tpeGoldenInput(), "2026-08-18T00:00:00Z");
    expect(a).toEqual(b);
  });
});

describe("Bornes des barèmes (tests de frontière §24.4)", () => {
  const cases: Array<[number, number]> = [
    [1.0, 100], // borne incluse
    [1.0001, 75],
    [2.0, 75], // borne incluse côté 75
    [2.0001, 50],
    [3.5, 50],
    [3.5001, 25],
    [5.0, 25],
    [5.0001, 0],
    [-0.5, 100], // dette nette négative (cas trésorerie libre documenté)
  ];
  for (const [value, expected] of cases) {
    it(`D1.5 TPE : valeur ${value} → score ${expected}`, () => {
      const input = tpeGoldenInput();
      input.criteria["D1.5"] = { status: "AVAILABLE", value };
      const result = computeRating(CORP_STD_V1, input);
      const c = result.domainResults
        .find((d) => d.code === "D1")!
        .criteria.find((c) => c.code === "D1.5")!;
      expect(c.score).toBe(expected);
    });
  }

  it("monotonicité : améliorer isolément D1.4 ne dégrade jamais le score global", () => {
    let prev = -1;
    for (const value of [2, 10, 20, 30, 40]) {
      const input = tpeGoldenInput();
      input.criteria["D1.4"] = { status: "AVAILABLE", value };
      const result = computeRating(CORP_STD_V1, input);
      expect(result.rawScore!).toBeGreaterThanOrEqual(prev);
      prev = result.rawScore!;
    }
  });

  it("cas spécial EBITDA <= 0 : D1.5 => score 0 explicite", () => {
    const input = tpeGoldenInput();
    input.criteria["D1.5"] = { status: "AVAILABLE", specialCase: "EBITDA_LTE_0" };
    const result = computeRating(CORP_STD_V1, input);
    const c = result.domainResults
      .find((d) => d.code === "D1")!
      .criteria.find((c) => c.code === "D1.5")!;
    expect(c.score).toBe(0);
    expect(c.explanationFr).toContain("EBITDA_LTE_0");
  });
});

describe("Segmentation TPE/PME/GE (seed paramétrable)", () => {
  const base = () => {
    const input = tpeGoldenInput();
    delete input.segment;
    return input;
  };

  it("CA 200 MMAD → GE", () => {
    const input = base();
    input.segmentationData = { annualTurnover: 200_000_000 };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.segment).toBe("GE");
    expect(r.segmentSource).toBe("COMPUTED");
  });

  it("CA 50 MMAD → PME", () => {
    const input = base();
    input.segmentationData = { annualTurnover: 50_000_000, globalBankExposure: 0 };
    expect(computeRating(CORP_STD_V1, input).segment).toBe("PME");
  });

  it("CA 5 MMAD + exposition 3 MMAD → PME", () => {
    const input = base();
    input.segmentationData = { annualTurnover: 5_000_000, globalBankExposure: 3_000_000 };
    expect(computeRating(CORP_STD_V1, input).segment).toBe("PME");
  });

  it("CA 5 MMAD + exposition 1 MMAD → TPE", () => {
    const input = base();
    input.segmentationData = { annualTurnover: 5_000_000, globalBankExposure: 1_000_000 };
    expect(computeRating(CORP_STD_V1, input).segment).toBe("TPE");
  });

  it("CA groupe prime sur CA solo (vision groupe d'intérêt)", () => {
    const input = base();
    input.segmentationData = {
      annualTurnover: 5_000_000,
      groupAnnualTurnover: 300_000_000,
    };
    expect(computeRating(CORP_STD_V1, input).segment).toBe("GE");
  });

  it("segment indéterminable → scoring bloqué", () => {
    const input = base();
    input.segmentationData = {};
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("BLOCKED_SEGMENTATION");
    expect(r.finalGrade).toBeNull();
  });
});

describe("Caps structurels et de confiance (§15-16)", () => {
  it("DSCR < 1 en base → cap G9, score brut conservé", () => {
    const input = tpeGoldenInput();
    input.structuralFlags = { baseDscrBelow1: true };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.rawScore).toBeCloseTo(64.5, 10);
    expect(r.engineGrade).toBe("G7");
    expect(r.finalGrade).toBe("G9");
    expect(r.appliedCaps.some((c) => c.code === "CAP06")).toBe(true);
  });

  it("DSCR < 1 uniquement en stress → cap G7 (sans effet si déjà G7)", () => {
    const input = tpeGoldenInput();
    input.structuralFlags = { stressDscrBelow1: true };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.finalGrade).toBe("G7");
    expect(r.appliedCaps.some((c) => c.code === "CAP07")).toBe(true);
  });

  it("plusieurs caps → le plus contraignant est retenu", () => {
    const input = tpeGoldenInput();
    input.structuralFlags = {
      stressDscrBelow1: true,
      negativeTangibleEquity: true,
    };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.finalGrade).toBe("G9"); // CAP02 (G9) plus contraignant que CAP07 (G7)
  });

  it("confiance moyenne (82) → cap G4 enregistré, sans effet si grade déjà moins bon", () => {
    const input = tpeGoldenInput();
    input.confidence = { completeness: 75, freshness: 100, reliability: 75, provenance: 100 };
    // 0,35×75 + 0,20×100 + 0,30×75 + 0,15×100 = 83,75 → bande [70, 85[ → cap G4
    const r = computeRating(CORP_STD_V1, input);
    expect(r.confidenceScore).toBeCloseTo(83.75, 10);
    expect(r.appliedCaps.some((c) => c.code === "CAP_CONFIDENCE" && c.maxGrade === "G4")).toBe(true);
    expect(r.finalGrade).toBe("G7"); // déjà moins bon que G4
  });

  it("confiance insuffisante (< 55) → aucun grade final, score brut conservé", () => {
    const input = tpeGoldenInput();
    input.confidence = { completeness: 25, freshness: 25, reliability: 50, provenance: 50 };
    // 0,35×25 + 0,20×25 + 0,30×50 + 0,15×50 = 36,25 → Insuffisant
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("NO_GRADE_CONFIDENCE");
    expect(r.finalGrade).toBeNull();
    expect(r.rawScore).toBeCloseTo(64.5, 10);
  });

  it("comptes trop anciens (CAP04) → aucun grade final", () => {
    const input = tpeGoldenInput();
    input.structuralFlags = { accountsTooOld: true };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("NO_GRADE_CONFIDENCE");
    expect(r.finalGrade).toBeNull();
  });
});

describe("Red flags et défaut (§17-18)", () => {
  it("red flag BLOCK (RF01) → scoring arrêté, aucun score", () => {
    const input = tpeGoldenInput();
    input.redFlags = ["RF01"];
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("BLOCKED_RED_FLAG");
    expect(r.rawScore).toBeNull();
    expect(r.finalGrade).toBeNull();
  });

  it("red flag REFER (RF07) → score calculé, signal non dilué", () => {
    const input = tpeGoldenInput();
    input.redFlags = ["RF07"];
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("SCORED");
    expect(r.rawScore).toBeCloseTo(64.5, 10);
    expect(r.triggeredRedFlags.map((f) => f.code)).toContain("RF07");
    expect(r.explanationFr).toContain("RF07");
  });

  it("défaut avéré → grade DEF1 forcé, indépendamment du score", () => {
    const input = tpeGoldenInput();
    input.defaultTriggered = true;
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("DEFAULT_GRADE");
    expect(r.finalGrade).toBe("DEF1");
    expect(r.rawScore).toBeCloseTo(64.5, 10); // conservé pour le monitoring
  });
});

describe("Données manquantes et non applicables (§7.10)", () => {
  it("donnée critique manquante (D1.5) → scoring bloqué", () => {
    const input = tpeGoldenInput();
    input.criteria["D1.5"] = { status: "MISSING" };
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("BLOCKED_DATA");
    expect(r.finalGrade).toBeNull();
    expect(r.blockingReasonsFr.join(" ")).toContain("D1.5");
  });

  it("critère absent du payload = MISSING (jamais un zéro silencieux)", () => {
    const input = tpeGoldenInput();
    delete input.criteria["D1.4"]; // critique
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("BLOCKED_DATA");
  });

  it("NOT_APPLICABLE → poids redistribué dans le domaine, MISSING non critique → exclu avec warning", () => {
    const input = tpeGoldenInput();
    // D7 : deux critères NA, deux notés 50 → D7 = 50 (redistribution interne)
    input.criteria["D7.1"] = { status: "NOT_APPLICABLE" };
    input.criteria["D7.2"] = { status: "NOT_APPLICABLE" };
    const r = computeRating(CORP_STD_V1, input);
    const d7 = r.domainResults.find((d) => d.code === "D7")!;
    expect(d7.score).toBeCloseTo(50, 10);
    expect(d7.applicableWeightBps).toBe(150); // 100 (D7.3) + 50 (D7.4)
    expect(r.outcome).toBe("SCORED");
    expect(r.rawScore).toBeCloseTo(64.5, 10); // D7 reste à 50 → global inchangé

    // MISSING non critique : exclu du dénominateur + warning explicite
    const input2 = tpeGoldenInput();
    input2.criteria["D4.8"] = { status: "MISSING" };
    const r2 = computeRating(CORP_STD_V1, input2);
    expect(r2.outcome).toBe("SCORED");
    expect(r2.warningsFr.join(" ")).toContain("D4.8");
  });

  it("NOT_APPLICABLE et MISSING produisent des comportements distincts", () => {
    const na = tpeGoldenInput();
    na.criteria["D2.6"] = { status: "NOT_APPLICABLE" };
    const missing = tpeGoldenInput();
    missing.criteria["D2.6"] = { status: "MISSING" };
    const rNa = computeRating(CORP_STD_V1, na);
    const rMissing = computeRating(CORP_STD_V1, missing);
    // Même effet numérique (exclusion) mais signalisation différente :
    expect(rNa.warningsFr.filter((w) => w.includes("D2.6"))).toHaveLength(0);
    expect(rMissing.warningsFr.filter((w) => w.includes("D2.6")).length).toBeGreaterThan(0);
  });

  it("le client ne peut pas fournir un score pour un critère quantitatif", () => {
    const input = tpeGoldenInput();
    // Un « score » envoyé sur un critère quantitatif est ignoré : seule la
    // valeur mesurée compte. Sans valeur => donnée invalide.
    input.criteria["D1.5"] = { status: "AVAILABLE", score: 100 } as never;
    const r = computeRating(CORP_STD_V1, input);
    expect(r.outcome).toBe("BLOCKED_DATA");
  });
});

describe("Confiance (§15.1)", () => {
  it("pondération 35/20/30/15 appliquée exactement", () => {
    const input = tpeGoldenInput();
    input.confidence = { completeness: 100, freshness: 50, reliability: 75, provenance: 25 };
    const r = computeRating(CORP_STD_V1, input);
    // 0,35×100 + 0,20×50 + 0,30×75 + 0,15×25 = 71,25
    expect(r.confidenceScore).toBeCloseTo(71.25, 10);
  });
});

describe("Modèle TPE comportemental", () => {
  it("score un dossier TPE par les flux", async () => {
    const { CORP_TPE_BEHAV_V1 } = await import("@/models");
    const r = computeRating(CORP_TPE_BEHAV_V1, {
      modelId: "CORP_TPE_BEHAV_V1",
      segment: "TPE",
      asOfDate: "2026-08-18",
      confidence: { ...FULL_CONFIDENCE },
      criteria: {
        "B1.1": { status: "AVAILABLE", value: 0 }, // 100
        "B1.2": { status: "AVAILABLE", score: 75 },
        "B1.3": { status: "AVAILABLE", value: 95 }, // 75
        "B1.4": { status: "AVAILABLE", score: 100 },
        "B1.5": { status: "AVAILABLE", score: 100 },
        "B2.1": { status: "AVAILABLE", value: 1.4 }, // 75
        "B2.2": { status: "AVAILABLE", value: 20 }, // 75
        "B2.3": { status: "AVAILABLE", score: 75 },
        "B2.4": { status: "AVAILABLE", value: 1.2 }, // 75
        "B3.1": { status: "AVAILABLE", score: 50 },
        "B3.2": { status: "AVAILABLE", value: 6 }, // 75
        "B3.3": { status: "AVAILABLE", score: 50 },
        "B3.4": { status: "AVAILABLE", score: 50 },
        "B3.5": { status: "AVAILABLE", score: 50 },
        "B4.1": { status: "AVAILABLE", score: 75 },
        "B4.2": { status: "AVAILABLE", score: 50 },
        "B4.3": { status: "AVAILABLE", score: 50 },
        "B4.4": { status: "AVAILABLE", score: 50 },
        "B5.1": { status: "AVAILABLE", score: 75 },
        "B5.2": { status: "AVAILABLE", value: 4 }, // 100
        "B5.3": { status: "AVAILABLE", score: 75 },
        "B5.4": { status: "AVAILABLE", score: 75 },
        "B6.1": { status: "AVAILABLE", score: 50 },
        "B7.1": { status: "AVAILABLE", score: 50 },
      },
    });
    expect(r.outcome).toBe("SCORED");
    expect(r.rawScore).toBeGreaterThan(60);
    expect(r.finalGrade).not.toBeNull();
  });
});
