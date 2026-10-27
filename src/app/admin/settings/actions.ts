"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { forgetSettings, loadSettings, SETTINGS, validateSetting } from "@/lib/settings";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface SettingsActionState {
  okFr?: string;
  errorFr?: string;
}

/**
 * Enregistrement du paramétrage. Réservé à un administrateur du groupe : les
 * règles s'appliquent à toutes les banques et filiales. Chaque valeur modifiée
 * est journalisée avec sa valeur précédente.
 */
export async function settingsAction(
  _prev: SettingsActionState | undefined,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };

  const current = await loadSettings();
  const changes: Array<{ key: string; before: string; after: string }> = [];
  for (const def of SETTINGS) {
    const raw = def.kind === "boolean" ? (formData.get(def.key) ? "true" : "false") : formData.get(def.key);
    if (raw === null) continue;
    const checked = validateSetting(def.key, String(raw));
    if (!checked.ok) return { errorFr: checked.errorFr };
    if (checked.value !== current[def.key]) changes.push({ key: def.key, before: current[def.key], after: checked.value });
  }
  if (changes.length === 0) return { okFr: "Aucune modification." };

  try {
    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        await tx.appSetting.upsert({
          where: { key: c.key },
          update: { value: c.after, updatedBy: session.identity.name },
          create: { key: c.key, value: c.after, updatedBy: session.identity.name },
        });
      }
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "SETTINGS_UPDATED",
        resourceType: "AppSetting",
        resourceId: changes.map((c) => c.key).join(","),
        detail: changes,
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  forgetSettings();
  revalidatePath("/admin/settings");
  return { okFr: `${changes.length} paramètre(s) modifié(s).` };
}
