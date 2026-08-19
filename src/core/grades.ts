import type { GradeBand } from "./types";

/** Grade défaut interne : forcé par le moteur défaut, jamais par le score. */
export const DEFAULT_GRADE = "DEF1";

/**
 * Détermine le grade moteur à partir du score brut et de la master scale.
 * Convention : minScore inclus, maxScore exclu (grilles §18.1).
 */
export function gradeFromScore(scale: GradeBand[], score: number): string {
  for (const band of scale) {
    const okMin = band.minScore === null || score >= band.minScore;
    const okMax = band.maxScore === null || score < band.maxScore;
    if (okMin && okMax) return band.grade;
  }
  // La master scale validée couvre [0, 100] ; ce chemin signale une config invalide.
  throw new Error(`Master scale non exhaustive : aucun grade pour le score ${score}`);
}

/** Rang ordinal d'un grade : 1 = meilleur. Les grades défaut sont les pires. */
export function gradeRank(scale: GradeBand[], grade: string): number {
  const idx = scale.findIndex((b) => b.grade === grade);
  if (idx >= 0) return idx + 1;
  if (grade.startsWith("DEF")) return scale.length + 1;
  throw new Error(`Grade inconnu : ${grade}`);
}

/**
 * Applique un cap « pas mieux que maxGrade » : retourne le grade le plus
 * défavorable des deux. Le score brut n'est jamais modifié.
 */
export function applyCap(scale: GradeBand[], current: string, maxGrade: string): string {
  const curRank = gradeRank(scale, current);
  const capRank = gradeRank(scale, maxGrade);
  return capRank > curRank ? maxGrade : current;
}

export function gradeLabelFr(scale: GradeBand[], grade: string): string {
  const band = scale.find((b) => b.grade === grade);
  if (band) return band.labelFr;
  if (grade.startsWith("DEF")) return "Défaut";
  return grade;
}
