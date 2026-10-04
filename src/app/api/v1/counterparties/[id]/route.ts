import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { counterpartyPatchSchema } from "@/lib/schemas";
import { publishEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { id } = await params;
  const counterparty = await prisma.counterparty.findUnique({ where: { id } });
  if (!counterparty) return problem(404, "Contrepartie inconnue.");
  return ok(counterparty);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "ANALYST");
  if (!g.ok) return g.response;

  const { id } = await params;
  const body = await readJsonBody(req, counterpartyPatchSchema);
  if (!body.ok) return body.response;

  const existing = await prisma.counterparty.findUnique({ where: { id } });
  if (!existing) return problem(404, "Contrepartie inconnue.");

  try {
    // Modification et audit dans une seule transaction, comme à la création :
    // hors transaction, un échec de l'audit laissait la fiche modifiée sans
    // trace de son auteur.
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.counterparty.update({ where: { id }, data: body.value });
      await auditWithin(tx, {
        actor: g.ctx.identity.name,
        actorRole: g.ctx.identity.role,
        action: "COUNTERPARTY_UPDATED",
        resourceType: "Counterparty",
        resourceId: id,
        detail: { before: existing, after: row },
        correlationId: g.ctx.correlationId,
      });
      return row;
    });

    // L'événement « counterparty.updated » était proposé à la souscription
    // (contrat OpenAPI, validation) sans jamais être émis (D-43). Publication
    // après validation de la transaction, au mieux, comme pour les notations.
    void publishEvent({
      type: "counterparty.updated",
      data: {
        counterpartyId: id,
        changedFields: Object.keys(body.value).sort(),
        isActive: updated.isActive,
      },
    }).catch(() => undefined);

    return ok(updated);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return problem(409, "Conflit : cet ICE est déjà enregistré.");
    }
    throw e;
  }
}
