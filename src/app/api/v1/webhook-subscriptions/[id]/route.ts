import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Désactivation (soft delete) d'une souscription webhook. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "ADMIN");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { id } = await params;
  const existing = await prisma.webhookSubscription.findUnique({ where: { id } });
  if (!existing) return problem(404, "Souscription inconnue.");

  await prisma.webhookSubscription.update({
    where: { id },
    data: { isActive: false },
  });
  await audit({
    actor: auth.identity.name,
    actorRole: auth.identity.role,
    action: "WEBHOOK_SUBSCRIPTION_DISABLED",
    resourceType: "WebhookSubscription",
    resourceId: id,
  });
  return ok({ id, isActive: false });
}
