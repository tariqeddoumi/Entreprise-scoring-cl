import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { webhookSubscriptionSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Liste des souscriptions (secret jamais renvoyé). */
export async function GET(req: NextRequest) {
  const auth = authenticate(req, "ADMIN");
  if (!auth.ok) return problem(auth.status, auth.message);

  const items = await prisma.webhookSubscription.findMany({
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdBy: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ items: items.map((s) => ({ ...s, events: JSON.parse(s.events) })) });
}

/** Création d'une souscription webhook (secret HMAC fourni par l'intégrateur). */
export async function POST(req: NextRequest) {
  const auth = authenticate(req, "ADMIN");
  if (!auth.ok) return problem(auth.status, auth.message);

  const body = await req.json().catch(() => null);
  const parsed = webhookSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "Payload invalide", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }

  const created = await prisma.webhookSubscription.create({
    data: {
      url: parsed.data.url,
      secret: parsed.data.secret,
      events: JSON.stringify(parsed.data.events),
      createdBy: auth.identity.name,
    },
  });
  await audit({
    actor: auth.identity.name,
    actorRole: auth.identity.role,
    action: "WEBHOOK_SUBSCRIPTION_CREATED",
    resourceType: "WebhookSubscription",
    resourceId: created.id,
    detail: { url: created.url, events: parsed.data.events },
  });
  return ok(
    { id: created.id, url: created.url, events: parsed.data.events, isActive: created.isActive },
    201
  );
}
