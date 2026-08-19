import { PrismaClient } from "@/generated/prisma";

/**
 * Client Prisma singleton (pattern recommandé Next.js).
 * La connexion est configurée par DATABASE_URL ; le dialecte par
 * DATABASE_PROVIDER + `npm run db:provider` (voir scripts/set-db-provider.mjs).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
