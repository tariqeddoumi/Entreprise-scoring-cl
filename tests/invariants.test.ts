import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import type { Bin, CriterionConfig, CriterionInput, ModelConfig, RatingInput, Segment } from "@/core/types";
import { listModels } from "@/models";
import { routeModel } from "@/reference/segmentation";

/**
 * Invariants métier exigés par le diagnostic du 1er novembre 2026 (T05) :
 * vérifiés sur TOUS les critères de TOUS les modèles, pas sur un vecteur.
 */

const AT = "2026-06-30T12:00:00.000Z";

/** Une valeur située dans la bande qui donne `score`, ou null si aucune bande ne le donne. */
function valueFor(bins: Bin[], score: number): number | null {
  const b = bins.find((x) => x.score === score);
  if (!b) return null;
  if (b.min !== null && b.max !== null) return (b.min + b.max) / 2;
  if (b.min !== null) return b.min + (b.minInclusive ? 0 : 0.01) + 1;
  if (b.max !== null) return b.max - (b.maxInclusive ? 0 : 0.01) - 1;
  return 0;
}

function inputFor(c: CriterionConfig, segment: Segment, score: number): CriterionInput | null {
  if (c.type === "QUALITATIVE") return { status: "AVAILABLE", score: score as CriterionInput["score"] };
  const bins = c.binsBySegment?.[segment] ?? c.binsBySegment?.ALL;
  if (!bins) return null;
  const v = valueFor(bins, score);
  return v === null ? null : { status: "AVAILABLE", value: v };
}

/** Dossier complet à 75 partout, matérialités justifiées, routage conforme. */
function baseInput(model: ModelConfig, segment: Segment): RatingInput {
  const criteria: Record<string, CriterionInput> = {};
  for (const c of model.criteria) {
    const ci = inputFor(c, segment, 75) ?? inputFor(c, segment, 100) ?? inputFor(c, segment, 50);
    if (ci) criteria[c.code] = ci;
  }
  const gates = [...new Set(model.criteria.map((c) => c.materialityGate?.flag).filter(Boolean) as string[])];
  return {
    modelId: model.modelId,
    segment,
    asOfDate: "2026-06-30",
    criteria,
    confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
    materiality: Object.fromEntries(gates.map((g) => [g, true])),
    routing: { reliableFinancialStatements: model.routeFamily === "STANDARD", behavioralHistoryMonths: 36 },
  };
}

describe("Une information absente n'améliore jamais le score (M01, T05)", () => {
  for (const model of listModels()) {
    for (const segment of model.segments) {
      it(`${model.modelId} · ${segment} : chaque critère, chaque niveau`, () => {
        const base = baseInput(model, segment);
        let checked = 0;
        for (const c of model.criteria) {
          if ((c.weightsBps[segment] ?? 0) === 0 || c.unavailablePolicy === "BLOCK") continue;
          for (const s of [0, 25, 50, 75, 100]) {
            const ci = inputFor(c, segment, s);
            if (!ci) continue;
            const observed = computeRating(model, { ...base, criteria: { ...base.criteria, [c.code]: ci } }, AT);
            const missing = computeRating(model, { ...base, criteria: { ...base.criteria, [c.code]: { status: "MISSING" } } }, AT);
            expect(observed.rawScore, `${c.code} observé à ${s}`).not.toBeNull();
            expect(missing.rawScore!, `${c.code} effacé alors qu'il valait ${s}`).toBeLessThanOrEqual(observed.rawScore! + 1e-9);
            checked += 1;
          }
        }
        expect(checked).toBeGreaterThan(20);
      });
    }
  }
});

describe("Noyau obligatoire et porte de données (M08)", () => {
  it.each([
    ["CORP_STD_V1", ["D1.4", "D1.5", "D1.6", "D2.2", "D3.1"]],
    ["CORP_TPE_BEHAV_V1", ["B1.1", "B1.3", "B2.1", "B2.3", "B5.2"]],
  ])("%s bloque sans %s", (id, codes) => {
    const model = listModels().find((m) => m.modelId === id)!;
    for (const code of codes as string[]) {
      expect(model.criteria.find((c) => c.code === code)!.unavailablePolicy, code).toBe("BLOCK");
    }
  });
});

describe("Routage serveur (M06, M07)", () => {
  it("exige 24 mois d'historique pour le modèle comportemental ; 12 à 23 mois : analyse courte", () => {
    expect(routeModel({ segment: "TPE", reliableFinancialStatements: false, behavioralHistoryMonths: 24 }).family).toBe("BEHAVIORAL");
    const court = routeModel({ segment: "TPE", reliableFinancialStatements: false, behavioralHistoryMonths: 18 });
    expect(court.family).toBeNull();
    expect(court.explanationFr).toContain("analyse courte");
  });

  it("refuse le modèle comportemental à une TPE dont les comptes sont exploitables", () => {
    const tpe = listModels().find((m) => m.modelId === "CORP_TPE_BEHAV_V1")!;
    const input = { ...baseInput(tpe, "TPE"), routing: { reliableFinancialStatements: true, behavioralHistoryMonths: 36 } };
    const r = computeRating(tpe, input, AT);
    expect(r.ratingStatus).toBe("NO_RATING_ROUTED_OTHER_MODEL");
    expect(r.routingFr).toContain("modèle standard");
  });

  it("refuse le modèle comportemental sans éléments de routage", () => {
    const tpe = listModels().find((m) => m.modelId === "CORP_TPE_BEHAV_V1")!;
    const { routing: _r, ...sans } = baseInput(tpe, "TPE");
    expect(computeRating(tpe, sans, AT).ratingStatus).toBe("NO_RATING_ROUTED_OTHER_MODEL");
  });

  it("le défaut prime sur un refus de routage (M11)", () => {
    const tpe = listModels().find((m) => m.modelId === "CORP_TPE_BEHAV_V1")!;
    const input = { ...baseInput(tpe, "TPE"), routing: { reliableFinancialStatements: true, behavioralHistoryMonths: 36 }, defaultTriggered: true };
    const r = computeRating(tpe, input, AT);
    expect(r.ratingStatus).toBe("DEFAULTED");
    expect(r.finalGrade).toBe("DEF1");
  });

  it("le défaut prime sur un segment hors modèle (M11)", () => {
    const tpe = listModels().find((m) => m.modelId === "CORP_TPE_BEHAV_V1")!;
    const input = { ...baseInput(tpe, "TPE"), segment: "GE" as const, routing: undefined, defaultTriggered: true };
    expect(computeRating(tpe, input, AT).ratingStatus).toBe("DEFAULTED");
  });
});

describe("Confiance, horloge et droits d'usage (M05, M10, M12)", () => {
  const std = listModels().find((m) => m.modelId === "CORP_STD_V1")!;

  it("une complétude déclarée ne dépasse jamais la part du poids observée", () => {
    const base = baseInput(std, "PME");
    const criteria = { ...base.criteria };
    for (const c of std.criteria) if (c.unavailablePolicy !== "BLOCK" && c.type === "QUALITATIVE") criteria[c.code] = { status: "MISSING" };
    const r = computeRating(std, { ...base, criteria }, AT);
    expect(r.confidence.score).toBeLessThan(100);
  });

  it("sans horodatage fourni, le résultat est daté de l'arrêté : jamais l'horloge du serveur", () => {
    const r = computeRating(std, baseInput(std, "PME"));
    expect(r.computedAt).toBe("2026-06-30T00:00:00.000Z");
  });

  it("aucun modèle n'est qualifié de production sans approbation d'usage en vigueur", () => {
    const observed: ModelConfig = {
      ...std,
      status: "PUBLISHED",
      calibration: { ...std.calibration!, dataSource: "OBSERVED" },
    };
    expect(computeRating(observed, baseInput(std, "PME"), AT).usageRights.purpose).toBe("PILOT_SHADOW");
    const approved = computeRating(observed, baseInput(std, "PME"), {
      nowIso: AT,
      useApproval: { approvalId: "AP-1", purpose: "PRODUCTION_RATING", validFrom: "2026-01-01", validTo: null },
    });
    expect(approved.usageRights.purpose).toBe("PRODUCTION_RATING");
  });
});
