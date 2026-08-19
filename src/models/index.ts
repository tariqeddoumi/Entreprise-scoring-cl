import type { ModelConfig } from "@/core/types";
import { validateModel } from "@/core/validate-model";
import { CORP_STD_V1 } from "./corp-std-v1";
import { CORP_TPE_BEHAV_V1 } from "./corp-tpe-behav-v1";

/**
 * Registre des versions de modèle embarquées (seeds).
 * Chaque modèle est validé au chargement : une configuration invalide
 * (poids ≠ 100 %, barème non exhaustif, échelle incomplète…) fait échouer
 * le démarrage plutôt que de produire des résultats faux.
 */
const registry: Record<string, ModelConfig> = Object.fromEntries(
  [CORP_STD_V1, CORP_TPE_BEHAV_V1].map((m) => {
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

export { CORP_STD_V1, CORP_TPE_BEHAV_V1 };
