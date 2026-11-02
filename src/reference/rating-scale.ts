import type { GradeScaleConfig } from "@/core/types";
import { DEFAULT_GRADES } from "./default-policy";

/**
 * Échelle maîtresse de notation — 1 (meilleur risque) à 10 (risque le plus
 * élevé), commune à toutes les grilles, défaut hors échelle (DEF1 à DEF3).
 *
 * Décision de novembre 2026 (journal D-53) : une seule échelle, lisible par
 * tous les métiers, au lieu d'une échelle par grille (STD-P1…P8, TPE-B1…B6,
 * STD-S…, TPE-T…). L'échelle est PARAMÉTRABLE dans le temps : chaque version
 * porte une date d'effet ; la version en vigueur à la date de calcul s'applique
 * et son identifiant est consigné dans chaque notation, qui se rejoue donc à
 * l'identique même après un changement d'échelle. Une version entrée en vigueur
 * est figée : on la remplace par une nouvelle version, on ne la modifie pas.
 *
 * Bornes de la version initiale : elles reprennent les coupures de l'échelle
 * standard précédente là où elles existaient (70, 64, 57, 48), ce qui
 * transpose exactement les plafonds en vigueur (l'ancien STD-P7 « Faible »,
 * 48 à 57, devient la classe 8 ; l'ancien STD-P6 « Fragile » devient la 7), et
 * ajoutent deux classes en haut et une en bas pour atteindre dix classes.
 */

export interface MasterScaleBand {
  /** Code de la classe : « 1 » à « 10 » pour l'échelle initiale. */
  grade: string;
  /** Score minimal inclus ; null pour la dernière classe (jusqu'à 0). */
  minScore: number | null;
  labelFr: string;
}

export interface MasterScaleVersion {
  /** Identifiant de version, consigné dans chaque notation (ex. « ECH10-2026.1 »). */
  version: string;
  /** Date d'effet (AAAA-MM-JJ) : s'applique aux notations calculées à partir de ce jour. */
  effectiveFrom: string;
  labelFr: string;
  status: "PROVISIONAL" | "CALIBRATED";
  /** Classes du meilleur au moins bon risque. */
  bands: MasterScaleBand[];
  /** Motif de la version (comité, décision), affiché dans l'historique. */
  noteFr?: string;
  createdBy?: string;
  createdAt?: string;
}

export const DEFAULT_MASTER_SCALE: MasterScaleVersion = {
  version: "ECH10-2026.1",
  effectiveFrom: "2026-01-01",
  labelFr: "Échelle maîtresse 1 à 10 (provisoire)",
  status: "PROVISIONAL",
  noteFr:
    "Version initiale : dix classes, 1 = meilleur risque, défaut hors échelle. Bornes expertes, à confirmer par la calibration sur défauts observés.",
  bands: [
    { grade: "1", minScore: 90, labelFr: "Exceptionnel" },
    { grade: "2", minScore: 85, labelFr: "Très solide" },
    { grade: "3", minScore: 80, labelFr: "Solide" },
    { grade: "4", minScore: 75, labelFr: "Bon" },
    { grade: "5", minScore: 70, labelFr: "Satisfaisant" },
    { grade: "6", minScore: 64, labelFr: "Acceptable" },
    { grade: "7", minScore: 57, labelFr: "Fragile" },
    { grade: "8", minScore: 48, labelFr: "Faible" },
    { grade: "9", minScore: 40, labelFr: "Très faible" },
    { grade: "10", minScore: null, labelFr: "Critique" },
  ],
};

/** Conversion vers la structure d'échelle du moteur (bornes hautes déduites). */
export function toGradeScaleConfig(v: MasterScaleVersion): GradeScaleConfig {
  return {
    scaleId: v.version,
    labelFr: v.labelFr,
    comparableWith: [],
    status: v.status,
    bands: v.bands.map((b, i) => ({
      grade: b.grade,
      minScore: b.minScore,
      maxScore: i === 0 ? null : v.bands[i - 1].minScore,
      labelFr: b.labelFr,
    })),
    defaultGrades: DEFAULT_GRADES,
  };
}

/** Échelle de la version initiale, utilisée par les modèles embarqués. */
export const MASTER_GRADE_SCALE: GradeScaleConfig = toGradeScaleConfig(DEFAULT_MASTER_SCALE);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/;
const GRADE_RE = /^[A-Za-z0-9+-]{1,6}$/;

/**
 * Contrôle d'une version d'échelle. `requiredGrades` : classes citées par les
 * modèles (plafonds) ; une version qui en supprimerait une est refusée, car le
 * plafond ne s'appliquerait plus.
 */
export function validateMasterScale(v: MasterScaleVersion, requiredGrades: string[] = []): string[] {
  const issues: string[] = [];
  if (!VERSION_RE.test(v.version ?? "")) issues.push("Identifiant de version invalide (2 à 40 caractères : lettres, chiffres, . _ -).");
  if (!DATE_RE.test(v.effectiveFrom ?? "") || Number.isNaN(Date.parse(v.effectiveFrom))) issues.push("Date d'effet invalide (AAAA-MM-JJ).");
  if (!v.labelFr?.trim()) issues.push("Libellé de l'échelle obligatoire.");
  const bands = Array.isArray(v.bands) ? v.bands : [];
  if (bands.length < 3 || bands.length > 20) issues.push("L'échelle compte de 3 à 20 classes.");
  const seen = new Set<string>();
  bands.forEach((b, i) => {
    const n = i + 1;
    if (!GRADE_RE.test(b.grade ?? "")) issues.push(`Classe ${n} : code invalide (1 à 6 caractères, lettres ou chiffres).`);
    if (seen.has(b.grade)) issues.push(`Classe ${b.grade} : code en double.`);
    if (/^DEF/i.test(b.grade ?? "")) issues.push(`Classe ${b.grade} : les codes DEF sont réservés au défaut constaté.`);
    seen.add(b.grade);
    if (!b.labelFr?.trim()) issues.push(`Classe ${b.grade} : libellé obligatoire.`);
    const last = i === bands.length - 1;
    if (last) {
      if (b.minScore !== null) issues.push(`Classe ${b.grade} : la dernière classe n'a pas de borne basse (elle va jusqu'à 0).`);
    } else if (b.minScore === null || !Number.isFinite(b.minScore) || b.minScore <= 0 || b.minScore > 100) {
      issues.push(`Classe ${b.grade} : score minimal entre 0 (exclu) et 100.`);
    } else if (i > 0 && bands[i - 1].minScore !== null && b.minScore >= (bands[i - 1].minScore as number)) {
      issues.push(`Classe ${b.grade} : son score minimal doit être inférieur à celui de la classe ${bands[i - 1].grade}.`);
    }
  });
  for (const g of requiredGrades) {
    if (!seen.has(g)) issues.push(`Classe ${g} absente : elle est citée par un plafond d'une grille publiée.`);
  }
  return issues;
}

/** Version en vigueur à une date (AAAA-MM-JJ) : la plus récente dont la date d'effet est passée. */
export function effectiveVersion(versions: MasterScaleVersion[], dateIso: string): MasterScaleVersion {
  const day = dateIso.slice(0, 10);
  const sorted = [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted.find((v) => v.effectiveFrom <= day) ?? DEFAULT_MASTER_SCALE;
}
