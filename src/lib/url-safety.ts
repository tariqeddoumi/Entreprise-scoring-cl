import { isIP } from "node:net";
import { config } from "./env";

/**
 * Contrôle des URL fournies par un client avant tout appel sortant.
 *
 * Objectif : empêcher une requête forgée côté serveur (SSRF). Sans ce
 * contrôle, un administrateur pourrait enregistrer un webhook pointant vers
 * un service interne, un métadonnée de cloud ou une adresse de bouclage, et
 * faire émettre par le serveur des requêtes qu'il ne pourrait pas émettre
 * lui-même.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
]);

export type UrlCheck = { ok: true; url: URL } | { ok: false; reasonFr: string };

export function checkOutboundUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reasonFr: "URL invalide." };
  }

  const cfg = config();

  if (url.protocol !== "https:" && !(url.protocol === "http:" && !cfg.isProduction)) {
    return {
      ok: false,
      reasonFr: "Seul le protocole https est autorisé (http toléré hors production).",
    };
  }

  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reasonFr: "Les identifiants dans l'URL ne sont pas autorisés.",
    };
  }

  if (cfg.allowPrivateWebhookUrls) return { ok: true, url };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, reasonFr: `Hôte interne refusé : ${host}.` };
  }

  const version = isIP(host);
  if (version === 4 && isPrivateIPv4(host)) {
    return { ok: false, reasonFr: `Adresse IPv4 privée ou réservée refusée : ${host}.` };
  }
  if (version === 6 && isPrivateIPv6(host)) {
    return { ok: false, reasonFr: `Adresse IPv6 privée ou réservée refusée : ${host}.` };
  }

  return { ok: true, url };
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // forme inattendue : refus par précaution
  }
  const [a, b] = parts;
  return (
    a === 0 || // réseau courant
    a === 10 || // privé
    a === 127 || // bouclage
    (a === 169 && b === 254) || // lien-local, inclut les métadonnées cloud
    (a === 172 && b >= 16 && b <= 31) || // privé
    (a === 192 && b === 168) || // privé
    (a === 100 && b >= 64 && b <= 127) || // partagé (CGNAT)
    (a === 192 && b === 0) || // usage particulier
    (a === 198 && (b === 18 || b === 19)) || // évaluation de performance
    a >= 224 // multidiffusion et réservé
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "::" ||
    h === "::1" || // bouclage
    h.startsWith("fc") || // adresses locales uniques
    h.startsWith("fd") ||
    h.startsWith("fe8") || // lien-local
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb") ||
    h.startsWith("ff") || // multidiffusion
    h.startsWith("::ffff:") // IPv4 encapsulée
  );
}
