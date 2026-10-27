import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import type { z } from "zod";
import type { counterpartySchema } from "./schemas";
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
      throw new CounterpartyError(409, "Conflit : cet ICE est déjà enregistré dans cette entité.");
    }
    throw e;
  }
}
