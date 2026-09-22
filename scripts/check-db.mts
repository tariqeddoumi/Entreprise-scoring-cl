/**
 * Vérifie la connexion à la base et l'état du schéma applicatif.
 *
 * Contrôles effectués :
 *  1. connexion établie et version du moteur ;
 *  2. schéma cible résolu (celui de la chaîne de connexion) ;
 *  3. présence des six tables ET de toutes leurs colonnes, dérivées du schéma
 *     Prisma lui-même — une colonne absente ne se découvre sinon qu'à la
 *     première requête qui la touche, en production ;
 *  3 bis. cohérence des données persistées avec le moteur courant : statuts et
 *     instantanés produits par une version antérieure sont dénombrés ;
 *  4. sur PostgreSQL : isolation vis-à-vis des rôles publics et garde-fou
 *     d'ajout seul sur la piste d'audit.
 *
 * Usage : npm run db:check
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/index.js";

const EXPECTED_TABLES = [
  "counterparties",
  "rating_runs",
  "overrides",
  "webhook_subscriptions",
  "webhook_deliveries",
  "audit_events",
];

/**
 * Colonnes attendues, dérivées du schéma Prisma.
 *
 * Lire le schéma plutôt que recopier une liste : une liste recopiée cesse
 * d'être vraie à la première migration et personne ne s'en aperçoit.
 */
function expectedColumns(): Map<string, string[]> {
  const schema = readFileSync("prisma/schema.template.prisma", "utf8");
  const modelNames = new Set(
    [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1])
  );
  const byTable = new Map<string, string[]>();

  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, , body] = m;
    const tableMatch = body.match(/@@map\("([^"]+)"\)/);
    if (!tableMatch) continue;
    const columns: string[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const fm = line.match(/^(\w+)\s+(\S+)/);
      if (!fm) continue;
      const [, field, type] = fm;
      // Un champ de relation n'a pas de colonne : seule la clé étrangère
      // scalaire en a une, et elle est déclarée séparément.
      if (modelNames.has(type.replace(/[?\[\]]/g, ""))) continue;
      const mapped = line.match(/@map\("([^"]+)"\)/);
      columns.push(mapped ? mapped[1] : field);
    }
    byTable.set(tableMatch[1], columns);
  }
  return byTable;
}

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
  // SQLite ne fournit pas information_schema : il expose son catalogue par
  // sqlite_master. Le dialecte de développement doit rester vérifiable, sans
  // quoi la divergence ne se découvre qu'une fois déployée.
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    provider === "postgresql"
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
      : provider === "sqlite"
        ? "SELECT name AS table_name FROM sqlite_master WHERE type = 'table'"
        : "SELECT table_name FROM information_schema.tables"
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
  if (missing.length === 0) {
    ok(`${EXPECTED_TABLES.length} tables présentes`);
  } else {
    fail(`tables manquantes : ${missing.join(", ")} — lancez « npm run db:push »`);
  }

  // 2 bis. Colonnes attendues, table par table
  if (missing.length === 0) {
    const expected = expectedColumns();
    const actual =
      provider === "sqlite"
        ? (
            await Promise.all(
              [...expected.keys()].map((t) =>
                prisma
                  .$queryRawUnsafe<{ name: string }[]>(
                    `SELECT name FROM pragma_table_info('${t}')`
                  )
                  .then((cs) =>
                    cs.map((c) => ({ table_name: t, column_name: c.name }))
                  )
              )
            )
          ).flat()
        : await prisma.$queryRawUnsafe<
            { table_name: string; column_name: string }[]
          >(
            provider === "postgresql"
              ? "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()"
              : "SELECT table_name, column_name FROM information_schema.columns"
          );
    const actualByTable = new Map<string, Set<string>>();
    for (const r of actual) {
      const set = actualByTable.get(r.table_name) ?? new Set<string>();
      set.add(r.column_name);
      actualByTable.set(r.table_name, set);
    }

    let columnFailures = 0;
    let checked = 0;
    for (const [table, columns] of expected) {
      const present2 = actualByTable.get(table) ?? new Set<string>();
      checked += columns.length;
      const absent = columns.filter((c) => !present2.has(c));
      const extra = [...present2].filter((c) => !columns.includes(c));
      if (absent.length > 0) {
        columnFailures += 1;
        fail(`${table} : colonnes manquantes — ${absent.join(", ")} (npm run db:push)`);
      }
      if (extra.length > 0) {
        // Une colonne en trop n'est pas bloquante — elle peut précéder un
        // retrait — mais elle ne doit pas passer inaperçue.
        info(`${table} : colonnes présentes hors schéma — ${extra.join(", ")}`);
      }
    }
    if (columnFailures === 0) {
      ok(`${checked} colonnes conformes au schéma Prisma`);
    }
  }

  // 2 ter. Les données persistées parlent-elles la langue du moteur courant ?
  if (missing.length === 0) {
    const [counts] = await prisma.$queryRawUnsafe<
      { total: number; legacy_status: number; legacy_snapshot: number }[]
    >(`
      SELECT count(*) AS total,
             count(*) FILTER (
               WHERE outcome NOT IN ('RATED', 'DEFAULTED',
                                     'NO_RATING_INSUFFICIENT_DATA',
                                     'NO_RATING_SEGMENT_UNDETERMINED',
                                     'NO_RATING_ROUTED_OTHER_MODEL')
             ) AS legacy_status,
             count(*) FILTER (
               WHERE "resultSnapshot" NOT LIKE '%"usageRights"%'
             ) AS legacy_snapshot
      FROM rating_runs
    `);
    const total = Number(counts.total);
    const legacyStatus = Number(counts.legacy_status);
    const legacySnapshot = Number(counts.legacy_snapshot);
    if (total === 0) {
      info("aucune notation persistée");
    } else if (legacyStatus === 0 && legacySnapshot === 0) {
      ok(`${total} notation(s) persistées, toutes au format du moteur courant`);
    } else {
      // Non bloquant : un instantané est immuable par construction, et une
      // base en exploitation en contient forcément d'anciens. Ils sont
      // reconnus et affichés comme archives, jamais convertis.
      info(
        `${total} notation(s) persistées, dont ${legacySnapshot} ` +
          `instantané(s) et ${legacyStatus} statut(s) d'une version ` +
          "antérieure — affichés en archive, exclus des comparaisons."
      );
    }
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
