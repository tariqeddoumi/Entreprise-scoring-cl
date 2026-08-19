import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";

/**
 * Dispatch des webhooks sortants.
 *
 * Sécurité (contrat consommateur) :
 *  - signature HMAC SHA-256 de la représentation brute exacte du corps ;
 *  - en-têtes : X-Webhook-Id (nonce anti-rejeu), X-Webhook-Timestamp,
 *    X-Webhook-Event, X-Webhook-Signature: sha256=<hex> ;
 *  - le consommateur DOIT vérifier signature + fenêtre temporelle (300 s
 *    recommandées) + unicité de l'id, et être idempotent (livraison
 *    au moins une fois).
 *
 * Chaque tentative est journalisée dans webhook_deliveries. Les échecs sont
 * réessayables via le job de relivraison (retry exponentiel côté worker).
 */

export type WebhookEventType =
  | "rating.completed"
  | "rating.blocked"
  | "rating.overridden"
  | "counterparty.updated";

export interface WebhookEvent {
  type: WebhookEventType;
  data: unknown;
}

const DELIVERY_TIMEOUT_MS = 10_000;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Publie un événement vers toutes les souscriptions actives abonnées à ce type.
 * Best-effort : les échecs sont journalisés, jamais bloquants pour la
 * transaction métier (le résultat métier est déjà persisté et auditable).
 */
export async function publishEvent(event: WebhookEvent): Promise<void> {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { isActive: true },
  });
  const targets = subscriptions.filter((s) => {
    try {
      const events = JSON.parse(s.events) as string[];
      return events.includes(event.type) || events.includes("*");
    } catch {
      return false;
    }
  });

  await Promise.allSettled(targets.map((sub) => deliver(sub.id, sub.url, sub.secret, event)));
}

async function deliver(
  subscriptionId: string,
  url: string,
  secret: string,
  event: WebhookEvent
): Promise<void> {
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();
  const rawBody = stableStringify({
    id: eventId,
    type: event.type,
    timestamp,
    data: event.data,
  });
  const signature = signPayload(secret, timestamp, rawBody);

  const delivery = await prisma.webhookDelivery.create({
    data: {
      subscriptionId,
      eventId,
      eventType: event.type,
      payload: rawBody,
      status: "PENDING",
    },
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": eventId,
        "X-Webhook-Timestamp": timestamp,
        "X-Webhook-Event": event.type,
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: res.ok ? "DELIVERED" : "FAILED",
        attempts: { increment: 1 },
        lastError: res.ok ? null : `HTTP ${res.status}`,
        deliveredAt: res.ok ? new Date() : null,
      },
    });
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: err instanceof Error ? err.message : "network error",
      },
    });
  }
}
