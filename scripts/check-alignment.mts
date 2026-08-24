/**
 * Vérifie l'alignement entre les quatre représentations du système :
 * schéma Prisma, contrat OpenAPI, routes implémentées et schémas de
 * validation. Une divergence non détectée produit une API qui ment sur son
 * propre contrat.
 *
 * Exécutable hors ligne : aucune connexion à la base n'est nécessaire.
 * Usage : npm run check:alignment
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tiedGrades, validateCalibration } from "../src/core/calibration.js";
import { CAP_TRIGGER_TO_FLAG, unmappedTriggers } from "../src/core/structural-flags.js";
import { CORP_STD_V1, listModels } from "../src/models/index.js";

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const fail = (m: string) => {
  failures += 1;
  console.error(`  ÉCART ${m}`);
};

// --- Découverte des routes implémentées -------------------------------------
function findRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const seg = entry.replace(/^\[(\.\.\.)?(.+)\]$/, "{$2}");
      out.push(...findRoutes(full, `${prefix}/${seg}`));
    } else if (entry === "route.ts") {
      out.push(prefix || "/");
    }
  }
  return out;
}

const routes = findRoutes("src/app/api/v1").sort();
const routeMethods = new Map<string, string[]>();
for (const r of routes) {
  const path = join("src/app/api/v1", r.replace(/\{(.+?)\}/g, "[$1]"), "route.ts");
  const src = readFileSync(path, "utf8");
  const methods = ["GET", "POST", "PATCH", "PUT", "DELETE"].filter((m) =>
    new RegExp(`export async function ${m}\\b`).test(src)
  );
  routeMethods.set(r, methods);
}

// --- Contrat OpenAPI ---------------------------------------------------------
const openapi = readFileSync("openapi.yaml", "utf8");
const specPaths = new Map<string, string[]>();
{
  const lines = openapi.split("\n");
  const start = lines.findIndex((l) => l === "paths:");
  let current: string | null = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[a-z]/.test(line)) break; // sortie de la section paths
    const p = line.match(/^ {2}(\/\S*):\s*$/);
    if (p) {
      current = p[1];
      specPaths.set(current, []);
      continue;
    }
    const m = line.match(/^ {4}(get|post|patch|put|delete):\s*$/);
    if (m && current) specPaths.get(current)!.push(m[1].toUpperCase());
  }
}

console.log("\n1. Routes implémentées vs contrat OpenAPI\n");
for (const [route, methods] of routeMethods) {
  const spec = specPaths.get(route);
  if (!spec) {
    fail(`route ${route} implémentée mais absente du contrat OpenAPI`);
    continue;
  }
  const missing = methods.filter((m) => !spec.includes(m));
  const extra = spec.filter((m) => !methods.includes(m));
  if (missing.length) fail(`${route} : méthodes ${missing.join(", ")} non documentées`);
  if (extra.length) fail(`${route} : méthodes ${extra.join(", ")} documentées mais non implémentées`);
  if (!missing.length && !extra.length) ok(`${route} [${methods.join(", ")}]`);
}
for (const p of specPaths.keys()) {
  if (!routeMethods.has(p)) fail(`chemin ${p} documenté mais aucune route ne l'implémente`);
}

// --- Énumérations partagées --------------------------------------------------
console.log("\n2. Énumérations : moteur vs validation vs contrat\n");
const schemas = readFileSync("src/lib/schemas.ts", "utf8");
const types = readFileSync("src/core/types.ts", "utf8");

function enumFrom(src: string, re: RegExp): string[] {
  const m = src.match(re);
  // Les valeurs peuvent être en majuscules (états, segments) ou en minuscules
  // pointées (types d'événement) : la classe doit couvrir les deux.
  return m ? [...m[1].matchAll(/"([\w.*]+)"/g)].map((x) => x[1]) : [];
}

const statusEngine = enumFrom(types, /export type DataStatus =\s*([\s\S]*?);/);
const statusZod = enumFrom(schemas, /status: z\.enum\(\[([\s\S]*?)\]\)/);
compare("DataStatus", statusEngine, statusZod);

const segEngine = enumFrom(types, /export type Segment = ([\s\S]*?);/);
const segZod = enumFrom(schemas, /segment: z\.enum\(\[([\s\S]*?)\]\)/);
compare("Segment", segEngine, segZod);

const outcomeEngine = enumFrom(types, /export type RatingOutcome =\s*([\s\S]*?);/);
const outcomeSpec = [...openapi.matchAll(/^ {12}- (SCORED|BLOCKED_\w+|DEFAULT_GRADE|NO_GRADE_CONFIDENCE)$/gm)].map((m) => m[1]);
compare("RatingOutcome (moteur vs OpenAPI)", outcomeEngine, outcomeSpec);

const eventsZod = enumFrom(schemas, /events: z\s*\.array\(\s*z\.enum\(\[([\s\S]*?)\]\)/);
const eventsCode = enumFrom(readFileSync("src/lib/webhooks.ts", "utf8"), /export type WebhookEventType =\s*([\s\S]*?);/);
compare("Événements webhook", [...eventsCode, "*"], eventsZod);

function compare(label: string, a: string[], b: string[]) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  // Une extraction qui ne ramène presque rien signale une expression
  // rationnelle inadaptée, pas un alignement réussi.
  const MIN_EXPECTED = 3;
  if (sa.length < MIN_EXPECTED || sb.length < MIN_EXPECTED) {
    fail(
      `${label} : extraction douteuse (${sa.length} vs ${sb.length} valeurs, ` +
        `au moins ${MIN_EXPECTED} attendues) — vérifier l'expression rationnelle`
    );
    return;
  }
  const missing = sa.filter((x) => !sb.includes(x));
  const extra = sb.filter((x) => !sa.includes(x));
  if (missing.length || extra.length) {
    fail(`${label} : manquants [${missing.join(", ")}] en trop [${extra.join(", ")}]`);
  } else {
    ok(`${label} — ${sa.length} valeurs alignées`);
  }
}

// --- Modèles ------------------------------------------------------------------
console.log("\n3. Modèles : cohérence interne\n");
for (const m of listModels()) {
  const segs = m.segments;
  let modelOk = true;
  for (const s of segs) {
    const total = m.criteria.reduce((a, c) => a + (c.weightsBps[s] ?? 0), 0);
    if (total !== 10000) {
      fail(`${m.modelId}/${s} : somme des poids ${total} bps (attendu 10000)`);
      modelOk = false;
    }
  }
  // Les triggers de cap doivent être connus du moteur.
  const engineSrc = readFileSync("src/core/engine.ts", "utf8");
  for (const cap of m.structuralCaps) {
    if (!engineSrc.includes(`case "${cap.trigger}"`)) {
      fail(`${m.modelId} : trigger ${cap.trigger} déclaré mais non implémenté dans le moteur`);
      modelOk = false;
    }
  }
  if (modelOk) ok(`${m.modelId} — poids et triggers cohérents`);
}

// --- Front : critères affichés vs modèle --------------------------------------
console.log("\n4. Interface : formulaire piloté par le modèle\n");
const form = readFileSync("src/app/scoring/ScoringForm.tsx", "utf8");
const hardcoded = CORP_STD_V1.criteria.filter((c) => form.includes(`"${c.code}"`));
if (hardcoded.length > 0) {
  fail(`codes de critères écrits en dur dans le formulaire : ${hardcoded.map((c) => c.code).join(", ")}`);
} else {
  ok("aucun code de critère écrit en dur — le formulaire dérive de la version de modèle");
}

// Un déclencheur peut être exposé par une case à cocher, un champ de saisie
// ou une valeur calculée : on cherche le nom du drapeau partout dans le
// formulaire, pas seulement dans la liste des cases.
const capFlags = [...form.matchAll(/\b(\w+)\b/g)].map((m) => m[1]);
const engineFlags = CORP_STD_V1.structuralCaps.map((c) => c.trigger);
const orphelins = unmappedTriggers(engineFlags);
if (orphelins.length > 0) fail(`déclencheurs sans champ d'entrée : ${orphelins.join(", ")}`);
const uncovered = engineFlags.filter((t) => !capFlags.includes(CAP_TRIGGER_TO_FLAG[t]));
if (uncovered.length) {
  fail(`caps non proposés dans le formulaire : ${uncovered.join(", ")}`);
} else {
  ok(`${engineFlags.length} caps structurels tous accessibles depuis l'interface`);
}

// --- Documentation : la note méthodologique décrit-elle le modèle appliqué ? --
// Les grilles remises au comité modèles sont générées depuis `src/models/`.
// Un générateur qui prend du retard sur le contrat produit une note qui décrit
// un barème que le moteur n'applique plus : c'est la divergence la plus
// coûteuse, parce qu'elle est invisible à la lecture.
console.log("\n5. Documentation : note méthodologique vs modèle appliqué\n");
const noteePath = "docs/01-note-methodologique-complete.md";
if (!existsSync(noteePath)) {
  fail(`${noteePath} absent — exécuter « node scripts/build-methodology-doc.mjs »`);
} else {
  const note = readFileSync(noteePath, "utf8");

  const missingCriteria = listModels()
    .flatMap((m) => m.criteria.map((c) => ({ model: m.modelId, code: c.code })))
    .filter(({ code }) => !note.includes(`#### ${code} —`));
  if (missingCriteria.length) {
    fail(
      `critères absents de la note : ${[...new Set(missingCriteria.map((x) => x.code))].join(", ")}`
    );
  } else {
    ok(`tous les critères des ${listModels().length} modèles sont décrits`);
  }

  // Les codes de cas spéciaux sont ceux acceptés par l'API : ils doivent
  // figurer littéralement dans la note, sinon l'analyste ne peut pas les saisir.
  const specialCodes = [
    ...new Set(
      listModels().flatMap((m) =>
        m.criteria.flatMap((c) => (c.specialCases ?? []).map((sc) => sc.code))
      )
    ),
  ];
  const missingSpecials = specialCodes.filter((code) => !note.includes(code));
  if (missingSpecials.length) {
    fail(`cas spéciaux non documentés : ${missingSpecials.join(", ")}`);
  } else {
    ok(`${specialCodes.length} codes de cas spéciaux documentés à l'identique`);
  }

  const missingCaps = listModels()
    .flatMap((m) => m.structuralCaps.map((c) => c.code))
    .filter((code) => !note.includes(code));
  if (missingCaps.length) {
    fail(`caps structurels non documentés : ${[...new Set(missingCaps)].join(", ")}`);
  } else {
    ok("tous les caps structurels sont documentés");
  }

  const missingFlags = listModels()
    .flatMap((m) => m.redFlags.map((f) => f.code))
    .filter((code) => !note.includes(code));
  if (missingFlags.length) {
    fail(`red flags non documentés : ${[...new Set(missingFlags)].join(", ")}`);
  } else {
    ok("tous les red flags sont documentés");
  }
}

// --- Calibration -------------------------------------------------------------
// Une calibration désalignée du modèle est silencieuse : elle produit des PD
// crédibles sur des grades qui n'existent plus, ou perd la trace de son origine.
console.log("\n6. Calibration : artefact vs modèle et contrat\n");
{
  const statutsMoteur = enumFrom(types, /export type PdStatus =\s*([\s\S]*?);/);
  const statutsSpec = [
    ...openapi.matchAll(/enum: \[(UNCALIBRATED[^\]]*)\]/g),
  ].flatMap((m) => m[1].split(",").map((x) => x.trim()));
  compare("PdStatus (moteur vs OpenAPI)", statutsMoteur, statutsSpec);

  for (const model of listModels()) {
    const cal = model.calibration;
    if (!cal) {
      ok(`${model.modelId} — aucune calibration attachée, aucune PD produite`);
      continue;
    }
    const erreurs = validateCalibration(cal);
    if (erreurs.length > 0) {
      fail(`${model.modelId} — calibration invalide : ${erreurs.join(" ; ")}`);
    } else {
      ok(`${model.modelId} — calibration ${cal.calibrationId} valide (${cal.gradePd.length} grades)`);
    }

    if (cal.modelId !== model.modelId || cal.modelVersion !== model.version) {
      fail(
        `${model.modelId} — la calibration vise ${cal.modelId} v${cal.modelVersion}, pas ${model.modelId} v${model.version}`
      );
    } else {
      ok(`${model.modelId} — la calibration vise bien la version de modèle publiée`);
    }

    // Tout grade de l'échelle doit porter une PD, sans quoi une notation
    // parfaitement valide se retrouverait sans PD.
    const echelle = model.masterScale.map((b) => b.grade);
    const calibres = cal.gradePd.map((g) => g.grade);
    const manquants = echelle.filter((g) => !calibres.includes(g));
    const orphelins = calibres.filter((g) => !echelle.includes(g));
    if (manquants.length > 0) fail(`${model.modelId} — grades sans PD : ${manquants.join(", ")}`);
    else if (orphelins.length > 0) fail(`${model.modelId} — PD sur des grades hors échelle : ${orphelins.join(", ")}`);
    else ok(`${model.modelId} — les ${echelle.length} grades de l'échelle portent une PD`);

    // Une fusion de grades n'est pas une erreur, mais elle ne doit pas passer
    // inaperçue : c'est une distinction de grade qui ne porte plus de risque.
    const fusions = tiedGrades(cal);
    if (fusions.length > 0) {
      ok(
        `${model.modelId} — grades indistinguables sur les données : ${fusions.map((f) => f.grades.join("=")).join(", ")} (à porter au comité modèles)`
      );
    } else {
      ok(`${model.modelId} — les ${cal.gradePd.length} grades se distinguent par leur PD`);
    }

    if (cal.dataSource === "SYNTHETIC" && !/simul/i.test(model.disclaimerFr ?? "")) {
      fail(`${model.modelId} — calibration simulée mais l'avertissement du modèle ne le dit pas`);
    } else if (cal.dataSource === "SYNTHETIC") {
      ok(`${model.modelId} — l'origine simulée est portée par l'avertissement du modèle`);
    }
  }
}

console.log(
  failures === 0
    ? "\nAlignement complet : aucune divergence.\n"
    : `\n${failures} divergence(s) détectée(s).\n`
);
process.exit(failures === 0 ? 0 : 1);
