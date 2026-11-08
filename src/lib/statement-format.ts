import { indicatorCatalog } from "@/financials/compute";
import { checkFormat, DEFAULT_FORMAT, normalizeFormat, type StatementFormat } from "@/financials/statement-format";
import { gridNeededPostes } from "@/financials/compute";
import { listModels } from "@/models";
import { prisma } from "./prisma";

/**
 * Versions du format de bilan, administrées à l'écran (Administration ›
 * Format du bilan). Stockage : une entrée du paramétrage (`app_settings`, clé
 * FINANCIAL_FORMAT_VERSIONS). Mêmes règles que les grilles et l'échelle :
 *  - sans version enregistrée, le format embarqué (bilan complet) s'applique ;
 *  - une version prend effet au plus tôt le jour même ;
 *  - une version en vigueur est figée ; une version future se modifie ou se retire.
 * La version appliquée est consignée dans chaque notation.
 */

export const FINANCIAL_FORMAT_KEY = "FINANCIAL_FORMAT_VERSIONS";

const TTL_MS = 30_000;
let cache: { versions: StatementFormat[]; expires: number } | null = null;

export function parseFormatVersions(raw: string | null | undefined): StatementFormat[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Array<Partial<StatementFormat>>;
    return Array.isArray(list) ? list.filter((v) => v && typeof v.version === "string").map(normalizeFormat) : [];
  } catch {
    return [];
  }
}

export async function loadFormatVersions(opts: { fresh?: boolean } = {}): Promise<StatementFormat[]> {
  if (!opts.fresh && cache && cache.expires > Date.now()) return cache.versions;
  let versions: StatementFormat[] = [];
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: FINANCIAL_FORMAT_KEY } });
    versions = parseFormatVersions(row?.value);
  } catch {
    // Base indisponible : format embarqué.
  }
  cache = { versions, expires: Date.now() + TTL_MS };
  return versions;
}

export function forgetFormatVersions(): void {
  cache = null;
}

/** Format en vigueur à une date (format embarqué à défaut). */
export function pickFormat(versions: StatementFormat[], dateIso: string): StatementFormat {
  const day = dateIso.slice(0, 10);
  return versions.filter((v) => v.effectiveFrom <= day).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? DEFAULT_FORMAT;
}

export async function effectiveFormat(dateIso: string, opts: { fresh?: boolean } = {}): Promise<StatementFormat> {
  return pickFormat(await loadFormatVersions(opts), dateIso);
}

/** Format d'une version donnée (notation déjà calculée), à défaut celui en vigueur à la date. */
export async function formatByVersion(version: string | null | undefined, dateIso: string): Promise<StatementFormat> {
  const versions = await loadFormatVersions();
  if (version === DEFAULT_FORMAT.version) return DEFAULT_FORMAT;
  return versions.find((v) => v.version === version) ?? pickFormat(versions, dateIso);
}

export function activeModelIds(): string[] {
  return listModels().map((m) => m.modelId);
}

/** Contrôle complet d'une version avant enregistrement. */
export function checkFormatVersion(
  versions: StatementFormat[],
  candidate: StatementFormat,
  day: string,
  replacing?: string
): { errors: string[]; warnings: string[] } {
  const builtIn = indicatorCatalog(DEFAULT_FORMAT).map((i) => i.key);
  const r = checkFormat(candidate, builtIn, gridNeededPostes(activeModelIds()).byIndicator);
  const errors = [...r.errors];
  if (candidate.effectiveFrom < day) errors.push("La date d'effet ne peut pas être antérieure à aujourd'hui : une notation déjà calculée garde son format.");
  const others = versions.filter((v) => v.version !== replacing);
  if (candidate.version === DEFAULT_FORMAT.version || others.some((v) => v.version === candidate.version)) errors.push(`La version ${candidate.version} existe déjà.`);
  if (others.some((v) => v.effectiveFrom === candidate.effectiveFrom)) errors.push("Une autre version prend déjà effet à cette date.");
  if (replacing) {
    const old = versions.find((v) => v.version === replacing);
    if (!old) errors.push(`Version ${replacing} introuvable.`);
    else if (old.effectiveFrom <= day) errors.push(`La version ${replacing} est en vigueur ou l'a été : elle est figée, créez une nouvelle version.`);
  }
  return { errors: [...new Set(errors)], warnings: r.warnings };
}

export async function storedFormatVersions(): Promise<StatementFormat[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: FINANCIAL_FORMAT_KEY } });
  return parseFormatVersions(row?.value);
}
