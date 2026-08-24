/**
 * Vérifie la connexion à la base et l'état du schéma applicatif.
 *
 * Contrôles effectués :
 *  1. connexion établie et version du moteur ;
 *  2. schéma cible résolu (celui de la chaîne de connexion) ;
 *  3. présence des six tables attendues ;
 *  4. sur PostgreSQL : isolation vis-à-vis des rôles publics et garde-fou
 *     d'ajout seul sur la piste d'audit.
 *
 * Usage : npm run db:check
 */
import { PrismaClient } from "../src/generated/prisma/index.js";

const EXPECTED_TABLES = [
  "counterparties",
  "rating_runs",
  "overrides",
  "webhook_subscriptions",
  "webhook_deliveries",
  "audit_events",
];

const prisma = new PrismaClient();
let failures = 0;

function ok(message: string) {
  console.log(`  ok   ${message}`);
}
function fail(message: string) {
  failures += 1;
  console.error(`  ÉCHEC ${message}`);
}
function info(message: string) {
  console.log(`       ${message}`);
}

async function main() {
  const provider = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase();
  console.log(`Vérification de la base (${provider})\n`);

  // 1. Connexion
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    ok("connexion établie");
  } catch (e) {
    fail(`connexion impossible : ${e instanceof Error ? e.message : e}`);
    console.error(
      "\nVérifiez DATABASE_URL. Pour Supabase, l'application utilise le pooler " +
        "(port 6543, pgbouncer=true) et les migrations la connexion directe (port 5432)."
    );
    process.exit(1);
  }

  if (provider === "postgresql") {
    const [{ version }] = await prisma.$queryRawUnsafe<{ version: string }[]>(
      "SELECT current_setting('server_version') AS version"
    );
    info(`PostgreSQL ${version}`);

    const [{ schema }] = await prisma.$queryRawUnsafe<{ schema: string }[]>(
      "SELECT current_schema() AS schema"
    );
    if (schema === "corp_scoring") {
      ok(`schéma applicatif isolé : ${schema}`);
    } else {
      fail(
        `schéma courant « ${schema} » — attendu « corp_scoring ». ` +
          "Ajoutez « ?schema=corp_scoring » à DATABASE_URL pour éviter toute " +
          "collision avec les tables d'autres applications."
      );
    }
  }

  // 2. Tables attendues
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    provider === "postgresql"
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
      : "SELECT table_name FROM information_schema.tables"
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
  if (missing.length === 0) {
    ok(`${EXPECTED_TABLES.length} tables présentes`);
  } else {
    fail(`tables manquantes : ${missing.join(", ")} — lancez « npm run db:push »`);
  }

  if (provider === "postgresql" && missing.length === 0) {
    // 3. Isolation vis-à-vis des rôles exposés publiquement
    const exposure = await prisma.$queryRawUnsafe<
      { role: string; readable: number }[]
    >(`
      SELECT r.rolname AS role,
             count(*) FILTER (
               WHERE has_table_privilege(r.rolname, c.oid, 'SELECT')
             )::int AS readable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN pg_roles r
      WHERE n.nspname = current_schema()
        AND c.relkind = 'r'
        AND r.rolname IN ('anon', 'authenticated')
      GROUP BY r.rolname
    `);
    const exposed = exposure.filter((e) => e.readable > 0);
    if (exposed.length === 0) {
      ok("aucune table lisible par les rôles anon / authenticated");
    } else {
      for (const e of exposed) {
        fail(`le rôle « ${e.role} » peut lire ${e.readable} table(s) du schéma`);
      }
    }

    // 4. Piste d'audit en ajout seul
    const [{ guarded }] = await prisma.$queryRawUnsafe<{ guarded: number }[]>(`
      SELECT count(*)::int AS guarded
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = 'audit_events'
        AND t.tgname = 'audit_events_append_only'
        AND NOT t.tgisinternal
    `);
    if (guarded > 0) {
      ok("piste d'audit protégée en ajout seul");
    } else {
      fail(
        "le déclencheur « audit_events_append_only » est absent : la piste " +
          "d'audit peut être modifiée ou supprimée."
      );
    }
  }

  console.log(
    failures === 0
      ? "\nToutes les vérifications sont passées."
      : `\n${failures} vérification(s) en échec.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
