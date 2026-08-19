import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateToken, type Identity, type Role } from "./auth";

/**
 * Session de l'interface web.
 *
 * Le cookie porte la clé API elle-même, en HttpOnly, Secure et SameSite=Strict :
 *  - HttpOnly empêche toute lecture par du JavaScript (protection contre le vol
 *    par script intersites) ;
 *  - SameSite=Strict empêche l'envoi depuis un site tiers (protection contre la
 *    falsification de requête intersites), en complément du contrôle d'origine
 *    intégré aux actions serveur ;
 *  - aucun secret de signature supplémentaire n'est introduit, donc aucun
 *    secret par défaut.
 *
 * L'identité est toujours dérivée de ce jeton, jamais d'un champ de formulaire.
 */

export const SESSION_COOKIE = "corp_scoring_session";

export async function getSessionIdentity(minRole: Role): Promise<
  { ok: true; identity: Identity } | { ok: false; reasonFr: string }
> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, reasonFr: "Session absente : authentifiez-vous." };
  }
  const auth = authenticateToken(token, minRole);
  if (!auth.ok) {
    return { ok: false, reasonFr: auth.message };
  }
  return { ok: true, identity: auth.identity };
}

/**
 * Exige une session valide pour afficher une page.
 * Redirige vers l'écran d'authentification si la session est absente,
 * expirée ou de rôle insuffisant.
 */
export async function requireSession(minRole: Role = "READONLY"): Promise<Identity> {
  const session = await getSessionIdentity(minRole);
  if (session.ok) return session.identity;
  // `redirect` interrompt le rendu : le code suivant n'est jamais atteint.
  redirect("/login");
}
