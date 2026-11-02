import type { ModelConfig } from "@/core/types";
import { validateModel } from "@/core/validate-model";
import { toGradeScaleConfig, type MasterScaleVersion } from "@/reference/rating-scale";
import { CORP_STD_V1 } from "./corp-std-v1";
import { CORP_TPE_BEHAV_V1 } from "./corp-tpe-behav-v1";
import { CORP_STD_CHALLENGER_V1, CORP_TPE_CHALLENGER_V1 } from "./corp-challengers";

/**
 * Registre des versions de modèle embarquées (seeds).
 * Chaque modèle est validé au chargement : une configuration invalide
 * (poids ≠ 100 %, barème non exhaustif, échelle incomplète…) fait échouer
 * le démarrage plutôt que de produire des résultats faux.
 */
const registry: Record<string, ModelConfig> = Object.fromEntries(
  [CORP_STD_V1, CORP_TPE_BEHAV_V1, CORP_STD_CHALLENGER_V1, CORP_TPE_CHALLENGER_V1].map((m) => {
    const issues = validateModel(m);
    if (issues.length > 0) {
      throw new Error(
        `Modèle ${m.modelId} v${m.version} invalide :\n- ${issues.join("\n- ")}`
      );
    }
    return [m.modelId, m];
  })
);

export function getModel(modelId: string): ModelConfig | undefined {
  return registry[modelId];
}

export function listModels(): ModelConfig[] {
  return Object.values(registry);
}

export { CORP_STD_V1, CORP_TPE_BEHAV_V1, CORP_STD_CHALLENGER_V1, CORP_TPE_CHALLENGER_V1 };

/** Classes citées par les plafonds des grilles publiées : une échelle doit les contenir. */
export function gradesRequiredByModels(): string[] {
  const set = new Set<string>();
  for (const m of listModels()) {
    for (const r of m.nonCompensatoryRules) if (r.maxGrade !== "NO_GRADE") set.add(r.maxGrade);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

const scaled = new Map<string, ModelConfig>();

/**
 * Modèle appliqué avec une version de l'échelle maîtresse.
 *
 * La version embarquée laisse le modèle intact. Une autre version remplace
 * l'échelle (bornes, libellés) ; la calibration attachée, établie sur les
 * classes de la version embarquée, ne vaut plus pour d'autres bornes : elle
 * est retirée et aucune PD n'est produite tant qu'une nouvelle calibration
 * n'est pas publiée. Le résultat est validé comme un modèle chargé au
 * démarrage : une échelle qui ne couvrirait pas [0, 100] ou perdrait une
 * classe de plafond est refusée.
 */
export function withMasterScale(model: ModelConfig, version: MasterScaleVersion): ModelConfig {
  if (version.version === model.gradeScale.scaleId) return model;
  const key = `${model.modelId}@${model.version}#${version.version}#${JSON.stringify(version.bands)}`;
  const hit = scaled.get(key);
  if (hit) return hit;
  const next: ModelConfig = {
    ...model,
    gradeScale: toGradeScaleConfig(version),
    calibration: undefined,
    pdStatus: model.calibration ? "UNCALIBRATED" : model.pdStatus,
  };
  const issues = validateModel(next);
  if (issues.length > 0) {
    throw new Error(`Échelle ${version.version} inapplicable au modèle ${model.modelId} :\n- ${issues.join("\n- ")}`);
  }
  scaled.set(key, next);
  return next;
}
