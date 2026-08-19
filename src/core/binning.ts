import type { Bin, CriterionScore } from "./types";

export interface BinMatch {
  score: CriterionScore;
  bin: Bin;
}

/**
 * Résout la bande d'un barème quantitatif pour une valeur donnée.
 *
 * Conventions (grilles §6.2) : les bornes sont appliquées sans chevauchement.
 * Chaque bande porte explicitement son inclusivité min/max ; null = infini.
 * Retourne null si aucune bande ne correspond (le validateur de modèle
 * garantit l'exhaustivité, donc null signale une configuration invalide).
 */
export function resolveBin(bins: Bin[], value: number): BinMatch | null {
  if (!Number.isFinite(value)) return null;
  for (const bin of bins) {
    const okMin =
      bin.min === null || (bin.minInclusive ? value >= bin.min : value > bin.min);
    const okMax =
      bin.max === null || (bin.maxInclusive ? value <= bin.max : value < bin.max);
    if (okMin && okMax) return { score: bin.score, bin };
  }
  return null;
}

/** Représentation lisible d'une bande, pour les explications. */
export function binLabel(bin: Bin, unit?: string): string {
  const u = unit ?? "";
  const lo =
    bin.min === null ? "-∞" : `${bin.minInclusive ? "[" : "]"}${bin.min}${u}`;
  const hi =
    bin.max === null ? "+∞" : `${bin.max}${u}${bin.maxInclusive ? "]" : "["}`;
  if (bin.label) return bin.label;
  return `${lo} ; ${hi}`;
}

/**
 * Vérifie qu'un barème est exhaustif et sans chevauchement sur R.
 * Retourne la liste des anomalies détectées (vide si conforme).
 */
export function checkBins(bins: Bin[]): string[] {
  const issues: string[] = [];
  if (bins.length === 0) return ["barème vide"];

  const sorted = [...bins].sort((a, b) => {
    const am = a.min === null ? -Infinity : a.min;
    const bm = b.min === null ? -Infinity : b.min;
    return am - bm;
  });

  if (sorted[0].min !== null) {
    issues.push(`pas de bande couvrant -∞ (première borne min=${sorted[0].min})`);
  }
  const last = sorted[sorted.length - 1];
  if (last.max !== null) {
    issues.push(`pas de bande couvrant +∞ (dernière borne max=${last.max})`);
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (cur.max === null) {
      issues.push(`bande ${i} ouverte vers +∞ mais suivie d'une autre bande`);
      continue;
    }
    if (next.min === null) {
      issues.push(`bande ${i + 1} ouverte vers -∞ mais précédée d'une autre bande`);
      continue;
    }
    if (cur.max !== next.min) {
      issues.push(
        `trou ou chevauchement entre bandes : max=${cur.max} vs min suivant=${next.min}`
      );
      continue;
    }
    // À la frontière commune, exactement une des deux bandes doit inclure la borne.
    if (cur.maxInclusive === next.minInclusive) {
      issues.push(
        `frontière ${cur.max} : inclusivité incohérente (maxInclusive=${cur.maxInclusive}, minInclusive suivant=${next.minInclusive})`
      );
    }
  }
  return issues;
}
