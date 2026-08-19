import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

/** Désactivation d'une souscription (suppression logique, trace conservée). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "ADMIN");
  if (!g.ok) return g.response;

  const { id } = await params;
  const disabled = await prisma.webhookSubscription.updateMany({
    where: { id, isActive: true },
    data: { isActive: false },
  });
  if (disabled.count === 0) {
    const exists = await prisma.webhookSubscription.findUnique({
      where: { id },
      select: { id: true },
    });
    return exists
      ? ok({ id, isActive: false, alreadyDisabled: true })
      : problem(404, "Souscription inconnue.");
  }

  await audit({
    actor: g.ctx.identity.name,
    actorRole: g.ctx.identity.role,
    action: "WEBHOOK_SUBSCRIPTION_DISABLED",
    resourceType: "WebhookSubscription",
    resourceId: id,
    correlationId: g.ctx.correlationId,
  });
  return ok({ id, isActive: false });
}
