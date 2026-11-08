"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPerimeter, getSessionIdentity } from "@/lib/session";
import { forgetCircuit, loadCircuit, WORKFLOW_CIRCUIT_KEY } from "@/lib/workflow";
import { checkCircuit, type Permission, type WorkflowCircuit } from "@/reference/workflow";

export interface CircuitActionState {
  okFr?: string;
  errorFr?: string;
  issues?: string[];
}

/**
 * Enregistrement du circuit de validation. Réservé à un administrateur du
 * groupe. S'applique aux dossiers soumis APRÈS l'enregistrement : un dossier
 * en cours garde le circuit de sa soumission. Journalisé avec l'ancien circuit.
 */
export async function saveCircuitAction(circuit: WorkflowCircuit): Promise<CircuitActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const clean: WorkflowCircuit = {
    version: 1,
    submitFunctions: (circuit.submitFunctions ?? []).map(String),
    functions: (circuit.functions ?? []).map((f) => ({
      code: String(f.code ?? "").trim().toUpperCase(),
      labelFr: String(f.labelFr ?? "").trim(),
      ...(f.profile ? { profile: f.profile } : {}),
      ...(Array.isArray(f.permissions) && f.permissions.length ? { permissions: f.permissions.map(String) as Permission[] } : {}),
    })),
    steps: (circuit.steps ?? []).map((s) => ({
      code: String(s.code ?? "").trim().toUpperCase(),
      labelFr: String(s.labelFr ?? "").trim(),
      functions: (s.functions ?? []).map(String),
      minRole: s.minRole,
      aboveExposure: s.aboveExposure === null || s.aboveExposure === undefined || String(s.aboveExposure) === "" ? null : Number(s.aboveExposure),
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.kind === "AVIS" ? { blocking: !!s.blocking, blockingTiers: (s.blockingTiers ?? []).map(String) } : {}),
      minGrade: s.minGrade === null || s.minGrade === undefined || String(s.minGrade) === "" ? null : Number(s.minGrade),
      creditTypes: (s.creditTypes ?? []).map(String),
      tiers: (s.tiers ?? []).map(String),
      conditionMode: s.conditionMode === "ALL" ? "ALL" : "ANY",
    })),
  };
  const issues = checkCircuit(clean);
  if (issues.length > 0) return { errorFr: "Le circuit n'est pas enregistré : corrigez les points ci-dessous.", issues };
  const before = await loadCircuit({ fresh: true });
  clean.version = (before.circuit.version ?? 1) + (before.stored ? 1 : 0);
  // Une fonction encore portée par un utilisateur ne se supprime pas.
  const removed = before.circuit.functions.filter((f) => !clean.functions.some((g) => g.code === f.code)).map((f) => f.code);
  if (removed.length > 0) {
    const holders = await prisma.user.findMany({ where: { jobFunction: { in: removed }, isActive: true }, select: { username: true, jobFunction: true } });
    if (holders.length > 0) {
      return { errorFr: `Fonction encore attribuée : ${holders.map((h) => `${h.jobFunction} (${h.username})`).join(", ")}. Modifiez d'abord ces comptes.` };
    }
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: WORKFLOW_CIRCUIT_KEY },
        update: { value: JSON.stringify(clean), updatedBy: session.identity.name },
        create: { key: WORKFLOW_CIRCUIT_KEY, value: JSON.stringify(clean), updatedBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "WORKFLOW_CIRCUIT_UPDATED",
        resourceType: "AppSetting",
        resourceId: WORKFLOW_CIRCUIT_KEY,
        detail: { avant: before.circuit, apres: clean },
      });
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  forgetCircuit();
  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");
  return { okFr: `Circuit enregistré (version ${clean.version}) : il s'applique aux dossiers soumis à partir de maintenant.` };
}
