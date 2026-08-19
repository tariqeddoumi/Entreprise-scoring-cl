import type { NextRequest, NextResponse } from "next/server";
import { authenticate, type Identity, type Role } from "./auth";
import { problem } from "./api-utils";
import { config } from "./env";
import { checkRateLimit } from "./rate-limit";

/**
 * Garde unique appliqué à toute route métier.
 *
 * Regroupe, dans un ordre volontaire, les contrôles transverses :
 *  1. authentification et autorisation (identité issue du jeton) ;
 *  2. limitation de débit par identité ;
 *  3. lecture du corps avec plafond de taille.
 *
 * Centraliser ces contrôles évite qu'une route nouvelle en oublie un —
 * cause classique de point d'entrée non protégé.
 */

export interface GuardContext {
  identity: Identity;
  correlationId?: string;
  idempotencyKey?: string;
}

export type GuardResult =
  | { ok: true; ctx: GuardContext }
  | { ok: false; response: NextResponse };

export function guard(req: NextRequest, minRole: Role): GuardResult {
  const auth = authenticate(req, minRole);
  if (!auth.ok) {
    return { ok: false, response: problem(auth.status, auth.message) };
  }

  const rate = checkRateLimit(`${auth.identity.name}:${minRole}`);
  if (!rate.allowed) {
    const response = problem(
      429,
      "Trop de requêtes",
      `Limite de ${rate.limit} requêtes par minute atteinte.`
    );
    response.headers.set("Retry-After", String(rate.retryAfterSeconds));
    response.headers.set("X-RateLimit-Limit", String(rate.limit));
    response.headers.set("X-RateLimit-Remaining", "0");
    return { ok: false, response };
  }

  return {
    ok: true,
    ctx: {
      identity: auth.identity,
      correlationId: req.headers.get("x-correlation-id") ?? undefined,
      idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
    },
  };
}

export type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

/**
 * Lit et valide le corps JSON d'une requête.
 *
 * Le plafond de taille est appliqué avant l'analyse : un corps volumineux est
 * refusé sans être désérialisé, ce qui protège la mémoire du processus.
 */
export async function readJsonBody<T>(
  req: NextRequest,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: (string | number)[]; message: string }> } } }
): Promise<BodyResult<T>> {
  const maxBytes = config().maxRequestBodyBytes;

  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    return {
      ok: false,
      response: problem(
        413,
        "Corps de requête trop volumineux",
        `Maximum ${Math.floor(maxBytes / 1024)} Ko.`
      ),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, response: problem(400, "Corps de requête illisible.") };
  }

  // Contrôle réel : l'en-tête déclaré n'est pas une preuve.
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return {
      ok: false,
      response: problem(
        413,
        "Corps de requête trop volumineux",
        `Maximum ${Math.floor(maxBytes / 1024)} Ko.`
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: problem(400, "JSON invalide.") };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      response: problem(
        400,
        "Payload invalide",
        result.error.issues
          .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
          .join(" ; ")
      ),
    };
  }
  return { ok: true, value: result.data };
}
