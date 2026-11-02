import type { ModelConfig } from "@/core/types";
import { validateModel } from "@/core/validate-model";
import { getModel, withMasterScale } from "@/models";
import { applyModelParams, checkParams, type ModelParamVersion } from "@/reference/model-params";
import type { MasterScaleVersion } from "@/reference/rating-scale";
import { prisma } from "./prisma";

/**
 * Versions de paramètres des grilles, administrées à l'écran (Administration ›
 * Paramétrage des grilles). Stockage : une entrée du paramétrage
 * (`app_settings`, clé MODEL_PARAM_VERSIONS), sans table dédiée. Règles :
 *  - sans version enregistrée, la grille embarquée s'applique ;
 *  - une version prend effet au plus tôt le jour même ;
 *  - une version en vigueur est figée ; une version future se modifie ou se retire.
 */

export const MODEL_PARAMS_KEY = "MODEL_PARAM_VERSIONS";

const TTL_MS = 30_000;
let cache: { versions: ModelParamVersion[]; expires: number } | null = null;

function parse(raw: string | null | undefined): ModelParamVersion[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as ModelParamVersion[];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.version === "string" && v.params) : [];
  } catch {
    return [];
  }
}

export async function loadParamVersions(opts: { fresh?: boolean } = {}): Promise<ModelParamVersion[]> {
  if (!opts.fresh && cache && cache.expires > Date.now()) return cache.versions;
  let versions: ModelParamVersion[] = [];
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: MODEL_PARAMS_KEY } });
    versions = parse(row?.value);
  } catch {
    // Base indisponible : grilles embarquées.
  }
  cache = { versions, expires: Date.now() + TTL_MS };
  return versions;
}

export function forgetParamVersions(): void {
  cache = null;
}

/** Version de paramètres en vigueur pour une grille à une date, ou null (grille embarquée). */
export function effectiveParams(versions: ModelParamVersion[], modelId: string, dateIso: string): ModelParamVersion | null {
  const day = dateIso.slice(0, 10);
  const model = getModel(modelId);
  return (
    versions
      .filter((v) => v.modelId === modelId && v.effectiveFrom <= day && (!model || v.baseVersion === model.version))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  );
}

/** Grille + paramètres + échelle, validée comme au démarrage. */
export function buildModel(base: ModelConfig, params: ModelParamVersion | null, scale: MasterScaleVersion): ModelConfig {
  const withParams = params ? applyModelParams(base, params) : base;
  if (params) {
    const issues = validateModel(withParams);
    if (issues.length > 0) throw new Error(`Paramètres ${params.version} invalides :\n- ${issues.join("\n- ")}`);
  }
  return withMasterScale(withParams, scale);
}

/** Contrôle complet d'une version avant enregistrement. */
export function checkParamVersion(
  versions: ModelParamVersion[],
  candidate: ModelParamVersion,
  scale: MasterScaleVersion,
  day: string,
  replacing?: string
): string[] {
  const base = getModel(candidate.modelId);
  if (!base) return [`Grille inconnue : ${candidate.modelId}.`];
  const issues = checkParams(base, candidate);
  if (candidate.baseVersion !== base.version) issues.push(`Paramètres établis sur la version ${candidate.baseVersion} : la grille chargée est en ${base.version}.`);
  if (candidate.effectiveFrom < day) issues.push("La date d'effet ne peut pas être antérieure à aujourd'hui : une notation déjà calculée garde ses paramètres.");
  const others = versions.filter((v) => v.version !== replacing);
  if (others.some((v) => v.version === candidate.version)) issues.push(`La version ${candidate.version} existe déjà.`);
  if (others.some((v) => v.modelId === candidate.modelId && v.effectiveFrom === candidate.effectiveFrom)) issues.push("Une autre version de cette grille prend déjà effet à cette date.");
  if (replacing) {
    const old = versions.find((v) => v.version === replacing);
    if (!old) issues.push(`Version ${replacing} introuvable.`);
    else if (old.effectiveFrom <= day) issues.push(`La version ${replacing} est en vigueur ou l'a été : elle est figée, créez une nouvelle version.`);
  }
  if (issues.length === 0) {
    const applied = applyModelParams(base, candidate);
    issues.push(...validateModel(applied));
    if (issues.length === 0) {
      try {
        withMasterScale(applied, scale);
      } catch (e) {
        issues.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return [...new Set(issues)];
}

export async function storedParamVersions(): Promise<ModelParamVersion[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: MODEL_PARAMS_KEY } });
  return parse(row?.value);
}
