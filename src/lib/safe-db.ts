import { prisma } from "./prisma";

/**
 * Exécute une lecture base de données en tolérant l'absence de base
 * configurée (démonstration du moteur sans infrastructure).
 *
 * Le moteur de notation reste utilisable sans base : seules les vues
 * d'historique et de portefeuille sont dégradées, jamais un calcul.
 */
export async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<{
  data: T;
  dbAvailable: boolean;
}> {
  try {
    const data = await fn();
    return { data, dbAvailable: true };
  } catch (e) {
    // L'écran affiche « base indisponible » ; la cause, elle, doit rester
    // lisible dans les journaux du serveur.
    console.error("[base] requête impossible :", e instanceof Error ? e.message : e);
    return { data: fallback, dbAvailable: false };
  }
}

export { prisma };
