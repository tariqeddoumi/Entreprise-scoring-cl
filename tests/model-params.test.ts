import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import { validateModel } from "@/core/validate-model";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "@/models";
import { buildModel, checkParamVersion, effectiveParams } from "@/lib/model-params";
import { DEFAULT_MASTER_SCALE } from "@/reference/rating-scale";
import {
  applyModelParams,
  binsFrom,
  paramsOf,
  thresholdsOf,
  type ModelParamVersion,
} from "@/reference/model-params";
import { tpeGoldenInput } from "./fixtures";

const AT = "2026-09-17T00:00:00Z";

function version(over: Partial<ModelParamVersion> = {}, model = CORP_STD_V1): ModelParamVersion {
  return {
    version: "CORP_STD_V1-P2027.1",
    modelId: model.modelId,
    baseVersion: model.version,
    effectiveFrom: "2027-01-01",
    labelFr: "Essai",
    params: paramsOf(model),
    ...over,
  };
}

describe("Paramétrage des grilles : aller-retour", () => {
  it("les paramètres lus puis réappliqués redonnent exactement le même calcul", () => {
    const m = applyModelParams(CORP_STD_V1, version());
    expect(validateModel(m)).toEqual([]);
    const a = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    const b = computeRating(m, tpeGoldenInput(), AT);
    expect(b.rawScore).toBe(a.rawScore);
    expect(b.finalGrade).toBe(a.finalGrade);
    expect(b.modelVersion).toBe("3.2.0+CORP_STD_V1-P2027.1");
    expect(m.calibration).toBeUndefined();
  });

  it("lit et reconstruit un barème à cinq paliers à l'identique", () => {
    for (const c of CORP_STD_V1.criteria) {
      for (const bins of Object.values(c.binsBySegment ?? {})) {
        const t = thresholdsOf(bins);
        if (t) expect(binsFrom(t.direction, t.t)).toEqual(bins);
      }
    }
  });
});

describe("Paramétrage des grilles : modifications", () => {
  it("un poids déplacé entre deux critères change le score, la somme restant à 100 %", () => {
    const v = version();
    const c = v.params.criteria;
    // D1.4 (fonds propres, 75 sur le dossier) gagne 1 point, D1.2 (marge, 50) en perd 1.
    c["D1.4"].weightsBps.TPE = (c["D1.4"].weightsBps.TPE ?? 0) + 100;
    c["D1.2"].weightsBps.TPE = (c["D1.2"].weightsBps.TPE ?? 0) - 100;
    const m = applyModelParams(CORP_STD_V1, v);
    expect(validateModel(m)).toEqual([]);
    expect(computeRating(m, tpeGoldenInput(), AT).rawScore).not.toBe(computeRating(CORP_STD_V1, tpeGoldenInput(), AT).rawScore);
  });

  it("refuse un critère au-delà du plafond de concentration (6 %)", () => {
    const v = version();
    v.params.criteria["D3.1"].weightsBps.TPE = (v.params.criteria["D3.1"].weightsBps.TPE ?? 0) + 100;
    v.params.criteria["D7.1"].weightsBps.TPE = (v.params.criteria["D7.1"].weightsBps.TPE ?? 0) - 100;
    expect(checkParamVersion([], v, DEFAULT_MASTER_SCALE, "2026-11-02").join(" ")).toMatch(/plafond/);
  });

  it("refuse des poids qui ne font plus 100 %", () => {
    const v = version();
    v.params.criteria["D3.1"].weightsBps.TPE = (v.params.criteria["D3.1"].weightsBps.TPE ?? 0) + 50;
    expect(checkParamVersion([], v, DEFAULT_MASTER_SCALE, "2026-11-02").join(" ")).toMatch(/10000/);
  });

  it("un seuil de barème modifié s'applique (D2.2 : 100 dès 1,5 au lieu de la valeur embarquée)", () => {
    const v = version();
    const t = v.params.criteria["D2.2"].thresholds!;
    const seg = (Object.keys(t)[0] ?? "ALL") as keyof typeof t;
    t[seg] = [1.5, 1.3, 1.1, 1.0];
    const m = applyModelParams(CORP_STD_V1, v);
    expect(thresholdsOf(m.criteria.find((x) => x.code === "D2.2")!.binsBySegment![seg])!.t).toEqual([1.5, 1.3, 1.1, 1.0]);
  });

  it("le seuil d'une exception et son grade plafond se paramètrent", () => {
    const v = version();
    v.params.rules.NC01 = { maxGrade: "9", threshold: 1.1 };
    const m = applyModelParams(CORP_STD_V1, v);
    const r = m.nonCompensatoryRules.find((x) => x.code === "NC01")!;
    expect(r.maxGrade).toBe("9");
    expect(r.derivation!.threshold).toBe(1.1);
    expect(validateModel(m)).toEqual([]);
  });

  it("ajoute un critère qualitatif et en retire un autre", () => {
    const v = version();
    const out = v.params.criteria["D4.3"];
    v.params.removed = ["D4.3"];
    v.params.added = [
      {
        code: "D4.9",
        domainCode: "D4",
        type: "QUALITATIVE",
        labelFr: "Dépendance à un donneur d'ordre",
        weightsBps: { ...out.weightsBps },
        critical: false,
        unavailableScore: 0,
        anchors: ["Aucune", "Faible", "Modérée", "Forte", "Totale"],
      },
    ];
    expect(checkParamVersion([], v, DEFAULT_MASTER_SCALE, "2026-11-02")).toEqual([]);
    const m = applyModelParams(CORP_STD_V1, v);
    expect(m.criteria.some((c) => c.code === "D4.3")).toBe(false);
    expect(m.criteria.find((c) => c.code === "D4.9")!.anchors).toHaveLength(5);
  });

  it("refuse le retrait d'un critère auquel se rattache une exception", () => {
    const v = version();
    v.params.removed = ["D2.2"];
    expect(checkParamVersion([], v, DEFAULT_MASTER_SCALE, "2026-11-02").join(" ")).toMatch(/NC01/);
  });

  it("refuse une date d'effet passée et fige une version en vigueur", () => {
    const passed = version({ effectiveFrom: "2026-10-01" });
    expect(checkParamVersion([], passed, DEFAULT_MASTER_SCALE, "2026-11-02").join(" ")).toMatch(/antérieure/);
    const live = version({ version: "CORP_STD_V1-P2026.1", effectiveFrom: "2026-11-01" });
    expect(checkParamVersion([live], version(), DEFAULT_MASTER_SCALE, "2026-11-02", live.version).join(" ")).toMatch(/figée/);
  });

  it("applique la version en vigueur à la date de calcul, grille par grille", () => {
    const a = version({ version: "A", effectiveFrom: "2027-01-01" });
    const b = version({ version: "B", effectiveFrom: "2027-06-01" });
    const t = version({ version: "T", effectiveFrom: "2027-01-01", modelId: CORP_TPE_BEHAV_V1.modelId, baseVersion: CORP_TPE_BEHAV_V1.version, params: paramsOf(CORP_TPE_BEHAV_V1) });
    expect(effectiveParams([a, b, t], "CORP_STD_V1", "2026-12-31")).toBeNull();
    expect(effectiveParams([a, b, t], "CORP_STD_V1", "2027-03-01")!.version).toBe("A");
    expect(effectiveParams([a, b, t], "CORP_STD_V1", "2027-06-01")!.version).toBe("B");
    expect(effectiveParams([a, b, t], "CORP_TPE_BEHAV_V1", "2027-06-01")!.version).toBe("T");
  });

  it("assemble grille, paramètres et échelle", () => {
    const m = buildModel(CORP_STD_V1, version(), DEFAULT_MASTER_SCALE);
    expect(m.gradeScale.scaleId).toBe("ECH10-2026.1");
    expect(m.version).toBe("3.2.0+CORP_STD_V1-P2027.1");
  });
});
