import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { CounterpartyError, deleteCounterparty, updateCounterparty } from "@/lib/counterparties";
import { guard, readJsonBody } from "@/lib/route-guard";
import { counterpartyPatchSchema } from "@/lib/schemas";
import { publishEvent } from "@/lib/webhooks";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { id } = await params;
  const counterparty = await g.ctx.db.counterparty.findUnique({ where: { id } });
  if (!counterparty) return problem(404, "Client inconnu.");
  return ok(counterparty);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(req, "ANALYST");
  if (!g.ok) return g.response;

  const { id } = await params;
  const body = await readJsonBody(req, counterpartyPatchSchema);
  if (!body.ok) return body.response;

  try {
    // Même chemin que l'écran : contrôle du périmètre, modification et audit
    // dans une seule transaction.
    const updated = await updateCounterparty(g.ctx.db, g.ctx.perimeter, g.ctx.identity, id, body.value, g.ctx.correlationId);

    // L'événement « counterparty.updated » passe par l'outbox et n'est livré
    // qu'aux souscriptions du périmètre de l'entité (D-43).
    void publishEvent(
      {
        type: "counterparty.updated",
        data: {
          counterpartyId: id,
          changedFields: Object.keys(body.value).sort(),
          isActive: updated.isActive,
        },
      },
      updated.entityId
    ).catch(() => undefined);

    return ok(updated);
  } catch (e) {
    if (e instanceof CounterpartyError) return problem(e.status, e.message);
    if (isOutOfScope(e)) return problem(403, "Client ou entité hors de votre périmètre d'écriture.");
    throw e;
  }
}

/**
 * Suppression : définitive pour un client sans historique ; désactivation
 * (historique conservé) dès qu'une notation, un dossier ou un lot le concerne.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const { id } = await params;
  try {
    const outcome = await deleteCounterparty(g.ctx.db, g.ctx.perimeter, g.ctx.identity, id, g.ctx.correlationId);
    return ok({ id, ...outcome });
  } catch (e) {
    if (e instanceof CounterpartyError) return problem(e.status, e.message);
    if (isOutOfScope(e)) return problem(403, "Client hors de votre périmètre d'écriture.");
    throw e;
  }
}
