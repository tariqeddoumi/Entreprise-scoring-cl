"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkParamVersion, forgetParamVersions, loadParamVersions, MODEL_PARAMS_KEY, storedParamVersions } from "@/lib/model-params";
import { effectiveScale, today } from "@/lib/rating-scale";
import type { ModelParamVersion } from "@/reference/model-params";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface GridActionState {
  okFr?: string;
  errorFr?: string;
  issues?: string[];
}

const GROUP_ONLY = "Réservé à un administrateur du groupe : les grilles s'appliquent à toutes les banques et filiales.";

/**
 * Enregistre une version de paramètres d'une grille (ou modifie une version
 * future). Contrôles : ceux du paramétrage, puis ceux du démarrage du modèle
 * (poids à 100 %, plafond de concentration, barèmes exhaustifs, plafonds
 * connus de l'échelle). Une version en vigueur ne se modifie jamais.
 */
export async function saveGridVersionAction(payload: { version: ModelParamVersion; replacing?: string }): Promise<GridActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  const candidate = payload.version;
  const replacing = payload.replacing?.trim() || undefined;
  const all = await loadParamVersions({ fresh: true });
  const issues = checkParamVersion(all, candidate, await effectiveScale(today(), { fresh: true }), today(), replacing);
  if (issues.length > 0) return { errorFr: "La version n'est pas enregistrée : corrigez les points ci-dessous.", issues };
  try {
    const stored = (await storedParamVersions()).filter((v) => v.version !== replacing);
    const entry: ModelParamVersion = { ...candidate, createdBy: session.identity.name, createdAt: new Date().toISOString() };
    const next = [...stored, entry];
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: MODEL_PARAMS_KEY },
        update: { value: JSON.stringify(next), updatedBy: session.identity.name },
        create: { key: MODEL_PARAMS_KEY, value: JSON.stringify(next), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: replacing ? "MODEL_PARAMS_UPDATED" : "MODEL_PARAMS_CREATED",
        resourceType: "ModelParams",
        resourceId: entry.version,
        detail: { modelId: entry.modelId, effectiveFrom: entry.effectiveFrom, replacing: replacing ?? null, params: entry.params },
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  forgetParamVersions();
  revalidatePath("/admin/grilles");
  revalidatePath("/models", "layout");
  return {
    okFr: `Version ${candidate.version} enregistrée : elle s'appliquera aux notations de la grille ${candidate.modelId} calculées à partir du ${candidate.effectiveFrom}.`,
  };
}

/** Retrait d'une version future (pas encore en vigueur). */
export async function deleteGridVersionAction(version: string): Promise<GridActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  const stored = await storedParamVersions();
  const target = stored.find((v) => v.version === version);
  if (!target) return { errorFr: `Version ${version} introuvable.` };
  if (target.effectiveFrom <= today()) return { errorFr: `La version ${version} est en vigueur ou l'a été : elle est figée.` };
  try {
    const next = stored.filter((v) => v.version !== version);
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: MODEL_PARAMS_KEY },
        update: { value: JSON.stringify(next), updatedBy: session.identity.name },
        create: { key: MODEL_PARAMS_KEY, value: JSON.stringify(next), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "MODEL_PARAMS_DELETED",
        resourceType: "ModelParams",
        resourceId: version,
        detail: { version: target },
      });
    });
  } catch {
    return { errorFr: "Retrait impossible : la base de données ne répond pas." };
  }
  forgetParamVersions();
  revalidatePath("/admin/grilles");
  return { okFr: `Version ${version} retirée.` };
}
