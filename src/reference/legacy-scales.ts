import type { GradeScaleConfig } from "@/core/types";
import { DEFAULT_GRADES } from "./default-policy";

/**
 * Échelles des moteurs antérieurs à l'échelle maîtresse 1 à 10 (moteur 3.1 et
 * avant). Elles ne servent plus à noter : elles permettent de relire, de
 * classer et de comparer les notations archivées, qui conservent leurs grades
 * d'origine (STD-P3, TPE-B2…). Les modifier fausserait l'historique.
 */
function scale(scaleId: string, labelFr: string, prefix: string, cuts: number[], labels: string[]): GradeScaleConfig {
  return {
    scaleId,
    labelFr,
    comparableWith: [],
    status: "PROVISIONAL",
    bands: labels.map((l, i) => ({
      grade: `${prefix}${i + 1}`,
      minScore: i < cuts.length ? cuts[i] : null,
      maxScore: i === 0 ? null : cuts[i - 1],
      labelFr: l,
    })),
    defaultGrades: DEFAULT_GRADES,
  };
}

const STD_LABELS = ["Très solide", "Solide", "Bon", "Satisfaisant", "Acceptable", "Fragile", "Faible", "Très faible"];
const TPE_LABELS = [
  "Comportement très sain",
  "Comportement sain",
  "Comportement acceptable",
  "Tensions ponctuelles",
  "Tensions installées",
  "Comportement très dégradé",
];

export const LEGACY_SCALES: GradeScaleConfig[] = [
  scale("STD-P-2026.1", "Échelle du modèle standard (moteur 3.1 et avant)", "STD-P", [88, 82, 76, 70, 64, 57, 48], STD_LABELS),
  scale("TPE-B-2026.1", "Échelle du modèle TPE comportemental (moteur 3.1 et avant)", "TPE-B", [85, 76, 68, 60, 50], TPE_LABELS),
  scale("STD-CIBLE-PILOTE", "Échelle de la grille challenger standard (avant l'échelle 1 à 10)", "STD-S", [88, 82, 76, 70, 64, 57, 48], STD_LABELS),
  scale("TPE-CIBLE-PILOTE", "Échelle de la grille challenger TPE (avant l'échelle 1 à 10)", "TPE-T", [85, 76, 68, 60, 50], TPE_LABELS),
];

/** Échelle d'origine d'un grade archivé, d'après son préfixe. */
export function legacyScaleForGrade(grade: string): GradeScaleConfig | undefined {
  return LEGACY_SCALES.find((s) => s.bands.some((b) => b.grade === grade));
}
