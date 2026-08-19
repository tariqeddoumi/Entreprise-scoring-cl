import type {
  ConfidenceCapBand,
  ConfidenceInput,
  ConfidenceWeights,
} from "./types";

export interface ConfidenceResult {
  score: number;
  levelFr: string;
  maxGrade: string | "NO_GRADE" | "NONE";
}

/**
 * Score de confiance (grilles §15.1) :
 * Confiance = 35% × Complétude + 20% × Fraîcheur + 30% × Fiabilité + 15% × Provenance
 * Chaque composante est notée 0/25/50/75/100. Les pondérations sont
 * paramétrées dans la version de modèle (somme = 100, contrôlée au chargement).
 */
export function computeConfidence(
  input: ConfidenceInput,
  weights: ConfidenceWeights,
  caps: ConfidenceCapBand[]
): ConfidenceResult {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error(`Composante de confiance invalide : ${k}=${v}`);
    }
  }
  const score =
    (input.completeness * weights.completeness +
      input.freshness * weights.freshness +
      input.reliability * weights.reliability +
      input.provenance * weights.provenance) /
    100;

  for (const band of caps) {
    const okMin = score >= band.minConfidence;
    const okMax = band.maxConfidence === null || score < band.maxConfidence;
    if (okMin && okMax) {
      return { score, levelFr: band.levelFr, maxGrade: band.maxGrade };
    }
  }
  throw new Error(`Bandes de confiance non exhaustives pour le score ${score}`);
}
