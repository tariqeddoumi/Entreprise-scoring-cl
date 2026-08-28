import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { config as appConfig } from "@/lib/env";

/**
 * En-têtes de sécurité et politique d'origine croisée.
 *
 * Appliqué à toutes les réponses. La politique de sécurité du contenu est
 * volontairement stricte : l'application ne charge aucune ressource externe,
 * ce qui rend inutile toute autorisation de domaine tiers.
 */

const SECURITY_HEADERS: Record<string, string> = {
  // Empêche l'interprétation d'un type MIME différent de celui déclaré.
  "X-Content-Type-Options": "nosniff",
  // Interdit l'inclusion dans une iframe (protection contre le détournement de clic).
  "X-Frame-Options": "DENY",
  // Ne divulgue pas l'URL complète aux domaines tiers.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Désactive les API navigateur dont l'application n'a aucun usage.
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  // Empêche la mise en cache partagée de réponses potentiellement sensibles.
  "Cache-Control": "no-store, max-age=0",
};

/**
 * `next dev` enveloppe chaque module compilé dans un `eval(...)` pour générer
 * des cartes source rapides (comportement par défaut de webpack en
 * développement, hors du contrôle de ce dépôt). Sous la CSP stricte de
 * production, ce `eval` est bloqué : aucun composant client n'hydrate,
 * silencieusement — formulaires, filtres et boutons cessent de répondre sans
 * la moindre erreur visible. `unsafe-eval` n'est donc admis qu'en
 * développement, jamais en production ni en préproduction.
 */
export function buildCsp(isProduction: boolean): string {
  return [
    "default-src 'self'",
    // Next.js injecte des styles en ligne ; aucun script en ligne n'est autorisé
    // au-delà de l'amorçage du framework.
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "img-src 'self' data:",
    "font-src 'self'",
    // Aucun appel réseau vers un domaine tiers.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const cfg = appConfig();
  const origin = req.headers.get("origin");
  const isAllowedOrigin = origin !== null && cfg.corsAllowedOrigins.includes(origin);

  // Requête préparatoire d'origine croisée.
  if (req.method === "OPTIONS" && origin !== null) {
    if (!isAllowedOrigin) {
      // Refus explicite : aucune en-tête d'autorisation n'est renvoyée.
      return new NextResponse(null, { status: 403 });
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Idempotency-Key, X-Correlation-ID",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }

  const res = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  res.headers.set("Content-Security-Policy", buildCsp(cfg.isProduction));

  if (cfg.isProduction) {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  if (isAllowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }

  return res;
}

/**
 * Next.js attend un export nommé « config » : le module de configuration
 * applicative est donc importé sous l'alias « appConfig ».
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
