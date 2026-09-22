import { describe, expect, it } from "vitest";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "@/models";
import { validateModel, domainWeightBps } from "@/core/validate-model";
import { gradeRank } from "@/core/grades";
import { DEFAULT_GRADES } from "@/reference/default-policy";
import { checkBins } from "@/core/binning";
import {
  CAP_TRIGGER_TO_FLAG,
  RETIRED_CAP_OBSERVATIONS,
  unmappedTriggers,
} from "@/core/structural-flags";
import { ratingRequestSchema } from "@/lib/schemas";

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

/**
 * Cohérence entre les cases du formulaire et ce que le moteur évalue.
 *
 * L'assistant de notation proposait encore cinq plafonds retirés en V3 :
 * les cocher ne changeait ni le grade ni le résultat, et rien ne le signalait.
 * Un analyste pouvait croire avoir posé un garde-fou structurel. La liste des
 * exceptions est désormais dérivée du modèle chargé ; ces tests interdisent que
 * les deux inventaires divergent de nouveau.
 */
describe("Exceptions non compensatoires et constats retirés", () => {
  const MODELS = [CORP_STD_V1, CORP_TPE_BEHAV_V1];

  it("chaque exception du modèle est saisissable depuis l'interface", () => {
    for (const model of MODELS) {
      for (const rule of model.nonCompensatoryRules) {
        expect(
          CAP_TRIGGER_TO_FLAG[rule.trigger],
          `${model.modelId} / ${rule.code} : le déclencheur ${rule.trigger} n'est porté par aucun champ d'entrée`
        ).toBeDefined();
      }
    }
    expect(unmappedTriggers(MODELS.flatMap((m) => m.nonCompensatoryRules.map((r) => r.trigger)))).toEqual([]);
  });

  it("aucun constat déclaré retiré n'est en réalité encore évalué", () => {
    const activeTriggers = new Set(
      MODELS.flatMap((m) => m.nonCompensatoryRules.map((r) => r.trigger))
    );
    for (const observation of RETIRED_CAP_OBSERVATIONS) {
      expect(
        activeTriggers.has(observation.trigger),
        `${observation.trigger} est présenté comme sans effet alors qu'un modèle l'évalue`
      ).toBe(false);
      expect(observation.treatmentFr.length).toBeGreaterThan(20);
    }
  });

  it("aucun constat n'apparaît à la fois comme exception et comme observation", () => {
    const observed = RETIRED_CAP_OBSERVATIONS.map((o) => o.flag);
    const active = Object.values(CAP_TRIGGER_TO_FLAG);
    expect(observed.filter((f) => active.includes(f))).toEqual([]);
  });

  it("les constats retirés restent des entrées connues du schéma", () => {
    // Retirer l'effet sur le grade n'est pas retirer l'information : elle reste
    // enregistrée avec le dossier et alimente red flags et calibration.
    const parsed = ratingRequestSchema.safeParse({
      modelId: "CORP_STD_V1",
      segment: "TPE",
      asOfDate: "2026-01-31",
      criteria: {},
      confidence: { completeness: 80, freshness: 80, reliability: 80, provenance: 80 },
      structuralFlags: Object.fromEntries(
        RETIRED_CAP_OBSERVATIONS.map((o) => [o.flag, true])
      ),
    });
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});

/**
 * Ordre des grades — invariant d'affichage.
 *
 * Le tableau de bord classait les grades avec une copie locale du rang, écrite
 * pour l'échelle G1…G10 : elle lisait le nombre après la première lettre. Sur
 * « STD-P5 » elle ne lisait rien et repliait sur une valeur unique, si bien que
 * tous les grades performants devenaient ex æquo — et que les grades de défaut,
 * eux correctement numérotés, passaient DEVANT. Un tableau de risque affichait
 * donc les défauts en tête, à la place des meilleures notes.
 *
 * Le rang vient désormais de l'échelle publiée. Ces tests fixent l'ordre que
 * tout affichage doit respecter.
 */
describe("Ordre des grades dans une échelle", () => {
  for (const model of [CORP_STD_V1, CORP_TPE_BEHAV_V1]) {
    it(`${model.modelId} — le rang suit l'ordre déclaré de l'échelle`, () => {
      const ranks = model.gradeScale.bands.map((b) => gradeRank(model.gradeScale, b.grade));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(new Set(ranks).size).toBe(ranks.length); // aucun ex æquo
    });

    it(`${model.modelId} — tout grade de défaut est pire que tout grade performant`, () => {
      const worstPerforming = Math.max(
        ...model.gradeScale.bands.map((b) => gradeRank(model.gradeScale, b.grade))
      );
      for (const def of DEFAULT_GRADES) {
        expect(
          gradeRank(model.gradeScale, def.grade),
          `${def.grade} doit se classer après le dernier grade performant`
        ).toBeGreaterThan(worstPerforming);
      }
    });

    it(`${model.modelId} — un grade d'une autre échelle est refusé, jamais classé`, () => {
      // Un grade d'archive (G5) ne doit pas recevoir un rang silencieux : un
      // affichage qui le rangerait lui donnerait un sens qu'il n'a plus.
      expect(() => gradeRank(model.gradeScale, "G5")).toThrow();
    });
  }
});
