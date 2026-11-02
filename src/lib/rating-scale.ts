import type { GradeScaleConfig, ModelConfig } from "@/core/types";
import { gradeRank } from "@/core/grades";
import { getModel, gradesRequiredByModels, withMasterScale } from "@/models";
import { LEGACY_SCALES, legacyScaleForGrade } from "@/reference/legacy-scales";
import {
  DEFAULT_MASTER_SCALE,
  effectiveVersion,
  toGradeScaleConfig,
  validateMasterScale,
  type MasterScaleVersion,
} from "@/reference/rating-scale";
import { prisma } from "./prisma";
import { buildModel, effectiveParams, loadParamVersions } from "./model-params";

/**
 * Versions de l'échelle maîtresse, paramétrées par l'administrateur du groupe.
 *
 * Stockage : une entrée du paramétrage (`app_settings`), au format JSON, sans
 * table dédiée. La version embarquée (`DEFAULT_MASTER_SCALE`) est toujours
 * présente et ne se supprime pas. Règles de gouvernance, appliquées à
 * l'enregistrement :
 *  - une version entrée en vigueur est figée (elle est citée par des notations) ;
 *  - une nouvelle version prend effet aujourd'hui au plus tôt, jamais dans le passé ;
 *  - une version future peut être modifiée ou retirée tant qu'elle n'est pas en vigueur.
 */

export const RATING_SCALE_KEY = "RATING_SCALE_VERSIONS";

const TTL_MS = 30_000;
let cache: { versions: MasterScaleVersion[]; expires: number } | null = null;

function parseVersions(raw: string | null | undefined): MasterScaleVersion[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as MasterScaleVersion[];
    return Array.isArray(list) ? list.filter((v) => validateMasterScale(v).length === 0) : [];
  } catch {
    return [];
  }
}

/** Toutes les versions, la version embarquée comprise, de la plus ancienne à la plus récente. */
export async function loadScaleVersions(opts: { fresh?: boolean } = {}): Promise<MasterScaleVersion[]> {
  // Cache court pour les calculs ; l'écran d'administration lit toujours la base.
  if (!opts.fresh && cache && cache.expires > Date.now()) return cache.versions;
  let stored: MasterScaleVersion[] = [];
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: RATING_SCALE_KEY } });
    stored = parseVersions(row?.value);
  } catch {
    // Base indisponible : seule la version embarquée s'applique.
  }
  const versions = [DEFAULT_MASTER_SCALE, ...stored.filter((v) => v.version !== DEFAULT_MASTER_SCALE.version)].sort(
    (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)
  );
  cache = { versions, expires: Date.now() + TTL_MS };
  return versions;
}

export function forgetScaleVersions(): void {
  cache = null;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Version en vigueur à une date (par défaut aujourd'hui, date de calcul). */
export async function effectiveScale(dateIso: string = today(), opts: { fresh?: boolean } = {}): Promise<MasterScaleVersion> {
  return effectiveVersion(await loadScaleVersions(opts), dateIso);
}

/**
 * Modèle prêt à noter : la version publiée de la grille, appliquée avec
 * l'échelle en vigueur à la date de calcul. Toute notation, simulation,
 * prévisualisation ou renotation passe par ici.
 */
export async function getScoringModel(modelId: string, dateIso: string = today()): Promise<ModelConfig | undefined> {
  const model = getModel(modelId);
  if (!model) return undefined;
  const [scale, versions] = await Promise.all([effectiveScale(dateIso), loadParamVersions()]);
  // Paramètres de la grille en vigueur (Administration › Paramétrage des
  // grilles), puis échelle maîtresse.
  return buildModel(model, effectiveParams(versions, modelId, dateIso), scale);
}

/**
 * Échelle d'une notation archivée, d'après l'identifiant consigné dans son
 * résultat, à défaut d'après ses grades (moteurs antérieurs : STD-P, TPE-B…).
 */
export async function scaleById(scaleId: string | null | undefined, gradeHint?: string | null): Promise<GradeScaleConfig> {
  const versions = await loadScaleVersions();
  const v = versions.find((x) => x.version === scaleId);
  if (v) return toGradeScaleConfig(v);
  const legacy = LEGACY_SCALES.find((s) => s.scaleId === scaleId) ?? (gradeHint ? legacyScaleForGrade(gradeHint) : undefined);
  if (legacy) return legacy;
  return toGradeScaleConfig(effectiveVersion(versions, today()));
}

/** Identifiant d'échelle consigné dans un instantané de résultat (texte JSON). */
export function snapshotScaleId(snapshot: string | null | undefined): string | null {
  if (!snapshot) return null;
  try {
    const v = (JSON.parse(snapshot) as { gradeScaleId?: unknown }).gradeScaleId;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Rang d'un grade dans son échelle (1 = meilleur), ou null s'il est inconnu. */
export function safeRank(scale: GradeScaleConfig, grade: string | null | undefined): number | null {
  if (!grade) return null;
  try {
    return gradeRank(scale, grade);
  } catch {
    return null;
  }
}

export class ScaleError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Contrôle d'une nouvelle version avant enregistrement (règles ci-dessus).
 * `replacing` : identifiant d'une version future modifiée.
 */
export function checkNewVersion(
  versions: MasterScaleVersion[],
  candidate: MasterScaleVersion,
  day: string = today(),
  replacing?: string
): string[] {
  const issues = validateMasterScale(candidate, gradesRequiredByModels());
  if (candidate.effectiveFrom < day) issues.push("La date d'effet ne peut pas être antérieure à aujourd'hui : une notation déjà calculée garde son échelle.");
  const others = versions.filter((v) => v.version !== replacing);
  if (others.some((v) => v.version === candidate.version)) issues.push(`La version ${candidate.version} existe déjà.`);
  if (others.some((v) => v.effectiveFrom === candidate.effectiveFrom)) issues.push("Une autre version prend déjà effet à cette date.");
  if (replacing) {
    const old = versions.find((v) => v.version === replacing);
    if (!old) issues.push(`Version ${replacing} introuvable.`);
    else if (old.version === DEFAULT_MASTER_SCALE.version || old.effectiveFrom <= day) {
      issues.push(`La version ${replacing} est en vigueur ou l'a été : elle est figée, créez une nouvelle version.`);
    }
  }
  // Chaque modèle doit accepter l'échelle (couverture de [0, 100], plafonds).
  for (const id of ["CORP_STD_V1", "CORP_TPE_BEHAV_V1", "CORP_STD_CHALLENGER_V1", "CORP_TPE_CHALLENGER_V1"]) {
    const m = getModel(id);
    if (!m) continue;
    try {
      withMasterScale(m, candidate);
    } catch (e) {
      issues.push(e instanceof Error ? e.message : String(e));
    }
  }
  return [...new Set(issues)];
}

/** Versions enregistrées (hors version embarquée), pour écriture. */
export async function storedVersions(): Promise<MasterScaleVersion[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: RATING_SCALE_KEY } });
  return parseVersions(row?.value);
}
