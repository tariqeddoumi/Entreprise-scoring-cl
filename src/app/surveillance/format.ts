/** Formats d'affichage de la surveillance (fr-FR). */
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${nf1.format(v)} %`);
export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf0.format(v));

/** Montant compact : 12,4 M ; 1,2 Md ; 850 k. */
export function fmtAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${nf1.format(v / 1e9)} Md`;
  if (a >= 1e6) return `${nf1.format(v / 1e6)} M`;
  if (a >= 1e3) return `${nf0.format(v / 1e3)} k`;
  return nf0.format(v);
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const fmtMonth = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
export const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
