import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { guard, readJsonBody } from "@/lib/route-guard";
import { webhookSubscriptionSchema } from "@/lib/schemas";
import { checkOutboundUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

/** Liste des souscriptions du périmètre. Le secret n'est jamais renvoyé. */
export async function GET(req: NextRequest) {
  const g = await guard(req, "ADMIN");
  if (!g.ok) return g.response;

  const items = await g.ctx.db.webhookSubscription.findMany({
    select: {
      id: true,
      url: true,
      events: true,
      entityId: true,
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

/**
 * Création d'une souscription. Le secret HMAC est fourni par l'intégrateur.
 * Elle porte le périmètre de la clé (diagnostic S01) : une clé de filiale ne
 * reçoit que les événements de sa filiale et de sa descendance ; seule une
 * clé de portée groupe crée une souscription groupe.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, "ADMIN");
  if (!g.ok) return g.response;
  const entityId = g.ctx.perimeter.all ? null : g.ctx.perimeter.entityId;
  if (!g.ctx.perimeter.all && !entityId) return problem(403, "Clé sans entité : souscription impossible.");

  const body = await readJsonBody(req, webhookSubscriptionSchema);
  if (!body.ok) return body.response;

  // Contrôle anti-SSRF : sans cela, une souscription pourrait faire émettre
  // par le serveur des requêtes vers le réseau interne ou un service de
  // métadonnées cloud.
  const urlCheck = checkOutboundUrl(body.value.url);
  if (!urlCheck.ok) {
    return problem(422, "URL de webhook refusée", urlCheck.reasonFr);
  }

  const created = await g.ctx.db.webhookSubscription.create({
    data: {
      url: urlCheck.url.toString(),
      secret: body.value.secret,
      events: JSON.stringify(body.value.events),
      entityId,
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
    entityId,
    detail: { url: created.url, events: body.value.events, entityId },
    correlationId: g.ctx.correlationId,
  });
  return ok(
    {
      id: created.id,
      url: created.url,
      events: body.value.events,
      entityId,
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
