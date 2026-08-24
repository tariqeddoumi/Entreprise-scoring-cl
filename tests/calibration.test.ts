import { describe, expect, it } from "vitest";
import { computeRating } from "../src/core/engine";
import { hashCalibration } from "../src/calibration/fit";
import { pdForGrade, tiedGrades, validateCalibration, type CalibrationConfig } from "../src/core/calibration";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "../src/models";
import type { ModelConfig, RatingInput } from "../src/core/types";
import { buildSamples, fitCalibration } from "../src/calibration/fit";
import { simulatePortfolio } from "../src/calibration/simulate";

const CAL = CORP_STD_V1.calibration as CalibrationConfig;
const CAL_TPE = CORP_TPE_BEHAV_V1.calibration as CalibrationConfig;

function dossier(overrides: Partial<RatingInput> = {}): RatingInput {
  const criteria: RatingInput["criteria"] = {};
  for (const c of CORP_STD_V1.criteria) {
    if (c.type === "QUANTITATIVE") {
      const bins = c.binsBySegment?.PME ?? c.binsBySegment?.ALL;
      const b = bins!.find((x) => x.score === 75) ?? bins![0];
      const v =
        b.min !== null && b.max !== null ? (b.min + b.max) / 2 : b.min !== null ? b.min + 1 : (b.max ?? 1) - 1;
      criteria[c.code] = { status: "AVAILABLE", value: v };
    } else {
      criteria[c.code] = { status: "AVAILABLE", score: 75 };
    }
  }
  return {
    modelId: "CORP_STD_V1",
    segment: "PME",
    asOfDate: "2025-12-31",
    criteria,
    structuralFlags: { companyAgeYears: 10 },
    confidence: { completeness: 100, freshness: 100, provenance: 100, reliability: 100 },
    ...overrides,
  };
}

describe("artefact de calibration attaché au modèle", () => {
  it("passe les contrôles d'intégrité", () => {
    expect(validateCalibration(CAL)).toEqual([]);
  });

  it("porte une empreinte qui correspond à son contenu", () => {
    // Garde-fou contre une retouche manuelle du JSON : modifier une PD sans
    // régénérer l'artefact casse l'empreinte, donc le test.
    expect(hashCalibration(CAL)).toBe(CAL.contentHash);
  });

  it("est déclarée SIMULÉE et porte son avertissement", () => {
    expect(CAL.dataSource).toBe("SYNTHETIC");
    expect(CAL.limitationsFr).toMatch(/SIMUL/i);
    expect(CAL.horizonMonths).toBe(12);
  });

  it("produit des PD strictement croissantes du meilleur au pire grade", () => {
    // Sur ce modèle, aucun grade n'est fusionné : l'échelle est strictement
    // ordonnée. La contrainte générale, elle, est la croissance large.
    for (let i = 1; i < CAL.gradePd.length; i += 1) {
      expect(CAL.gradePd[i].pd).toBeGreaterThan(CAL.gradePd[i - 1].pd);
    }
    expect(tiedGrades(CAL)).toEqual([]);
  });

  it("respecte le plancher réglementaire annoncé", () => {
    for (const g of CAL.gradePd) expect(g.pd).toBeGreaterThanOrEqual(CAL.floor);
  });
});

describe("calibration du modèle TPE comportemental", () => {
  it("passe les contrôles d'intégrité et porte une empreinte cohérente", () => {
    expect(validateCalibration(CAL_TPE)).toEqual([]);
    expect(hashCalibration(CAL_TPE)).toBe(CAL_TPE.contentHash);
    expect(CAL_TPE.dataSource).toBe("SYNTHETIC");
  });

  it("vise bien le modèle TPE et non le modèle standard", () => {
    // Les deux grilles n'observent pas la même chose : une calibration
    // transposée d'un modèle à l'autre serait indéfendable.
    expect(CAL_TPE.modelId).toBe("CORP_TPE_BEHAV_V1");
    expect(CAL_TPE.calibrationId).not.toBe(CAL.calibrationId);
    expect(CAL_TPE.contentHash).not.toBe(CAL.contentHash);
  });

  it("produit des PD croissantes au sens large, fusions comprises", () => {
    for (let i = 1; i < CAL_TPE.gradePd.length; i += 1) {
      expect(CAL_TPE.gradePd[i].pd).toBeGreaterThanOrEqual(CAL_TPE.gradePd[i - 1].pd);
    }
  });

  it("signale la fusion de G6 et G7, que la régression isotone a rendus indistinguables", () => {
    // Constat de premier ordre, pas un défaut : sur ce portefeuille le cap de
    // confiance déverse dans G7 des dossiers mieux notés que ceux de G6, au
    // point que les deux grades ne se distinguent plus par le risque.
    const fusions = tiedGrades(CAL_TPE);
    expect(fusions).toHaveLength(1);
    expect(fusions[0].grades).toEqual(["G6", "G7"]);
  });

  it("restitue une PD via le moteur sur un dossier TPE", () => {
    const criteria: RatingInput["criteria"] = {};
    for (const c of CORP_TPE_BEHAV_V1.criteria) {
      if (c.type === "QUANTITATIVE") {
        const bins = c.binsBySegment?.TPE ?? c.binsBySegment?.ALL;
        const b = bins!.find((x) => x.score === 75) ?? bins![0];
        const v =
          b.min !== null && b.max !== null ? (b.min + b.max) / 2 : b.min !== null ? b.min + 1 : (b.max ?? 1) - 1;
        criteria[c.code] = { status: "AVAILABLE", value: v };
      } else {
        criteria[c.code] = { status: "AVAILABLE", score: 75 };
      }
    }
    const r = computeRating(
      CORP_TPE_BEHAV_V1,
      {
        modelId: "CORP_TPE_BEHAV_V1",
        segment: "TPE",
        asOfDate: "2025-12-31",
        criteria,
        structuralFlags: { companyAgeYears: 9 },
        confidence: { completeness: 100, freshness: 100, provenance: 100, reliability: 100 },
      },
      "2025-12-31T12:00:00.000Z"
    );
    expect(r.outcome).toBe("SCORED");
    expect(r.pdStatus).toBe("CALIBRATED_SYNTHETIC");
    expect(r.calibrationId).toBe(CAL_TPE.calibrationId);
    expect(r.pd12m).toBe(CAL_TPE.gradePd.find((g) => g.grade === r.finalGrade)!.pd);
  });
});

describe("affectation de la PD par grade", () => {
  it("renvoie la PD du grade demandé", () => {
    const g4 = CAL.gradePd.find((g) => g.grade === "G4")!;
    expect(pdForGrade(CAL, "G4", false)).toBe(g4.pd);
  });

  it("renvoie 1 pour un grade de défaut, quel que soit le grade passé", () => {
    expect(pdForGrade(CAL, "G1", true)).toBe(1);
    expect(pdForGrade(CAL, null, true)).toBe(1);
  });

  it("renvoie null plutôt qu'une valeur par défaut sur un grade inconnu", () => {
    // Une PD inventée est plus dangereuse qu'une PD absente.
    expect(pdForGrade(CAL, "G42", false)).toBeNull();
    expect(pdForGrade(CAL, null, false)).toBeNull();
  });
});

describe("contrôles d'intégrité", () => {
  const base = (): CalibrationConfig => JSON.parse(JSON.stringify(CAL));

  it("refuse une échelle non monotone", () => {
    const c = base();
    const i = c.gradePd.findIndex((g) => g.grade === "G5");
    c.gradePd[i].pd = c.gradePd[i - 1].pd / 2;
    expect(validateCalibration(c).join(" ")).toMatch(/monotonie rompue/);
  });

  it("refuse une PD hors de ]0,1[", () => {
    const c = base();
    c.gradePd[0].pd = 0;
    expect(validateCalibration(c).join(" ")).toMatch(/hors \]0,1\[/);
  });

  it("refuse une PD de défaut différente de 1", () => {
    const c = base();
    c.defaultGradePd = 0.9;
    expect(validateCalibration(c).join(" ")).toMatch(/doit valoir 1/);
  });

  it("refuse une empreinte malformée", () => {
    const c = base();
    c.contentHash = "pas-une-empreinte";
    expect(validateCalibration(c).join(" ")).toMatch(/empreinte/);
  });

  it("refuse un horizon autre que 12 mois", () => {
    const c = base();
    c.horizonMonths = 24;
    expect(validateCalibration(c).join(" ")).toMatch(/12 mois/);
  });
});

describe("moteur : restitution de la PD", () => {
  it("produit une PD et le statut SIMULÉE quand une calibration est attachée", () => {
    const r = computeRating(CORP_STD_V1, dossier(), "2025-12-31T12:00:00.000Z");
    expect(r.outcome).toBe("SCORED");
    expect(r.pdStatus).toBe("CALIBRATED_SYNTHETIC");
    expect(r.pd12m).toBe(CAL.gradePd.find((g) => g.grade === r.finalGrade)!.pd);
    expect(r.calibrationId).toBe(CAL.calibrationId);
  });

  it("affecte une PD de 1 à un défaut constaté", () => {
    const r = computeRating(CORP_STD_V1, dossier({ defaultTriggered: true }), "2025-12-31T12:00:00.000Z");
    expect(r.outcome).toBe("DEFAULT_GRADE");
    expect(r.pd12m).toBe(1);
  });

  it("ne produit aucune PD lorsque le scoring est bloqué", () => {
    const input = dossier();
    input.criteria["D1.5"] = { status: "MISSING" };
    const r = computeRating(CORP_STD_V1, input, "2025-12-31T12:00:00.000Z");
    expect(r.outcome).toBe("BLOCKED_DATA");
    expect(r.pd12m).toBeNull();
  });

  it("ne produit aucune PD lorsque la qualité de données interdit un grade", () => {
    const r = computeRating(
      CORP_STD_V1,
      dossier({ confidence: { completeness: 25, freshness: 25, provenance: 25, reliability: 25 } }),
      "2025-12-31T12:00:00.000Z"
    );
    expect(r.outcome).toBe("NO_GRADE_CONFIDENCE");
    expect(r.finalGrade).toBeNull();
    expect(r.pd12m).toBeNull();
  });

  it("laisse UNCALIBRATED et aucune PD sur un modèle sans calibration", () => {
    const sansCal: ModelConfig = { ...CORP_STD_V1, calibration: undefined };
    const r = computeRating(sansCal, dossier(), "2025-12-31T12:00:00.000Z");
    expect(r.pdStatus).toBe("UNCALIBRATED");
    expect(r.pd12m).toBeNull();
    expect(r.calibrationId).toBeNull();
  });

  it("suit le grade et non le score : deux dossiers de même score plafonnés différemment reçoivent des PD différentes", () => {
    // Même dossier, l'un plafonné par CAP01 (moins de deux ans, sans support).
    const libre = computeRating(CORP_STD_V1, dossier(), "2025-12-31T12:00:00.000Z");
    const plafonne = computeRating(
      CORP_STD_V1,
      dossier({ structuralFlags: { companyAgeYears: 1.2, hasStrongGroupSupport: false } }),
      "2025-12-31T12:00:00.000Z"
    );
    expect(plafonne.rawScore).toBe(libre.rawScore);
    expect(plafonne.finalGrade).not.toBe(libre.finalGrade);
    expect(plafonne.pd12m!).toBeGreaterThan(libre.pd12m!);
  });
});

describe("chaîne de calibration", () => {
  it("est reproductible : même graine, même empreinte de contenu", () => {
    const faire = () => {
      const sim = simulatePortfolio({ model: CORP_STD_V1, seed: 4321, cohorts: 4, obligorsPerCohort: 1200 });
      const samples = buildSamples(sim.obligors, 3, 0.3, 99);
      return fitCalibration({
        model: CORP_STD_V1,
        samples,
        seed: 4321,
        calibrationId: "TEST",
        bootstrapReplicates: 20,
      }).calibration;
    };
    expect(faire().contentHash).toBe(faire().contentHash);
  });

  it("refuse un échantillon de développement trop faible", () => {
    const sim = simulatePortfolio({ model: CORP_STD_V1, seed: 7, cohorts: 2, obligorsPerCohort: 200 });
    const samples = buildSamples(sim.obligors, 1, 0.3, 1);
    expect(() =>
      fitCalibration({ model: CORP_STD_V1, samples, seed: 7, calibrationId: "T", bootstrapReplicates: 5 })
    ).toThrow(/trop faible/);
  });

  it("écarte les contreparties déjà en défaut de tous les échantillons", () => {
    const sim = simulatePortfolio({ model: CORP_STD_V1, seed: 55, cohorts: 3, obligorsPerCohort: 1500 });
    const samples = buildSamples(sim.obligors, 2, 0.3, 3);
    expect(samples.excluded.alreadyInDefault).toBeGreaterThan(0);
    const total = samples.development.length + samples.holdout.length + samples.outOfTime.length;
    expect(total + samples.excluded.alreadyInDefault + samples.excluded.blocked + samples.excluded.noGrade).toBe(
      samples.excluded.total
    );
  });

  it("sépare le hors-période par cohortes entières et postérieures", () => {
    const sim = simulatePortfolio({ model: CORP_STD_V1, seed: 8, cohorts: 5, obligorsPerCohort: 800 });
    const samples = buildSamples(sim.obligors, 3, 0.3, 2);
    expect(Math.min(...samples.outOfTime.map((o) => o.cohort))).toBe(3);
    expect(Math.max(...samples.development.map((o) => o.cohort))).toBe(2);
    expect(Math.max(...samples.holdout.map((o) => o.cohort))).toBe(2);
  });
});
