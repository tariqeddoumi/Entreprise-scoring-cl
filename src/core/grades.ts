import { DEFAULT_GRADES } from "@/reference/default-policy";
import type { GradeBand, GradeScaleConfig } from "./types";

/**
 * Échelles de grades.
 *
 * V3 — chaque modèle porte SA propre échelle (constat C03). Deux modèles qui
 * n'observent pas la même chose — états financiers d'un côté, flux bancaires de
 * l'autre — ne peuvent pas afficher le même libellé de grade tant qu'aucune
 * correspondance n'a été établie sur des probabilités de défaut comparables.
 * Les fonctions ci-dessous refusent donc toute comparaison entre échelles non
 * déclarées comparables.
 */

/** Grade de défaut appliqué quand le constat amont n'en précise pas la nature. */
export const DEFAULT_GRADE = "DEF1";

/**
 * Détermine le grade à partir du score brut.
 * Convention : minScore inclus, maxScore exclu.
 */
export function gradeFromScore(scale: GradeScaleConfig, score: number): string {
  for (const band of scale.bands) {
    const okMin = band.minScore === null || score >= band.minScore;
    const okMax = band.maxScore === null || score < band.maxScore;
    if (okMin && okMax) return band.grade;
  }
  throw new Error(
    `Échelle ${scale.scaleId} non exhaustive : aucun grade pour le score ${score}`
  );
}

/** Rang ordinal d'un grade : 1 = meilleur. Les grades de défaut sont les pires. */
export function gradeRank(scale: GradeScaleConfig, grade: string): number {
  const idx = scale.bands.findIndex((b) => b.grade === grade);
  if (idx >= 0) return idx + 1;
  const defIdx = DEFAULT_GRADES.findIndex((d) => d.grade === grade);
  if (defIdx >= 0) return scale.bands.length + 1 + defIdx;
  throw new Error(`Grade inconnu de l'échelle ${scale.scaleId} : ${grade}`);
}

/**
 * Applique un plafond « pas mieux que maxGrade » : retourne le grade le plus
 * défavorable des deux. Le score brut n'est jamais modifié.
 */
export function applyCap(
  scale: GradeScaleConfig,
  current: string,
  maxGrade: string
): string {
  const curRank = gradeRank(scale, current);
  const capRank = gradeRank(scale, maxGrade);
  return capRank > curRank ? maxGrade : current;
}

export function gradeLabelFr(scale: GradeScaleConfig, grade: string | null): string {
  if (grade === null) return "—";
  const band = scale.bands.find((b) => b.grade === grade);
  if (band) return band.labelFr;
  const def = DEFAULT_GRADES.find((d) => d.grade === grade);
  if (def) return def.labelFr;
  return grade;
}

export function bandForGrade(scale: GradeScaleConfig, grade: string): GradeBand | undefined {
  return scale.bands.find((b) => b.grade === grade);
}

/**
 * Deux grades ne sont comparables que si leurs échelles se déclarent
 * mutuellement comparables — ce qui suppose une étude de correspondance
 * validée. En son absence, la fonction refuse plutôt que de renvoyer un
 * résultat trompeur : c'est exactement le scénario que le diagnostic
 * décrivait, un même « G6 » paraissant porter le même risque dans deux modèles
 * qui ne mesurent pas la même chose.
 */
export function assertComparable(a: GradeScaleConfig, b: GradeScaleConfig): void {
  if (a.scaleId === b.scaleId) return;
  if (a.comparableWith.includes(b.scaleId) && b.comparableWith.includes(a.scaleId)) return;
  throw new Error(
    `Échelles non comparables : ${a.scaleId} et ${b.scaleId}. Une correspondance validée sur probabilités de défaut est requise avant toute comparaison de grades.`
  );
}

export function areComparable(a: GradeScaleConfig, b: GradeScaleConfig): boolean {
  if (a.scaleId === b.scaleId) return true;
  return a.comparableWith.includes(b.scaleId) && b.comparableWith.includes(a.scaleId);
}

/**
 * Écart en crans entre deux notations (positif : dégradation), y compris
 * lorsqu'elles relèvent de deux échelles différentes (passage à l'échelle
 * maîtresse 1 à 10, nouvelle version de l'échelle).
 *
 * Même échelle : différence des rangs. Échelles différentes : la note
 * précédente est TRANSPOSÉE sur l'échelle de la nouvelle — son score brut,
 * ramené dans les bornes de son grade (pour conserver l'effet d'un plafond ou
 * d'un support groupe), donne la classe équivalente. Un défaut reste un défaut.
 * Retourne null quand la transposition est impossible (grade inconnu, score
 * absent).
 */
export function notchDeltaAcross(
  previous: { scale: GradeScaleConfig; grade: string | null; rawScore: number | null },
  next: { scale: GradeScaleConfig; grade: string | null }
): number | null {
  if (!previous.grade || !next.grade) return null;
  try {
    const nextRank = gradeRank(next.scale, next.grade);
    if (previous.scale.scaleId === next.scale.scaleId) return nextRank - gradeRank(previous.scale, previous.grade);
    if (DEFAULT_GRADES.some((d) => d.grade === previous.grade)) return nextRank - gradeRank(next.scale, previous.grade);
    const band = bandForGrade(previous.scale, previous.grade);
    if (!band || previous.rawScore === null || !Number.isFinite(previous.rawScore)) return null;
    const lo = band.minScore ?? 0;
    const hi = band.maxScore === null ? 100 : band.maxScore - 0.0001;
    const score = Math.min(Math.max(previous.rawScore, lo), hi);
    return nextRank - gradeRank(next.scale, gradeFromScore(next.scale, score));
  } catch {
    return null;
  }
}

/**
 * Classe équivalente, sur une autre échelle, d'un grade archivé (STD-P5 →
 * classe de l'échelle 1 à 10) : même transposition que `notchDeltaAcross`.
 * Pour l'affichage et la lecture du portefeuille seulement ; la note
 * archivée, elle, n'est jamais réécrite.
 */
export function transposeGrade(
  from: GradeScaleConfig,
  grade: string | null,
  rawScore: number | null,
  to: GradeScaleConfig
): string | null {
  if (!grade) return null;
  if (DEFAULT_GRADES.some((d) => d.grade === grade)) return grade;
  if (from.scaleId === to.scaleId) return grade;
  const band = bandForGrade(from, grade);
  if (!band || rawScore === null || !Number.isFinite(rawScore)) return null;
  const lo = band.minScore ?? 0;
  const hi = band.maxScore === null ? 100 : band.maxScore - 0.0001;
  return gradeFromScore(to, Math.min(Math.max(rawScore, lo), hi));
}
