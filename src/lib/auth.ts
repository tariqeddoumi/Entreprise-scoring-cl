import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Authentification API par clé (M2M). En production bancaire, ce module est
 * remplacé/complété par OAuth 2.1 / OIDC (client credentials) via l'IdP de la
 * banque — le contrat (identité + rôle dérivés du jeton, jamais du corps de
 * requête) reste identique.
 *
 * Configuration : API_KEYS="<clé>:<rôle>:<nom>[:<code entité>[:BRANCH]];…"
 * Rôles : ANALYST (lecture + scoring), RISK_MANAGER (+ overrides),
 *         ADMIN (+ webhooks, administration), READONLY (lecture seule).
 * Code entité : restreint la clé à une banque ou une filiale et à sa
 * descendance (cloisonnement, src/lib/scope.ts). Sans code, la clé couvre le
 * groupe entier : réservé aux systèmes centraux du groupe.
 *
 * Aucun secret par défaut : si API_KEYS est absent, toutes les requêtes
 * authentifiées sont refusées (deny-by-default), le démarrage est refusé en
 * production.
 */

export type Role = "READONLY" | "ANALYST" | "RISK_MANAGER" | "ADMIN";

export interface Identity {
  name: string;
  role: Role;
  /** Entité de rattachement ; nulle pour le groupe entier. */
  entityId?: string | null;
  /** Portée d'écriture : ENTITY (son entité) ou BRANCH (sa descendance). */
  writeScope?: string | null;
  /** Code d'entité d'une clé API, résolu en identifiant par le garde. */
  entityCode?: string | null;
}

/** Longueur minimale d'une clé API, en caractères. */
const MIN_KEY_LENGTH = 24;

const ROLE_RANK: Record<Role, number> = {
  READONLY: 0,
  ANALYST: 1,
  RISK_MANAGER: 2,
  ADMIN: 3,
};

/** Rôles reconnus, du moins au plus habilité. */
export const ROLES: readonly Role[] = ["READONLY", "ANALYST", "RISK_MANAGER", "ADMIN"];

export function isRole(value: string): value is Role {
  return value in ROLE_RANK;
}

/** true si `role` atteint au moins `minRole`. */
export function hasRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

interface KeyEntry {
  hash: Buffer; // SHA-256 de la clé — les clés ne sont jamais gardées en clair
  role: Role;
  name: string;
  entityCode: string | null;
  writeScope: string;
}

let cachedKeys: KeyEntry[] | null = null;
let cachedRaw: string | undefined;

function loadKeys(): KeyEntry[] {
  const raw = process.env.API_KEYS;
  if (cachedKeys && raw === cachedRaw) return cachedKeys;
  cachedRaw = raw;
  if (!raw || raw.trim() === "") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_NO_API_KEYS !== "1") {
      throw new Error(
        "API_KEYS non configuré : refus de servir des requêtes authentifiées en production (aucun secret par défaut)."
      );
    }
    cachedKeys = [];
    return cachedKeys;
  }
  cachedKeys = raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, role, name, entityCode, writeScope] = entry.split(":");
      if (!key || key.length < MIN_KEY_LENGTH) {
        throw new Error(
          `API_KEYS : chaque clé doit compter au moins ${MIN_KEY_LENGTH} caractères. ` +
            "Générer une clé : openssl rand -hex 32"
        );
      }
      const r = (role ?? "READONLY").toUpperCase() as Role;
      if (!(r in ROLE_RANK)) {
        throw new Error(`API_KEYS : rôle inconnu "${role}".`);
      }
      return {
        hash: createHash("sha256").update(key).digest(),
        role: r,
        name: name ?? "api-client",
        entityCode: entityCode?.trim() || null,
        writeScope: writeScope?.trim().toUpperCase() === "BRANCH" ? "BRANCH" : "ENTITY",
      };
    });
  return cachedKeys;
}

export type AuthResult =
  | { ok: true; identity: Identity }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Vérifie `Authorization: Bearer <clé>` et le rôle minimal requis.
 * L'identité est TOUJOURS dérivée du jeton — jamais du corps de requête.
 */
export function authenticate(req: NextRequest, minRole: Role): AuthResult {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Jeton Bearer requis." };
  }
  return authenticateToken(header.slice("Bearer ".length).trim(), minRole);
}

/**
 * Vérifie un jeton brut. Utilisé par l'API (en-tête Authorization) et par
 * l'interface web (cookie de session HttpOnly) : dans les deux cas, l'identité
 * découle du secret présenté, jamais d'une valeur fournie dans le corps.
 */
export function authenticateToken(token: string, minRole: Role): AuthResult {
  if (!token) {
    return { ok: false, status: 401, message: "Jeton absent." };
  }
  const tokenHash = createHash("sha256").update(token).digest();

  // Parcours complet et sans sortie anticipée : le temps de réponse ne
  // dépend pas de la position de la clé dans la liste.
  const keys = loadKeys();
  let match: KeyEntry | null = null;
  for (const candidate of keys) {
    if (
      candidate.hash.length === tokenHash.length &&
      timingSafeEqual(candidate.hash, tokenHash)
    ) {
      match = candidate;
    }
  }
  if (!match) {
    return { ok: false, status: 401, message: "Jeton invalide." };
  }
  if (ROLE_RANK[match.role] < ROLE_RANK[minRole]) {
    return {
      ok: false,
      status: 403,
      message: `Rôle ${match.role} insuffisant (requis : ${minRole}).`,
    };
  }
  return {
    ok: true,
    identity: {
      name: match.name,
      role: match.role,
      entityCode: match.entityCode,
      writeScope: match.writeScope,
    },
  };
}
