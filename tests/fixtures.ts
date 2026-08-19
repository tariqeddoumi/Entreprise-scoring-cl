import type { CriterionInput, RatingInput } from "@/core/types";

/** Confiance parfaite : aucune contrainte liée à la donnée. */
export const FULL_CONFIDENCE = {
  completeness: 100,
  freshness: 100,
  reliability: 100,
  provenance: 100,
};

function q(score: 0 | 25 | 50 | 75 | 100): CriterionInput {
  return { status: "AVAILABLE", score };
}
function v(value: number): CriterionInput {
  return { status: "AVAILABLE", value };
}

/**
 * Golden vector TPE — exemple 21.1 des grilles pour D1 (score domaine 61,00),
 * complété par des scores uniformes contrôlés sur les autres domaines :
 * D2 = 50, D3 = 75, D4 = 50, D5 = 75, D6 = 75, D7 = 50.
 *
 * Score global attendu :
 * 61×0,25 + 50×0,10 + 75×0,25 + 50×0,15 + 75×0,15 + 75×0,07 + 50×0,03 = 64,50 → G7.
 */
export function tpeGoldenInput(): RatingInput {
  return {
    modelId: "CORP_STD_V1",
    segment: "TPE",
    asOfDate: "2026-08-18",
    confidence: { ...FULL_CONFIDENCE },
    criteria: {
      // D1 — exemple 21.1 : 75/50/50/75/50/75/50/50 → 61,00
      "D1.1": q(75),
      "D1.2": q(50),
      "D1.3": q(50),
      "D1.4": v(30), // [25,35[ => 75
      "D1.5": v(3), // ]2,3.5] => 50
      "D1.6": v(1.3), // [1.25,1.5[ => 75
      "D1.7": q(50),
      "D1.8": v(60), // [50,70[ => 50
      // D2 — uniforme 50
      "D2.1": v(2.5), // [2,3[ => 50
      "D2.2": v(1.2), // [1.15,1.3[ => 50
      "D2.3": v(8), // [5,12[ => 50
      "D2.4": q(50),
      "D2.5": v(1.1), // [1.0,1.2[ => 50
      "D2.6": q(50),
      // D3 — uniforme 75
      "D3.1": v(5), // ]0,7] => 75
      "D3.2": q(75),
      "D3.3": q(75),
      "D3.4": v(100), // [90,110[ => 75
      "D3.5": q(75),
      "D3.6": q(75),
      "D3.7": q(75),
      // D4 — uniforme 50
      "D4.1": q(50),
      "D4.2": q(50),
      "D4.3": q(50),
      "D4.4": q(50),
      "D4.5": q(50),
      "D4.6": q(50),
      "D4.7": q(50),
      "D4.8": q(50),
      // D5 — uniforme 75
      "D5.1": q(75),
      "D5.2": q(75),
      "D5.3": q(75),
      "D5.4": q(75),
      "D5.5": q(75),
      "D5.6": q(75),
      "D5.7": q(75),
      // D6 — uniforme 75
      "D6.1": q(75),
      "D6.2": v(150), // ]120,180] => 75 (TPE)
      "D6.3": v(4), // ]2,5] => 75
      "D6.4": q(75),
      "D6.5": q(75),
      // D7 — uniforme 50
      "D7.1": q(50),
      "D7.2": q(50),
      "D7.3": q(50),
      "D7.4": q(50),
    },
  };
}
