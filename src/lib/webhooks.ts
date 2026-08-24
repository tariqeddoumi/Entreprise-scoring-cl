import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";
import { checkOutboundUrl } from "./url-safety";

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
  // Défense en profondeur : l'URL est revalidée au moment de la livraison.
  // Une souscription peut avoir été créée avant l'ajout de ce contrôle, ou
  // insérée directement en base.
  const urlCheck = checkOutboundUrl(url);
  if (!urlCheck.ok) {
    await prisma.webhookDelivery.create({
      data: {
        subscriptionId,
        eventId: randomUUID(),
        eventType: event.type,
        payload: "",
        status: "FAILED",
        attempts: 1,
        lastError: `URL refusée : ${urlCheck.reasonFr}`,
      },
    });
    return;
  }

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
      // Une redirection permettrait de contourner le contrôle d'URL : le
      // consommateur doit exposer une adresse finale.
      redirect: "manual",
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

/**
 * Vérifie la signature d'un événement reçu — fournie aux intégrateurs comme
 * implémentation de référence, et utilisée par les tests.
 *
 * Le consommateur doit également rejeter les horodatages hors fenêtre et
 * mémoriser l'identifiant d'événement (livraison au moins une fois).
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  receivedSignature: string,
  now = Date.now(),
  toleranceSeconds = 300
): { valid: boolean; reasonFr?: string } {
  const expected = signPayload(secret, timestamp, rawBody);
  const received = receivedSignature.replace(/^sha256=/, "");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reasonFr: "Signature invalide." };
  }

  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt)) {
    return { valid: false, reasonFr: "Horodatage illisible." };
  }
  if (Math.abs(now - sentAt) > toleranceSeconds * 1000) {
    return {
      valid: false,
      reasonFr: `Horodatage hors fenêtre de ${toleranceSeconds} secondes (rejeu probable).`,
    };
  }
  return { valid: true };
}
