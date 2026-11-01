/**
 * Index que Prisma ne sait pas déclarer, appliqués après « prisma db push ».
 *
 * - overrides_one_pending_per_run : une seule dérogation EN ATTENTE par
 *   notation (index unique partiel). Il protège de deux demandes simultanées ;
 *   le service traduit sa violation en conflit 409. Sans lui, la règle ne
 *   repose plus que sur un contrôle applicatif, vulnérable à une course.
 *
 * Idempotent. PostgreSQL, SQLite et SQL Server acceptent un index filtré ;
 * MySQL non : la règle y reste applicative, et le script le signale.
 *
 * Usage : npm run db:indexes (enchaîné automatiquement par npm run db:push)
 */
import { PrismaClient } from "../src/generated/prisma/index.js";

const provider = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase();
const prisma = new PrismaClient();

const SQL: Record<string, string | null> = {
  postgresql: `CREATE UNIQUE INDEX IF NOT EXISTS "overrides_one_pending_per_run" ON "overrides"("ratingRunId") WHERE "status" = 'PENDING'`,
  sqlite: `CREATE UNIQUE INDEX IF NOT EXISTS "overrides_one_pending_per_run" ON "overrides"("ratingRunId") WHERE "status" = 'PENDING'`,
  sqlserver: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'overrides_one_pending_per_run') CREATE UNIQUE INDEX [overrides_one_pending_per_run] ON [overrides]([ratingRunId]) WHERE [status] = 'PENDING'`,
  mysql: null,
};

async function main() {
  const sql = SQL[provider];
  if (sql === undefined) throw new Error(`Moteur inconnu : ${provider}`);
  if (sql === null) {
    console.warn("MySQL : pas d'index filtré ; l'unicité de la dérogation en attente reste contrôlée par le service.");
    return;
  }
  await prisma.$executeRawUnsafe(sql);
  console.log("Index « overrides_one_pending_per_run » en place.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
