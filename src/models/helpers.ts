import type { Bin, CriterionScore, QualitativeAnchor } from "@/core/types";

/**
 * Construit un barème à 5 bandes à partir de 4 seuils, du meilleur au pire.
 *
 * direction HIGHER_IS_BETTER, thresholds [t100, t75, t50, t25] :
 *   [t100, +∞[ => 100 ; [t75, t100[ => 75 ; ... ; ]-∞, t25[ => 0
 * direction LOWER_IS_BETTER, thresholds [t100, t75, t50, t25] :
 *   ]-∞, t100] => 100 ; ]t100, t75] => 75 ; ... ; ]t25, +∞[ => 0
 */
export function bins5(
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER",
  thresholds: [number, number, number, number]
): Bin[] {
  const [t100, t75, t50, t25] = thresholds;
  if (direction === "HIGHER_IS_BETTER") {
    return [
      { min: t100, max: null, minInclusive: true, maxInclusive: true, score: 100 },
      { min: t75, max: t100, minInclusive: true, maxInclusive: false, score: 75 },
      { min: t50, max: t75, minInclusive: true, maxInclusive: false, score: 50 },
      { min: t25, max: t50, minInclusive: true, maxInclusive: false, score: 25 },
      { min: null, max: t25, minInclusive: true, maxInclusive: false, score: 0 },
    ];
  }
  return [
    { min: null, max: t100, minInclusive: true, maxInclusive: true, score: 100 },
    { min: t100, max: t75, minInclusive: false, maxInclusive: true, score: 75 },
    { min: t75, max: t50, minInclusive: false, maxInclusive: true, score: 50 },
    { min: t50, max: t25, minInclusive: false, maxInclusive: true, score: 25 },
    { min: t25, max: null, minInclusive: false, maxInclusive: true, score: 0 },
  ];
}

/** Ancrages qualitatifs 100/75/50/25/0 à partir de 5 libellés. */
export function anchors(
  a100: string,
  a75: string,
  a50: string,
  a25: string,
  a0: string
): QualitativeAnchor[] {
  const scores: CriterionScore[] = [100, 75, 50, 25, 0];
  return [a100, a75, a50, a25, a0].map((labelFr, i) => ({
    score: scores[i],
    labelFr,
  }));
}
