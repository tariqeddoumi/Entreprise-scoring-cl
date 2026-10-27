import type { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/generated/prisma";
import { authenticate, type Identity, type Role } from "./auth";
import { problem } from "./api-utils";
import { config } from "./env";
import { checkRateLimit } from "./rate-limit";
import {
  loadTree,
  perimeterFor,
  PERIMETER_ALL,
  PERIMETER_NONE,
  scopedPrisma,
  type Perimeter,
} from "./scope";

/**
 * Garde unique appliqué à toute route métier.
 *
 * Regroupe, dans un ordre volontaire, les contrôles transverses :
 *  1. authentification et autorisation (identité issue du jeton) ;
 *  2. limitation de débit par identité ;
 *  3. périmètre de l'identité (banque, filiale) et client de base de données
 *     cloisonné : une route ne manipule jamais le client brut ;
 *  4. lecture du corps avec plafond de taille.
 *
 * Centraliser ces contrôles évite qu'une route nouvelle en oublie un —
 * cause classique de point d'entrée non protégé.
 */

export interface GuardContext {
  identity: Identity;
  perimeter: Perimeter;
  /** Client cloisonné au périmètre de l'identité. */
  db: PrismaClient;
  correlationId?: string;
  idempotencyKey?: string;
}

export type GuardResult =
  | { ok: true; ctx: GuardContext }
  | { ok: false; response: NextResponse };

/**
 * Périmètre d'une clé API : sans code d'entité, le groupe entier (systèmes
 * centraux) ; avec un code, l'entité et sa descendance. Un code inconnu ne
 * donne accès à rien : une clé mal configurée est refusée, jamais élargie.
 */
async function apiKeyPerimeter(identity: Identity): Promise<Perimeter> {
  if (!identity.entityCode) return PERIMETER_ALL;
  const entity = (await loadTree()).find((e) => e.code === identity.entityCode);
  if (!entity) return PERIMETER_NONE;
  identity.entityId = entity.id;
  return perimeterFor({ entityId: entity.id, writeScope: identity.writeScope, role: identity.role });
}

export async function guard(req: NextRequest, minRole: Role): Promise<GuardResult> {
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

  const perimeter = await apiKeyPerimeter(auth.identity);
  if (!perimeter.all && perimeter.read.length === 0) {
    return {
      ok: false,
      response: problem(403, "Clé API sans périmètre", "Le code d'entité de la clé est inconnu ou désactivé."),
    };
  }

  return {
    ok: true,
    ctx: {
      identity: auth.identity,
      perimeter,
      db: scopedPrisma(perimeter),
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
