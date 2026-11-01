import { expireOverrides } from "./overrides";
import { prisma } from "./prisma";
import { dispatchOutbox } from "./webhooks";

/**
 * Tâches d'exploitation lancées par la tâche planifiée (cron) : expiration des
 * dérogations échues, puis livraison des événements en attente dans l'outbox.
 * Tâches système, sur tout le groupe : chaque écriture reste auditée.
 */
export async function runMaintenance(now = new Date()) {
  const expiredOverrides = await expireOverrides(prisma, now);
  const outbox = await dispatchOutbox(200);
  return { expiredOverrides, outbox };
}
