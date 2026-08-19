#!/usr/bin/env node
/**
 * Génère prisma/schema.prisma pour le SGBD cible, depuis la source canonique
 * prisma/schema.template.prisma.
 *
 * Usage :
 *   DATABASE_PROVIDER=postgresql node scripts/set-db-provider.mjs   (défaut)
 *   DATABASE_PROVIDER=mysql      node scripts/set-db-provider.mjs
 *   DATABASE_PROVIDER=sqlserver  node scripts/set-db-provider.mjs
 *   DATABASE_PROVIDER=sqlite     node scripts/set-db-provider.mjs
 *
 * La génération repart TOUJOURS du template : elle est idempotente et
 * réversible, quel que soit l'ordre des dialectes appliqués.
 *
 * Adaptations par dialecte :
 *   - mysql     : @db.Text -> @db.LongText (payloads JSON volumineux)
 *   - sqlserver : @db.Text -> @db.NVarChar(Max)
 *   - sqlite    : suppression des annotations natives (types logiques Prisma).
 *                 SQLite ne gère pas la précision décimale : réservé au
 *                 développement, jamais à un environnement de production.
 *
 * La matrice de certification du README fait foi : un dialecte n'est déclaré
 * CERTIFIED qu'après exécution de la suite d'intégration sur ce moteur.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const provider = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase();
const supported = ["postgresql", "mysql", "sqlserver", "sqlite"];
if (!supported.includes(provider)) {
  console.error(
    `DATABASE_PROVIDER invalide : "${provider}". Valeurs admises : ${supported.join(", ")}`
  );
  process.exit(1);
}

const prismaDir = join(dirname(fileURLToPath(import.meta.url)), "..", "prisma");
const templatePath = join(prismaDir, "schema.template.prisma");
const schemaPath = join(prismaDir, "schema.prisma");

let schema = readFileSync(templatePath, "utf8");

schema = schema.replace(
  /provider\s*=\s*"postgresql"/,
  `provider = "${provider}"`
);

if (provider === "mysql") {
  schema = schema.replace(/@db\.Text/g, "@db.LongText");
} else if (provider === "sqlserver") {
  schema = schema.replace(/@db\.Text/g, "@db.NVarChar(Max)");
} else if (provider === "sqlite") {
  schema = schema.replace(/\s*@db\.[A-Za-z]+(\([^)]*\))?/g, "");
}

schema =
  `// FICHIER GÉNÉRÉ par scripts/set-db-provider.mjs (provider: ${provider}).\n` +
  `// Modifier prisma/schema.template.prisma, puis relancer \`npm run db:provider\`.\n\n` +
  schema;

writeFileSync(schemaPath, schema);
console.log(`prisma/schema.prisma généré pour le provider "${provider}".`);
