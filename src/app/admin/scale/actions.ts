"use server";

import { revalidatePath } from "next/cache";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkNewVersion, forgetScaleVersions, loadScaleVersions, RATING_SCALE_KEY, storedVersions, today } from "@/lib/rating-scale";
import type { MasterScaleVersion } from "@/reference/rating-scale";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface ScaleActionState {
  okFr?: string;
  errorFr?: string;
}

const GROUP_ONLY = "Réservé à un administrateur du groupe : l'échelle s'applique à toutes les banques et filiales.";

/** Lecture du formulaire : classes du meilleur au moins bon risque. */
function readForm(fd: FormData): MasterScaleVersion {
  const grades = fd.getAll("grade").map(String);
  const mins = fd.getAll("minScore").map(String);
  const labels = fd.getAll("labelFr").map(String);
  const bands = grades
    .map((g, i) => ({ grade: g.trim(), minScore: mins[i]?.trim() ? Number(mins[i].replace(",", ".")) : null, labelFr: (labels[i] ?? "").trim() }))
    .filter((b) => b.grade !== "" || b.labelFr !== "");
  return {
    version: String(fd.get("version") ?? "").trim(),
    effectiveFrom: String(fd.get("effectiveFrom") ?? "").trim(),
    labelFr: String(fd.get("labelFr_scale") ?? "").trim(),
    status: fd.get("status") === "CALIBRATED" ? "CALIBRATED" : "PROVISIONAL",
    noteFr: String(fd.get("noteFr") ?? "").trim() || undefined,
    bands,
  };
}

async function save(next: MasterScaleVersion[], identity: { name: string; role: string }, action: string, detail: unknown) {
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: RATING_SCALE_KEY },
      update: { value: JSON.stringify(next), updatedBy: identity.name },
      create: { key: RATING_SCALE_KEY, value: JSON.stringify(next), updatedBy: identity.name },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action,
      resourceType: "RatingScale",
      resourceId: RATING_SCALE_KEY,
      detail,
    });
  });
  forgetScaleVersions();
  revalidatePath("/admin/scale");
  revalidatePath("/models", "layout");
}

/**
 * Enregistre une nouvelle version de l'échelle (ou modifie une version future
 * encore sans effet). Une version en vigueur ne se modifie jamais.
 */
export async function saveScaleVersionAction(_prev: ScaleActionState | undefined, fd: FormData): Promise<ScaleActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  const g = { identity: session.identity };
  const candidate = readForm(fd);
  const replacing = String(fd.get("replacing") ?? "").trim() || undefined;
  const all = await loadScaleVersions({ fresh: true });
  const issues = checkNewVersion(all, candidate, today(), replacing);
  if (issues.length > 0) return { errorFr: issues.slice(0, 8).join(" ") };
  try {
    const stored = (await storedVersions()).filter((v) => v.version !== replacing);
    const entry: MasterScaleVersion = { ...candidate, createdBy: g.identity.name, createdAt: new Date().toISOString() };
    await save([...stored, entry], g.identity, replacing ? "RATING_SCALE_UPDATED" : "RATING_SCALE_CREATED", { replacing: replacing ?? null, version: entry });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  return {
    okFr: `Version ${candidate.version} enregistrée : elle s'appliquera aux notations calculées à partir du ${candidate.effectiveFrom}. Les notations antérieures gardent leur échelle.`,
  };
}

/** Retrait d'une version future (pas encore en vigueur). */
export async function deleteScaleVersionAction(version: string): Promise<ScaleActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  const g = { identity: session.identity };
  const stored = await storedVersions();
  const target = stored.find((v) => v.version === version);
  if (!target) return { errorFr: `Version ${version} introuvable (la version embarquée ne se retire pas).` };
  if (target.effectiveFrom <= today()) return { errorFr: `La version ${version} est en vigueur ou l'a été : elle est figée.` };
  try {
    await save(stored.filter((v) => v.version !== version), g.identity, "RATING_SCALE_DELETED", { version: target });
  } catch {
    return { errorFr: "Retrait impossible : la base de données ne répond pas." };
  }
  return { okFr: `Version ${version} retirée.` };
}
