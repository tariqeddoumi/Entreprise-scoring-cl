import { config } from "./env";

/**
 * Limitation de débit par identité appelante, en fenêtre glissante.
 *
 * Implémentation en mémoire, suffisante pour un déploiement mono-instance.
 * En cluster, remplacer le magasin par Redis ou un service dédié : la
 * signature `checkRateLimit` reste inchangée.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_TRACKED_IDENTITIES = 10_000;

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Secondes avant réinitialisation, pour l'en-tête Retry-After. */
  retryAfterSeconds: number;
}

export function checkRateLimit(identityKey: string, now = Date.now()): RateLimitResult {
  const limit = config().rateLimitPerMinute;
  if (limit === 0) {
    return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
  }

  const existing = windows.get(identityKey);
  if (!existing || now >= existing.resetAt) {
    // Purge opportuniste : évite une croissance non bornée de la table.
    if (windows.size >= MAX_TRACKED_IDENTITIES) {
      for (const [key, w] of windows) {
        if (now >= w.resetAt) windows.delete(key);
      }
    }
    windows.set(identityKey, { count: 1, resetAt: now + WINDOW_MS });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    limit,
    remaining,
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Réinitialise le compteur — réservé aux tests. */
export function resetRateLimits(): void {
  windows.clear();
}
