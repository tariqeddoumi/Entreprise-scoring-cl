"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPerimeter, getSessionIdentity } from "@/lib/session";
import { CASE_PURPOSES_KEY, checkPurposes, type CasePurpose } from "@/reference/case-purposes";

export interface PurposesActionState {
  okFr?: string;
  errorFr?: string;
}

/**
 * Motifs d'ouverture des dossiers. Réservé à un administrateur du groupe. Un
 * motif déjà utilisé ne se supprime pas : il se désactive (les dossiers
 * existants gardent leur motif).
 */
export async function savePurposesAction(list: CasePurpose[]): Promise<PurposesActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: CasePurpose[] = (Array.isArray(list) ? list : []).slice(0, 30).map((p) => ({
    code: String(p.code ?? "").trim().toUpperCase(),
    labelFr: String(p.labelFr ?? "").trim(),
    active: !!p.active,
    ...(p.defaultExercise === "SUIVANT" || p.defaultExercise === "CONSERVE" ? { defaultExercise: p.defaultExercise } : {}),
  }));
  const issues = checkPurposes(clean);
  if (issues.length) return { errorFr: issues.join(" ") };
  const used = await prisma.ratingCase.findMany({ where: { purpose: { not: null } }, distinct: ["purpose"], select: { purpose: true } });
  const removed = used.map((u) => u.purpose!).filter((code) => !clean.some((p) => p.code === code));
  if (removed.length) return { errorFr: `Motif déjà utilisé par des dossiers : ${removed.join(", ")}. Désactivez-le au lieu de le supprimer.` };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: CASE_PURPOSES_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: CASE_PURPOSES_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "CASE_PURPOSES_UPDATED",
        resourceType: "AppSetting",
        resourceId: CASE_PURPOSES_KEY,
        detail: { purposes: clean },
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/settings");
  return { okFr: "Motifs enregistrés." };
}
