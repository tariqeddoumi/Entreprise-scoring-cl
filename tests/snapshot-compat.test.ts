import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import { compareRuns } from "@/core/compare";
import { getModel } from "@/models";
import { isV3Snapshot, readResultSnapshot } from "@/lib/snapshot-compat";
import { tpeGoldenInput } from "./fixtures";

/**
 * Compatibilité des instantanés persistés.
 *
 * Un instantané est immuable : une base en exploitation contient donc des
 * résultats produits par des moteurs antérieurs. Les composants V3 les
 * déréférencent sans garde (`result.coverage.globalObservedBps`,
 * `result.appliedRules.map`), ce qui faisait planter la consultation d'une
 * notation d'archive et l'attribution d'écart. Ces tests fixent le contrat :
 * un ancien instantané est RECONNU, jamais converti en silence.
 */

/** Forme réellement écrite par le moteur v1, telle qu'on la trouve en base. */
function legacyV1Snapshot(): Record<string, unknown> {
  return {
    modelId: "CORP_STD_V1",
    modelVersion: "1.0.0",
    engineVersion: "1.0.0",
    asOfDate: "2026-01-31",
    segment: "TPE",
    outcome: "SCORED",
    rawScore: 64.5,
    confidenceScore: 92.5,
    applicableWeightBps: 10000,
    engineGrade: "G5",
    cappedGrade: "G5",
    finalGrade: "G5",
    explanationFr: "Score brut 64,50 / 100 → grade G5.",
    appliedCaps: [{ code: "CAP06", labelFr: "DSCR < 1", maxGrade: "G7" }],
    domainResults: [{ code: "D1", labelFr: "Rentabilité", score: 61 }],
    triggeredRedFlags: [],
  };
}

describe("lecture d'un instantané persisté", () => {
  const model = getModel("CORP_STD_V1")!;

  it("reconnaît un instantané produit par le moteur courant", () => {
    const result = computeRating(model, tpeGoldenInput());
    const read = readResultSnapshot(JSON.stringify(result));
    expect(read.kind).toBe("V3");
    if (read.kind !== "V3") throw new Error("instantané courant non reconnu");
    expect(read.result.finalGrade).toBe(result.finalGrade);
    expect(read.result.coverage.globalObservedBps).toBe(result.coverage.globalObservedBps);
  });

  it("reconnaît un instantané v1 comme archive, sans inventer les champs absents", () => {
    const read = readResultSnapshot(JSON.stringify(legacyV1Snapshot()));
    expect(read.kind).toBe("LEGACY");
    if (read.kind !== "LEGACY") throw new Error("instantané v1 accepté à tort");
    expect(read.reasonFr).toContain("moteur antérieur");
    // Les champs de la forme ancienne servent à motiver le refus.
    expect(read.reasonFr).toContain("confidenceScore");
    expect(read.reasonFr).toContain("appliedCaps");
    // Rien n'est reconstitué : ni couverture, ni classe de confiance.
    expect(read.raw).not.toHaveProperty("coverage");
    expect(read.raw).not.toHaveProperty("confidence");
    expect(read.raw.finalGrade).toBe("G5");
  });

  it("refuse un JSON illisible plutôt que de propager l'exception", () => {
    const read = readResultSnapshot("{ ceci n'est pas du JSON");
    expect(read.kind).toBe("UNREADABLE");
  });

  it("refuse un instantané tronqué à mi-chemin entre les deux formes", () => {
    // Le champ `coverage` seul ne suffit pas : les composants lisent aussi
    // `confidence`, `usageRights` et `appliedRules`.
    const partial = { ...legacyV1Snapshot(), coverage: { globalObservedBps: 9000 } };
    expect(isV3Snapshot(partial)).toBe(false);
    expect(readResultSnapshot(JSON.stringify(partial)).kind).toBe("LEGACY");
  });

  it("la comparaison n'est jamais appelée sur un instantané v1", () => {
    // Le garde existe parce que compareRuns déréférence `appliedRules` : sans
    // lui, la fiche contrepartie et POST /rating-runs/compare échouaient.
    const legacy = legacyV1Snapshot() as unknown as Parameters<typeof compareRuns>[0];
    expect(() => compareRuns(legacy, legacy)).toThrow();
    expect(readResultSnapshot(JSON.stringify(legacyV1Snapshot())).kind).not.toBe("V3");
  });
});
