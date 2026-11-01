import type { IndicatorUnit } from "./compute";

/** Montant arrondi à l'unité, séparateur de milliers français. */
export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("fr-FR");
}

/** Indicateur avec son unité (montant, %, multiple, jours). */
export function formatIndicator(n: number | null | undefined, unit: IndicatorUnit): string {
  if (n === null || n === undefined) return "—";
  if (unit === "MAD") return formatAmount(n);
  const s = n.toLocaleString("fr-FR", { maximumFractionDigits: unit === "j" ? 0 : 2 });
  return unit === "%" ? `${s} %` : unit === "x" ? `${s} x` : `${s} j`;
}
