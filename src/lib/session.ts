import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolveSession, type SessionInfo } from "./accounts";
import { hasRole, type Identity, type Role } from "./auth";

/**
 * Session de l'interface web.
 *
 * Le cookie porte un jeton aléatoire de 256 bits, en HttpOnly, Secure et
 * SameSite=Strict ; la base n'en conserve que l'empreinte. L'identité et le
 * rôle sont relus en base à chaque requête : une désactivation, un changement
 * de rôle ou une réinitialisation de mot de passe prennent effet
 * immédiatement, sans attendre l'expiration du cookie.
 *
 *  - HttpOnly empêche toute lecture par du JavaScript (vol par script
 *    intersites) ;
 *  - SameSite=Strict empêche l'envoi depuis un site tiers (falsification de
 *    requête intersites), en complément du contrôle d'origine intégré aux
 *    actions serveur.
 *
 * Les clés API n'ouvrent plus de session : elles restent réservées aux
 * échanges entre systèmes, par l'en-tête Authorization.
 *
 * L'identité est toujours dérivée de la session, jamais d'un champ de formulaire.
 */

export const SESSION_COOKIE = "corp_scoring_session";

/** Session courante, résolue une seule fois par requête. */
export const getCurrentSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  try {
    return await resolveSession(store.get(SESSION_COOKIE)?.value);
  } catch {
    // Base injoignable : aucune session ne peut être établie.
    return null;
  }
});

export async function getSessionIdentity(minRole: Role): Promise<
  { ok: true; identity: Identity } | { ok: false; reasonFr: string }
> {
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, reasonFr: "Session absente ou expirée : authentifiez-vous." };
  }
  if (session.mustChangePassword) {
    return {
      ok: false,
      reasonFr: "Changement de mot de passe requis avant toute opération.",
    };
  }
  if (!hasRole(session.identity.role, minRole)) {
    return {
      ok: false,
      reasonFr: `Rôle ${session.identity.role} insuffisant (requis : ${minRole}).`,
    };
  }
  return { ok: true, identity: session.identity };
}

/**
 * Exige une session valide pour afficher une page.
 *  - sans session : écran de connexion ;
 *  - mot de passe provisoire : écran de changement de mot de passe ;
 *  - rôle insuffisant : tableau de bord.
 */
export async function requireSession(minRole: Role = "READONLY"): Promise<Identity> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/account/password");
  if (!hasRole(session.identity.role, minRole)) redirect("/");
  return session.identity;
}
