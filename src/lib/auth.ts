import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Authentification API par clé (M2M). En production bancaire, ce module est
 * remplacé/complété par OAuth 2.1 / OIDC (client credentials) via l'IdP de la
 * banque — le contrat (identité + rôle dérivés du jeton, jamais du corps de
 * requête) reste identique.
 *
 * Configuration : API_KEYS="<clé>:<rôle>:<nom>;<clé2>:<rôle2>:<nom2>"
 * Rôles : ANALYST (lecture + scoring), RISK_MANAGER (+ overrides),
 *         ADMIN (+ webhooks, administration), READONLY (lecture seule).
 *
 * Aucun secret par défaut : si API_KEYS est absent, toutes les requêtes
 * authentifiées sont refusées (deny-by-default), le démarrage est refusé en
 * production.
 */

export type Role = "READONLY" | "ANALYST" | "RISK_MANAGER" | "ADMIN";

export interface Identity {
  name: string;
  role: Role;
}

const ROLE_RANK: Record<Role, number> = {
  READONLY: 0,
  ANALYST: 1,
  RISK_MANAGER: 2,
  ADMIN: 3,
};

interface KeyEntry {
  hash: Buffer; // SHA-256 de la clé — les clés ne sont jamais gardées en clair
  role: Role;
  name: string;
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
      const [key, role, name] = entry.split(":");
      if (!key || key.length < 16) {
        throw new Error("API_KEYS : chaque clé doit compter au moins 16 caractères.");
      }
      const r = (role ?? "READONLY").toUpperCase() as Role;
      if (!(r in ROLE_RANK)) {
        throw new Error(`API_KEYS : rôle inconnu "${role}".`);
      }
      return {
        hash: createHash("sha256").update(key).digest(),
        role: r,
        name: name ?? "api-client",
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
  const token = header.slice("Bearer ".length).trim();
  const tokenHash = createHash("sha256").update(token).digest();

  const keys = loadKeys();
  const match = keys.find(
    (k) => k.hash.length === tokenHash.length && timingSafeEqual(k.hash, tokenHash)
  );
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
  return { ok: true, identity: { name: match.name, role: match.role } };
}
