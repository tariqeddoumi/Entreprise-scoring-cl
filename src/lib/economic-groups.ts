import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { canWrite, descendants, loadTree, OutOfScopeError, type Perimeter } from "./scope";

/**
 * Groupes d'affaires (groupes économiques).
 *
 * Un groupe réunit des contreparties liées par le contrôle : il sert à
 * sélectionner une renotation par lot, à lire les notes d'un groupe d'un coup
 * d'œil, et prépare la vision consolidée (contagion, plafond groupe). Il est
 * rattaché à l'entité qui le suit ; ses membres sont des contreparties de cette
 * entité ou de sa descendance. Le support groupe d'une notation reste, lui,
 * soumis aux quatre conditions documentées du modèle : appartenir à un groupe
 * ne relève jamais une note.
 */

export class GroupError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const economicGroupSchema = z
  .object({
    code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_.-]+$/, "lettres, chiffres, « . », « _ » ou « - »"),
    name: z.string().trim().min(2).max(160),
    entityId: z.string().min(1).max(64).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function createGroup(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  raw: unknown
) {
  const parsed = economicGroupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GroupError(400, parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
  }
  const input = parsed.data;
  const tree = await loadTree();
  const entityId = input.entityId ?? perimeter.entityId ?? (tree.length === 1 ? tree[0].id : null);
  if (!entityId) throw new GroupError(400, "Précisez l'entité qui suit le groupe.");
  if (!canWrite(perimeter, entityId)) throw new OutOfScopeError("Entité hors de votre périmètre d'écriture.");
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.economicGroup.create({
        data: { code: input.code.toUpperCase(), name: input.name, entityId, notes: input.notes || null, createdBy: identity.name },
      });
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "ECONOMIC_GROUP_CREATED",
        resourceType: "EconomicGroup",
        resourceId: row.id,
        entityId,
        detail: { code: row.code, name: row.name },
      });
      return row;
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      throw new GroupError(409, "Ce code de groupe existe déjà dans cette entité.");
    }
    throw e;
  }
}

/**
 * Rattache (ou détache, groupId nul) des contreparties désignées par ICE ou par
 * identifiant. Les contreparties hors du périmètre d'écriture ou hors de la
 * branche de l'entité du groupe sont signalées, jamais modifiées.
 */
export async function assignToGroup(
  db: PrismaClient,
  identity: Identity,
  groupId: string | null,
  refs: string[]
): Promise<{ assigned: number; notFound: string[]; refused: string[] }> {
  const clean = [...new Set(refs.map((r) => r.trim()).filter(Boolean))].slice(0, 5000);
  if (clean.length === 0) throw new GroupError(400, "Indiquez au moins un ICE ou identifiant.");

  let branch: string[] | null = null;
  let group: { id: string; code: string; entityId: string } | null = null;
  if (groupId) {
    group = await db.economicGroup.findUnique({ where: { id: groupId }, select: { id: true, code: true, entityId: true } });
    if (!group) throw new GroupError(404, "Groupe introuvable.");
    branch = descendants(await loadTree(), group.entityId);
  }
  const rows = await db.counterparty.findMany({
    where: { OR: [{ id: { in: clean } }, { ice: { in: clean } }] },
    select: { id: true, ice: true, entityId: true, economicGroupId: true },
  });
  const found = new Set(rows.flatMap((r) => [r.id, r.ice ?? ""]));
  const notFound = clean.filter((r) => !found.has(r));
  const refused: string[] = [];
  const eligible = rows.filter((r) => {
    if (branch && !branch.includes(r.entityId)) {
      refused.push(r.ice ?? r.id);
      return false;
    }
    return true;
  });

  let assigned = 0;
  await db.$transaction(async (tx) => {
    for (const r of eligible) {
      if (r.economicGroupId === groupId) continue;
      // Client cloisonné : une contrepartie en lecture seule n'est pas modifiée.
      const u = await tx.counterparty.updateMany({ where: { id: r.id }, data: { economicGroupId: groupId } });
      if (u.count === 0) {
        refused.push(r.ice ?? r.id);
        continue;
      }
      assigned += 1;
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: groupId ? "COUNTERPARTY_GROUP_ASSIGNED" : "COUNTERPARTY_GROUP_REMOVED",
        resourceType: "Counterparty",
        resourceId: r.id,
        entityId: r.entityId,
        detail: { from: r.economicGroupId, to: groupId, groupCode: group?.code },
      });
    }
  }, { timeout: 60_000 });
  return { assigned, notFound, refused };
}
