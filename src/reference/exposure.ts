/**
 * Engagement global déclaré à la notation (segmentationData.globalBankExposure),
 * s'il est lisible, arrondi au centime. Enregistré avec la notation
 * (rating_runs.exposureBase) : la surveillance le lit sans relire l'instantané.
 */
export function exposureOfInput(input: { segmentationData?: { globalBankExposure?: unknown } }): number | null {
  const v = input.segmentationData?.globalBankExposure;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
