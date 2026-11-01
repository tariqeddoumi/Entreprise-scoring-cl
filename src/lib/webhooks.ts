import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";
import { checkOutboundUrl } from "./url-safety";
import type { Prisma } from "@/generated/prisma";
import { descendants, loadTree, type EntityNode } from "./scope";

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
 * Les événements passent par l'outbox (outbox_events), écrite dans la
 * transaction métier ; le répartiteur les livre aux souscriptions de leur
 * périmètre et les reprend à délai croissant. Chaque tentative est journalisée
 * dans webhook_deliveries.
 */

export type WebhookEventType =
  | "rating.completed"
  | "rating.blocked"
  | "rating.overridden"
  | "rating.override_expired"
  | "counterparty.updated";

export interface WebhookEvent {
  type: WebhookEventType;
  data: unknown;
}

const DELIVERY_TIMEOUT_MS = 10_000;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Client ou transaction capable d'écrire dans l'outbox. */
type OutboxWriter = Pick<Prisma.TransactionClient, "outboxEvent">;

/**
 * Inscrit un événement dans l'outbox, DANS la transaction métier : si la
 * transaction échoue, l'événement n'existe pas ; si elle réussit, il sera
 * livré même si le serveur s'arrête juste après (diagnostic, événements
 * sortants). `entityId` est l'entité de la contrepartie concernée : elle
 * détermine les souscriptions autorisées à le recevoir.
 */
export async function enqueueEvent(tx: OutboxWriter, event: WebhookEvent, entityId: string | null): Promise<void> {
  await tx.outboxEvent.create({
    data: { eventId: randomUUID(), type: event.type, payload: stableStringify(event.data), entityId },
  });
}

/**
 * Publication immédiate (hors transaction) : inscrit l'événement dans
 * l'outbox puis tente aussitôt la livraison. Réservée aux opérations sans
 * transaction métier propre.
 */
export async function publishEvent(event: WebhookEvent, entityId: string | null = null): Promise<void> {
  await enqueueEvent(prisma, event, entityId);
  await dispatchOutbox();
}

const MAX_ATTEMPTS = 8;
const CLAIM_TIMEOUT_MS = 5 * 60_000;

/** Une souscription reçoit l'événement si son entité est celle de l'événement ou une ascendante. */
export function inScope(subscriptionEntity: string | null, eventEntity: string | null, tree: EntityNode[]): boolean {
  if (subscriptionEntity === null) return true;
  if (eventEntity === null) return false;
  return descendants(tree, subscriptionEntity).includes(eventEntity);
}

/**
 * Répartiteur de l'outbox : livre les événements en attente, avec reprises à
 * délai croissant. Une souscription déjà servie pour un événement ne le reçoit
 * pas une seconde fois ; l'identifiant d'événement reste stable entre les
 * tentatives (le consommateur reste idempotent).
 */
export async function dispatchOutbox(limit = 50): Promise<{ dispatched: number; failed: number }> {
  const now = new Date();
  // Événements réclamés par un traitement interrompu : remis en file.
  await prisma.outboxEvent.updateMany({
    where: { status: "DISPATCHING", nextAttemptAt: { lt: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
    data: { status: "PENDING" },
  });
  const due = await prisma.outboxEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (due.length === 0) return { dispatched: 0, failed: 0 };
  const [subscriptions, tree] = await Promise.all([
    prisma.webhookSubscription.findMany({ where: { isActive: true } }),
    loadTree(),
  ]);
  let dispatched = 0;
  let failed = 0;
  for (const ev of due) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: { id: ev.id, status: "PENDING" },
      data: { status: "DISPATCHING", nextAttemptAt: new Date() },
    });
    if (claimed.count === 0) continue;
    const targets = subscriptions.filter((s) => subscribed(s.events, ev.type) && inScope(s.entityId, ev.entityId, tree));
    const served = new Set(
      (
        await prisma.webhookDelivery.findMany({
          where: { eventId: ev.eventId, status: "DELIVERED" },
          select: { subscriptionId: true },
        })
      ).map((d) => d.subscriptionId)
    );
    const event: WebhookEvent = { type: ev.type as WebhookEventType, data: JSON.parse(ev.payload) };
    const results = await Promise.allSettled(
      targets.filter((t) => !served.has(t.id)).map((t) => deliver(t.id, t.url, t.secret, event, ev.eventId))
    );
    const ok = results.every((r) => r.status === "fulfilled" && r.value);
    const attempts = ev.attempts + 1;
    await prisma.outboxEvent.update({
      where: { id: ev.id },
      data: ok
        ? { status: "DISPATCHED", attempts, dispatchedAt: new Date(), lastError: null }
        : {
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            attempts,
            // 1, 2, 4… minutes, plafonné à une heure.
            nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** (attempts - 1)) * 60_000),
            lastError: "livraison incomplète : voir webhook_deliveries",
          },
    });
    if (ok) dispatched += 1;
    else failed += 1;
  }
  return { dispatched, failed };
}

function subscribed(events: string, type: string): boolean {
  try {
    const list = JSON.parse(events) as string[];
    return list.includes(type) || list.includes("*");
  } catch {
    return false;
  }
}

/** Une tentative de livraison ; true si le consommateur a accusé réception. */
async function deliver(
  subscriptionId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  eventId: string
): Promise<boolean> {
  // Défense en profondeur : l'URL est revalidée au moment de la livraison.
  // Une souscription peut avoir été créée avant l'ajout de ce contrôle, ou
  // insérée directement en base.
  const urlCheck = checkOutboundUrl(url);
  if (!urlCheck.ok) {
    await prisma.webhookDelivery.create({
      data: {
        subscriptionId,
        eventId,
        eventType: event.type,
        payload: "",
        status: "FAILED",
        attempts: 1,
        lastError: `URL refusée : ${urlCheck.reasonFr}`,
      },
    });
    return false;
  }

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
    return res.ok;
  } catch (err) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: err instanceof Error ? err.message : "network error",
      },
    });
    return false;
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
