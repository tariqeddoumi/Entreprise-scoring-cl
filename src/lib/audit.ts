import type { Prisma } from "@/generated/prisma";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";

export interface AuditEntry {
  actor: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail?: unknown;
  correlationId?: string;
}

/**
 * Audit applicatif append-only.
 *
 * Pour une écriture critique, utiliser `auditWithin(tx, ...)` DANS la même
 * transaction que l'opération : l'opération échoue si l'audit échoue
 * (jamais de « fail-open » silencieux).
 */
export async function auditWithin(
  tx: Prisma.TransactionClient,
  entry: AuditEntry
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actor: entry.actor,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      detail: entry.detail !== undefined ? stableStringify(entry.detail) : null,
      correlationId: entry.correlationId,
    },
  });
}

/** Audit hors transaction (événements non critiques : lectures sensibles...). */
export async function audit(entry: AuditEntry): Promise<void> {
  await auditWithin(prisma, entry);
}
