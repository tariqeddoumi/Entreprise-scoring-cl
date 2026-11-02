import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1, gradesRequiredByModels, withMasterScale } from "@/models";
import { checkNewVersion } from "@/lib/rating-scale";
import {
  DEFAULT_MASTER_SCALE,
  effectiveVersion,
  validateMasterScale,
  type MasterScaleVersion,
} from "@/reference/rating-scale";
import { tpeGoldenInput } from "./fixtures";

const AT = "2026-09-17T00:00:00Z";

function version(over: Partial<MasterScaleVersion> = {}): MasterScaleVersion {
  return { ...JSON.parse(JSON.stringify(DEFAULT_MASTER_SCALE)), version: "ECH10-2027.1", effectiveFrom: "2027-01-01", ...over };
}

describe("Échelle maîtresse : validation d'une version", () => {
  it("accepte la version embarquée et ses plafonds", () => {
    expect(validateMasterScale(DEFAULT_MASTER_SCALE, gradesRequiredByModels())).toEqual([]);
    expect(gradesRequiredByModels()).toEqual(["7", "8"]);
  });

  it("refuse des bornes non décroissantes, une dernière classe bornée, un code DEF", () => {
    const v = version();
    v.bands[3].minScore = 95;
    v.bands[9].minScore = 10;
    v.bands[0].grade = "DEF9";
    const issues = validateMasterScale(v).join(" ");
    expect(issues).toMatch(/inférieur à celui de la classe/);
    expect(issues).toMatch(/dernière classe/);
    expect(issues).toMatch(/réservés au défaut/);
  });

  it("refuse une version qui supprimerait une classe citée par un plafond", () => {
    const v = version({ bands: DEFAULT_MASTER_SCALE.bands.filter((b) => b.grade !== "8").map((b, i, a) => (i === a.length - 1 ? { ...b, minScore: null } : b)) });
    expect(validateMasterScale(v, gradesRequiredByModels()).join(" ")).toMatch(/Classe 8 absente/);
  });
});

describe("Échelle maîtresse : gouvernance des versions", () => {
  const all = [DEFAULT_MASTER_SCALE];

  it("refuse une date d'effet passée et une version déjà existante", () => {
    expect(checkNewVersion(all, version({ effectiveFrom: "2026-10-01" }), "2026-11-02").join(" ")).toMatch(/antérieure à aujourd'hui/);
    expect(checkNewVersion(all, version({ version: DEFAULT_MASTER_SCALE.version }), "2026-11-02").join(" ")).toMatch(/existe déjà/);
  });

  it("fige une version en vigueur : elle ne se modifie pas", () => {
    expect(checkNewVersion(all, version(), "2026-11-02", DEFAULT_MASTER_SCALE.version).join(" ")).toMatch(/figée/);
  });

  it("accepte une nouvelle version future valide", () => {
    expect(checkNewVersion(all, version(), "2026-11-02")).toEqual([]);
  });

  it("applique la version en vigueur à la date de calcul", () => {
    const next = version();
    expect(effectiveVersion([DEFAULT_MASTER_SCALE, next], "2026-12-31").version).toBe("ECH10-2026.1");
    expect(effectiveVersion([DEFAULT_MASTER_SCALE, next], "2027-01-01").version).toBe("ECH10-2027.1");
  });
});

describe("Échelle maîtresse : application aux modèles", () => {
  it("la version embarquée laisse le modèle et sa calibration intacts", () => {
    expect(withMasterScale(CORP_STD_V1, DEFAULT_MASTER_SCALE)).toBe(CORP_STD_V1);
  });

  it("une autre version change les classes et retire la PD synthétique", () => {
    const v = version();
    v.bands[5].minScore = 66; // classe 6 : 66 à 70 au lieu de 64 à 70
    const m = withMasterScale(CORP_STD_V1, v);
    expect(m.gradeScale.scaleId).toBe("ECH10-2027.1");
    expect(m.calibration).toBeUndefined();
    expect(m.pdStatus).toBe("UNCALIBRATED");
    const r = computeRating(m, tpeGoldenInput(), AT);
    // 64,50 : classe 6 sur la version embarquée, classe 7 sur la nouvelle.
    expect(computeRating(CORP_STD_V1, tpeGoldenInput(), AT).finalGrade).toBe("6");
    expect(r.finalGrade).toBe("7");
    expect(r.gradeScaleId).toBe("ECH10-2027.1");
    expect(r.pd12m).toBeNull();
  });

  it("une échelle à 12 classes s'applique aussi aux grilles TPE", () => {
    const bands = [95, 90, 85, 80, 75, 70, 64, 57, 48, 40, 30, null].map((min, i) => ({
      grade: String(i + 1),
      minScore: min,
      labelFr: `Classe ${i + 1}`,
    }));
    const m = withMasterScale(CORP_TPE_BEHAV_V1, version({ bands }));
    expect(m.gradeScale.bands).toHaveLength(12);
  });
});
