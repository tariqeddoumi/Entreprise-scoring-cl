import type { AlertSeverity, Appreciation, SynthesisThresholds } from "./statement-format";

/**
 * Analyse financière dès le chargement du bilan : appréciation de chaque
 * indicateur, tendance sur un an, alertes et situation d'ensemble. Elle
 * informe l'analyste avant la notation ; elle ne change pas la note.
 *
 * Module PUR.
 */

export type Level = "BON" | "MOYEN" | "MAUVAIS" | "CRITIQUE";
export type Trend = "AMELIORATION" | "STABLE" | "DEGRADATION";
export type Situation = "SAINE" | "A_SURVEILLER" | "DEGRADEE" | "CRITIQUE";

export const LEVEL_LABELS: Record<Level, string> = { BON: "Bon", MOYEN: "À surveiller", MAUVAIS: "Mauvais", CRITIQUE: "Critique" };
export const TREND_LABELS: Record<Trend, string> = { AMELIORATION: "En amélioration", STABLE: "Stable", DEGRADATION: "En dégradation" };
export const SITUATION_LABELS: Record<Situation, string> = {
  SAINE: "Situation financière saine",
  A_SURVEILLER: "Situation financière à surveiller",
  DEGRADEE: "Situation financière dégradée",
  CRITIQUE: "Situation financière critique",
};

const RANK: Record<Level, number> = { BON: 0, MOYEN: 1, MAUVAIS: 2, CRITIQUE: 3 };

export interface IndicatorAppraisal {
  key: string;
  /** Niveau par exercice (même ordre que les exercices). */
  levels: Array<Level | null>;
  trend: Trend | null;
  /** Variation relative N / N−1, en %. */
  change: number | null;
  /** Ratio d'une grille de notation (affiché en tête). */
  grid?: string;
}

export interface AlertResult {
  key: string;
  labelFr: string;
  severity: AlertSeverity;
  referenceFr?: string;
  status: "DECLENCHEE" | "NON" | "NON_EVALUABLE";
}

export interface FinancialAnalysis {
  formatVersion: string;
  appraisals: IndicatorAppraisal[];
  alerts: AlertResult[];
  situation: Situation | null;
  counts: { alertesCritiques: number; alertes: number; critiques: number; mauvais: number; degradations: number; ameliorations: number };
  motifsFr: string[];
}

export function levelOf(value: number | null | undefined, ap: Appreciation | undefined): Level | null {
  if (value === null || value === undefined || !ap) return null;
  const { bon, mauvais, critique } = ap;
  if (bon === undefined && mauvais === undefined && critique === undefined) return null;
  if (ap.sens === "HAUSSE") {
    if (critique !== undefined && value < critique) return "CRITIQUE";
    if (mauvais !== undefined && value < mauvais) return "MAUVAIS";
    if (bon !== undefined && value >= bon) return "BON";
    return "MOYEN";
  }
  if (critique !== undefined && value > critique) return "CRITIQUE";
  if (mauvais !== undefined && value > mauvais) return "MAUVAIS";
  if (bon !== undefined && value <= bon) return "BON";
  return "MOYEN";
}

/** Tendance N / N−1 : variation relative au-delà du seuil, ou changement de niveau. */
export function trendOf(
  now: number | null | undefined,
  prev: number | null | undefined,
  ap: Appreciation | undefined,
  levels: [Level | null, Level | null] = [null, null]
): { trend: Trend | null; change: number | null } {
  if (now === null || now === undefined || prev === null || prev === undefined || !ap) return { trend: null, change: null };
  const change = prev === 0 ? null : ((now - prev) / Math.abs(prev)) * 100;
  const [ln, lp] = levels;
  if (ln && lp && RANK[ln] !== RANK[lp]) return { trend: RANK[ln] > RANK[lp] ? "DEGRADATION" : "AMELIORATION", change };
  if (change === null) return { trend: now === prev ? "STABLE" : null, change };
  const threshold = ap.variation ?? 10;
  const better = ap.sens === "HAUSSE" ? change : -change;
  return { trend: better > threshold ? "AMELIORATION" : better < -threshold ? "DEGRADATION" : "STABLE", change };
}

export function situationOf(
  counts: FinancialAnalysis["counts"],
  t: SynthesisThresholds
): { situation: Situation; motifsFr: string[] } {
  const m: string[] = [];
  const say = (n: number, one: string, many: string) => (n > 0 ? m.push(`${n} ${n > 1 ? many : one}`) : 0);
  say(counts.alertesCritiques, "alerte critique", "alertes critiques");
  say(counts.alertes - counts.alertesCritiques, "alerte", "alertes");
  say(counts.critiques, "indicateur en zone critique", "indicateurs en zone critique");
  say(counts.mauvais, "indicateur mauvais", "indicateurs mauvais");
  say(counts.degradations, "indicateur en dégradation", "indicateurs en dégradation");
  let situation: Situation = "SAINE";
  if (counts.alertesCritiques >= t.critique.alertesCritiques || counts.critiques >= t.critique.indicateursCritiques) situation = "CRITIQUE";
  else if (counts.alertes >= t.degradee.alertes || counts.critiques >= t.degradee.indicateursCritiques || counts.mauvais >= t.degradee.indicateursMauvais) situation = "DEGRADEE";
  else if (counts.alertes >= t.surveiller.alertes || counts.mauvais >= t.surveiller.indicateursMauvais || counts.degradations >= t.surveiller.degradations) situation = "A_SURVEILLER";
  return { situation, motifsFr: m };
}
