import { PrismaClient } from "@/generated/prisma";
import { applicationSchemaError, type DbProvider } from "./env";

/**
 * Client Prisma singleton (pattern recommandé Next.js).
 * La connexion est configurée par DATABASE_URL ; le dialecte par
 * DATABASE_PROVIDER + `npm run db:provider` (voir scripts/set-db-provider.mjs).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Garde-fou de schéma : en production, une chaîne de connexion PostgreSQL qui
 * ne désigne pas le schéma applicatif ne reçoit aucune requête. Toute
 * utilisation du client lève l'erreur explicative, que les écrans traitent
 * comme une base indisponible et que les journaux du serveur restituent.
 */
function createClient(): PrismaClient {
  const provider = (process.env.DATABASE_PROVIDER?.trim() || "postgresql").toLowerCase() as DbProvider;
  const message = applicationSchemaError(
    process.env.DATABASE_URL,
    provider,
    process.env.NODE_ENV === "production"
  );
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
