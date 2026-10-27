import { z } from "zod";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { prisma } from "./prisma";
import { canRead, ENTITY_TYPES, forgetTree, loadTree, pathOf, type Perimeter } from "./scope";

/**
 * Administration de l'organisation (groupe, banques, filiales).
 *
 * Un administrateur gère les entités de sa branche ; seul un administrateur du
 * groupe crée une racine. Une entité ne se supprime pas — ses dossiers et son
 * journal en dépendent — : elle se désactive, ce qui ferme l'accès de ses
 * utilisateurs sans masquer ses dossiers à la maison mère.
 */

export class EntityError extends Error {}

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur au format #RRGGBB");
const logoSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("/"), "Logo : adresse https:// ou chemin /…");

export const entityInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,23}$/, "Code : 2 à 24 caractères, majuscules, chiffres et tirets"),
  name: z.string().trim().min(2).max(160),
  type: z.enum(ENTITY_TYPES),
  parentId: z.string().min(1).nullable(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Pays : code ISO à deux lettres")
    .nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Devise : code ISO à trois lettres"),
  toolName: z.string().trim().max(80).nullable(),
  logoUrl: logoSchema.nullable(),
  primaryColor: colorSchema.nullable(),
});

export type EntityInput = z.infer<typeof entityInputSchema>;

function assertInBranch(scope: Perimeter, entityId: string | null): void {
  if (scope.all) return;
  if (!entityId || !canRead(scope, entityId)) {
    throw new EntityError("Entité hors de votre périmètre d'administration.");
  }
}

export async function createEntity(actor: Identity, scope: Perimeter, input: EntityInput) {
  const tree = await loadTree();
  if (!input.parentId && !scope.all) throw new EntityError("Seul un administrateur du groupe crée une entité racine.");
  const parent = input.parentId ? tree.find((e) => e.id === input.parentId) : null;
  if (input.parentId && !parent) throw new EntityError("Entité mère inconnue.");
  assertInBranch(scope, input.parentId);
  if (tree.some((e) => e.code === input.code)) throw new EntityError(`Le code « ${input.code} » est déjà utilisé.`);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.entity.create({
      data: { ...input, path: "/", level: parent ? parent.level + 1 : 0 },
    });
    const path = pathOf(row.id, parent?.path ?? null);
    const updated = await tx.entity.update({ where: { id: row.id }, data: { path } });
    await auditWithin(tx, {
      actor: actor.name,
      actorRole: actor.role,
      action: "ENTITY_CREATED",
      resourceType: "Entity",
      resourceId: row.id,
      entityId: row.id,
      detail: input,
    });
    return updated;
  });
  forgetTree();
  return created;
}

export async function updateEntity(
  actor: Identity,
  scope: Perimeter,
  id: string,
  input: Omit<EntityInput, "parentId" | "code">
) {
  const tree = await loadTree();
  const existing = tree.find((e) => e.id === id);
  if (!existing) throw new EntityError("Entité inconnue.");
  assertInBranch(scope, id);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.entity.update({ where: { id }, data: input });
    await auditWithin(tx, {
      actor: actor.name,
      actorRole: actor.role,
      action: "ENTITY_UPDATED",
      resourceType: "Entity",
      resourceId: id,
      entityId: id,
      detail: { avant: existing, apres: input },
    });
    return row;
  });
  forgetTree();
  return updated;
}

export async function setEntityActive(actor: Identity, scope: Perimeter, id: string, active: boolean) {
  const tree = await loadTree();
  const existing = tree.find((e) => e.id === id);
  if (!existing) throw new EntityError("Entité inconnue.");
  assertInBranch(scope, id);
  if (!active && scope.entityId === id) {
    throw new EntityError("Un administrateur ne désactive pas sa propre entité.");
  }
  if (existing.isActive === active) return;
  await prisma.$transaction(async (tx) => {
    await tx.entity.update({ where: { id }, data: { isActive: active } });
    await auditWithin(tx, {
      actor: actor.name,
      actorRole: actor.role,
      action: active ? "ENTITY_REACTIVATED" : "ENTITY_DEACTIVATED",
      resourceType: "Entity",
      resourceId: id,
      entityId: id,
      detail: { code: existing.code },
    });
  });
  forgetTree();
}
