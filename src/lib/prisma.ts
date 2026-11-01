import { PrismaClient } from "@/generated/prisma";
import { databaseConfigProblem } from "./env";

/**
 * Client Prisma singleton (pattern recommandé Next.js).
 * La connexion est configurée par DATABASE_URL ; le dialecte par
 * DATABASE_PROVIDER + `npm run db:provider` (voir scripts/set-db-provider.mjs).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Garde-fou de configuration : une chaîne de connexion mal formée, ou qui ne
 * désigne pas le schéma applicatif en production, ne reçoit aucune requête. Toute
 * utilisation du client lève l'erreur explicative, que les écrans traitent
 * comme une base indisponible et que les journaux du serveur restituent.
 */
function createClient(): PrismaClient {
  const message = databaseConfigProblem();
  if (!message) return new PrismaClient();

  console.error(`[configuration] ${message}`);
  return new Proxy({} as PrismaClient, {
    get() {
      throw new Error(message);
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
