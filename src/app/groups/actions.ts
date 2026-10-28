"use server";

import { revalidatePath } from "next/cache";
import { assignToGroup, createGroup, GroupError } from "@/lib/economic-groups";
import { isOutOfScope } from "@/lib/scope";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";

/** Actions serveur des groupes d'affaires : rôle ANALYST, client cloisonné. */

export interface GroupActionResult {
  ok: boolean;
  errorFr?: string;
  okFr?: string;
}

function failure(e: unknown): GroupActionResult {
  if (e instanceof GroupError) return { ok: false, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorFr: "Hors de votre périmètre d'écriture." };
  console.error("[groupes]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Opération impossible (base indisponible ?)." };
}

export async function createGroupAction(_prev: GroupActionResult, fd: FormData): Promise<GroupActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const g = await createGroup(await getDb(), await getPerimeter(), session.identity, {
      code: String(fd.get("code") ?? ""),
      name: String(fd.get("name") ?? ""),
      ...(fd.get("entityId") ? { entityId: String(fd.get("entityId")) } : {}),
      ...(String(fd.get("notes") ?? "").trim() ? { notes: String(fd.get("notes")) } : {}),
    });
    revalidatePath("/groups");
    return { ok: true, okFr: `Groupe ${g.code} créé.` };
  } catch (e) {
    return failure(e);
  }
}

export async function assignGroupAction(_prev: GroupActionResult, fd: FormData): Promise<GroupActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const groupId = String(fd.get("groupId") ?? "") || null;
  const refs = String(fd.get("refs") ?? "").split(/[\s,;]+/);
  try {
    const r = await assignToGroup(await getDb(), session.identity, groupId, refs);
    if (groupId) revalidatePath(`/groups/${groupId}`);
    revalidatePath("/groups");
    revalidatePath("/counterparties", "layout");
    const extra = [
      r.notFound.length ? `introuvable(s) : ${r.notFound.slice(0, 10).join(", ")}${r.notFound.length > 10 ? "…" : ""}` : "",
      r.refused.length ? `hors branche ou hors périmètre : ${r.refused.slice(0, 10).join(", ")}` : "",
    ].filter(Boolean);
    return {
      ok: r.assigned > 0 || extra.length === 0,
      okFr: `${r.assigned} contrepartie(s) ${groupId ? "rattachée(s)" : "détachée(s)"}.${extra.length ? ` ${extra.join(" ; ")}.` : ""}`,
      ...(r.assigned === 0 && extra.length ? { errorFr: `Aucune modification : ${extra.join(" ; ")}.` } : {}),
    };
  } catch (e) {
    return failure(e);
  }
}
