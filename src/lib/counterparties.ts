import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import type { z } from "zod";
import type { counterpartyPatchSchema, counterpartySchema } from "./schemas";
import { canWrite, entityCurrency, loadTree, OutOfScopeError, type Perimeter } from "./scope";

export class CounterpartyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Création d'une contrepartie — chemin unique de l'API et de l'écran.
 *
 * L'entité est celle demandée, à défaut celle de l'appelant ; elle doit être
 * dans son périmètre d'écriture. Pays et devise sont repris de l'entité
 * lorsqu'ils ne sont pas fournis. La création et son audit sont écrits dans
 * une même transaction.
 */
export async function createCounterparty(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  input: z.infer<typeof counterpartySchema>,
  correlationId?: string
) {
  const tree = await loadTree();
  const entityId = input.entityId ?? perimeter.entityId ?? (tree.length === 1 ? tree[0].id : null);
  if (!entityId) {
    throw new CounterpartyError(400, "Précisez l'entité (banque ou filiale) qui porte la relation.");
  }
  const entity = tree.find((e) => e.id === entityId);
  if (!entity || !entity.isActive) throw new CounterpartyError(400, "Entité inconnue ou désactivée.");
  if (!canWrite(perimeter, entityId)) throw new OutOfScopeError("Entité hors de votre périmètre d'écriture.");

  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.counterparty.create({
        data: {
          ...input,
          entityId,
          country: input.country ?? entity.country ?? null,
          currency: input.currency ?? entityCurrency(tree, entityId),
          // Création hors T24 : saisie, à rattacher au code client T24 (src/lib/core-banking.ts).
          dataSource: "SAISIE",
        },
      });
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "COUNTERPARTY_CREATED",
        resourceType: "Counterparty",
        resourceId: row.id,
        entityId,
        detail: { name: row.name, ice: row.ice, entity: entity.code, currency: row.currency },
        correlationId,
      });
      return row;
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      throw new CounterpartyError(409, "Conflit : cet ICE ou ce code client T24 est déjà enregistré dans cette entité.");
    }
    throw e;
  }
}

/** Champs modifiables d'une fiche client ; `null` efface un champ facultatif. */
export type CounterpartyPatch = z.infer<typeof counterpartyPatchSchema>;

/**
 * Modification d'une fiche client — chemin unique de l'API et de l'écran.
 *
 * Le client doit être dans le périmètre d'écriture ; un changement d'entité
 * exige aussi l'écriture sur l'entité d'arrivée. Modification et audit sont
 * écrits dans une même transaction.
 */
export async function updateCounterparty(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  id: string,
  patch: CounterpartyPatch,
  correlationId?: string
) {
  const existing = await db.counterparty.findUnique({ where: { id } });
  if (!existing) throw new CounterpartyError(404, "Client inconnu.");
  if (!canWrite(perimeter, existing.entityId)) throw new OutOfScopeError("Client hors de votre périmètre d'écriture.");
  if (existing.dataSource === "T24" && patch.coreBankingId !== undefined && patch.coreBankingId !== existing.coreBankingId) {
    throw new CounterpartyError(409, "Fiche rapatriée de T24 : son code client ne se modifie pas à la main.");
  }
  if (patch.entityId && patch.entityId !== existing.entityId) {
    const tree = await loadTree();
    const target = tree.find((e) => e.id === patch.entityId);
    if (!target || !target.isActive) throw new CounterpartyError(400, "Entité inconnue ou désactivée.");
    if (!canWrite(perimeter, target.id)) throw new OutOfScopeError("Entité d'arrivée hors de votre périmètre d'écriture.");
  }
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.counterparty.update({ where: { id }, data: patch });
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: "COUNTERPARTY_UPDATED",
        resourceType: "Counterparty",
        resourceId: id,
        entityId: row.entityId,
        detail: { before: existing, after: row },
        correlationId,
      });
      return row;
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      throw new CounterpartyError(409, "Conflit : cet ICE ou ce code client T24 est déjà enregistré dans cette entité.");
    }
    throw e;
  }
}

export interface DeleteOutcome {
  mode: "DELETED" | "DEACTIVATED";
  messageFr: string;
}

/**
 * Suppression d'un client.
 *
 * Un client sans aucun historique (notation, dossier, renotation) est supprimé.
 * Un client qui en a un est DÉSACTIVÉ : ses notations restent consultables et
 * rejouables (traçabilité exigée par la gouvernance des modèles), mais il ne
 * peut plus faire l'objet d'un nouveau dossier ni d'un lot. Il peut être
 * réactivé (`updateCounterparty` avec `isActive: true`).
 */
export async function deleteCounterparty(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  id: string,
  correlationId?: string
): Promise<DeleteOutcome> {
  const existing = await db.counterparty.findUnique({
    where: { id },
    include: { _count: { select: { ratingRuns: true, ratingCases: true, renotationItems: true } } },
  });
  if (!existing) throw new CounterpartyError(404, "Client inconnu.");
  if (!canWrite(perimeter, existing.entityId)) throw new OutOfScopeError("Client hors de votre périmètre d'écriture.");
  const { _count, ...snapshot } = existing;
  const hasHistory = _count.ratingRuns + _count.ratingCases + _count.renotationItems > 0;
  return db.$transaction(async (tx) => {
    if (hasHistory) {
      await tx.counterparty.update({ where: { id }, data: { isActive: false } });
    } else {
      await tx.counterparty.delete({ where: { id } });
    }
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: hasHistory ? "COUNTERPARTY_DEACTIVATED" : "COUNTERPARTY_DELETED",
      resourceType: "Counterparty",
      resourceId: id,
      entityId: existing.entityId,
      detail: { counterparty: snapshot, history: _count },
      correlationId,
    });
    return hasHistory
      ? {
          mode: "DEACTIVATED" as const,
          messageFr: `Client désactivé : ${_count.ratingRuns} notation(s) et ${_count.ratingCases} dossier(s) sont conservés pour la traçabilité. Il peut être réactivé depuis sa fiche.`,
        }
      : { mode: "DELETED" as const, messageFr: "Client supprimé." };
  });
}
