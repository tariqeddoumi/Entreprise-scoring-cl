#!/usr/bin/env node
/**
 * Assemble la note méthodologique complète :
 * corps rédigé (docs/01-note-methodologique.md) + grilles générées depuis le
 * moteur (scripts/generate-model-doc.mts), injectées au marqueur prévu.
 *
 * Le document livré ne peut donc pas décrire des barèmes différents de ceux
 * que le moteur applique réellement.
 *
 * Usage : node scripts/build-methodology-doc.mjs [chemin/sortie.md]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bodyPath = join(root, "docs", "01-note-methodologique.md");
const outPath = process.argv[2] ?? join(root, "docs", "01-note-methodologique-complete.md");
const MARKER = "<!-- GRILLES_GENEREES -->";

const body = readFileSync(bodyPath, "utf8");
if (!body.includes(MARKER)) {
  console.error(`Marqueur ${MARKER} absent de ${bodyPath}.`);
  process.exit(1);
}

const grids = execFileSync(
  "npx",
  ["tsx", join(root, "scripts", "generate-model-doc.mts")],
  { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

writeFileSync(outPath, body.replace(MARKER, grids));
console.log(`Note méthodologique complète générée : ${outPath}`);
