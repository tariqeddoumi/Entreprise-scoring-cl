import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { webhookSubscriptionSchema } from "@/lib/schemas";
import { checkOutboundUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

/** Liste des souscriptions. Le secret n'est jamais renvoyé. */
export async function GET(req: NextRequest) {
  const g = guard(req, "ADMIN");
  if (!g.ok) return g.response;

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
  return ok({
    items: items.map((s) => ({ ...s, events: safeParseEvents(s.events) })),
  });
}

/** Création d'une souscription. Le secret HMAC est fourni par l'intégrateur. */
export async function POST(req: NextRequest) {
  const g = guard(req, "ADMIN");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, webhookSubscriptionSchema);
  if (!body.ok) return body.response;

  // Contrôle anti-SSRF : sans cela, une souscription pourrait faire émettre
  // par le serveur des requêtes vers le réseau interne ou un service de
  // métadonnées cloud.
  const urlCheck = checkOutboundUrl(body.value.url);
  if (!urlCheck.ok) {
    return problem(422, "URL de webhook refusée", urlCheck.reasonFr);
  }

  const created = await prisma.webhookSubscription.create({
    data: {
      url: urlCheck.url.toString(),
      secret: body.value.secret,
      events: JSON.stringify(body.value.events),
      createdBy: g.ctx.identity.name,
    },
  });
  await audit({
    actor: g.ctx.identity.name,
    actorRole: g.ctx.identity.role,
    action: "WEBHOOK_SUBSCRIPTION_CREATED",
    // Le secret n'est jamais journalisé.
    resourceType: "WebhookSubscription",
    resourceId: created.id,
    detail: { url: created.url, events: body.value.events },
    correlationId: g.ctx.correlationId,
  });
  return ok(
    {
      id: created.id,
      url: created.url,
      events: body.value.events,
      isActive: created.isActive,
    },
    201
  );
}

function safeParseEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}
