/**
 * Vérifie l'alignement entre les représentations du système : schéma Prisma,
 * contrat OpenAPI, routes implémentées, schémas de validation, moteur et
 * écrans. Une divergence non détectée produit une API qui ment sur son propre
 * contrat, ou un écran qui recueille une saisie que le moteur ne lit pas.
 *
 * Exécutable hors ligne : aucune connexion à la base n'est nécessaire. La
 * structure de la base elle-même se contrôle par « npm run db:check ».
 * Usage : npm run check:alignment (exécuté par la CI)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { ZodTypeAny } from "zod";
import {
  DATA_STATUS_LABELS,
  EVALUATION_STATUS_LABELS,
  MODEL_STATUS_LABELS,
  OVERRIDE_REASON_LABELS,
  PD_STATUS_LABELS,
  PURPOSE_LABELS,
  RED_FLAG_LEVEL_LABELS,
  RED_FLAG_SOURCE_LABELS,
} from "../src/app/ui-helpers.js";
import { computeRating } from "../src/core/engine.js";
import * as requestSchemas from "../src/lib/schemas.js";
import { tiedGrades, validateCalibration } from "../src/core/calibration.js";
import {
  CAP_TRIGGER_TO_FLAG,
  RETIRED_CAP_OBSERVATIONS,
  unmappedTriggers,
} from "../src/core/structural-flags.js";
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

const outcomeEngine = enumFrom(types, /export type RatingStatus =\s*([\s\S]*?);/);
const outcomeSpec = [...openapi.matchAll(/^ {12}- (RATED|DEFAULTED|NO_RATING_\w+)$/gm)].map((m) => m[1]);
compare("RatingStatus (moteur vs OpenAPI)", outcomeEngine, outcomeSpec);

// Le schéma Prisma documente le vocabulaire écrit dans `rating_runs.outcome`.
// Ce commentaire est ce que lit quiconque écrit une requête SQL, un état de
// gestion ou un tableau de bord hors application : il avait gardé le
// vocabulaire V1 (SCORED, BLOCKED_*) alors que le moteur écrit déjà RATED et
// NO_RATING_* — un filtre écrit d'après le schéma ne ramenait rien.
const prismaSchema = readFileSync("prisma/schema.template.prisma", "utf8");
const outcomeDoc = [
  ...prismaSchema.matchAll(/\b(RATED|DEFAULTED|NO_RATING_[A-Z_]+)\b/g),
].map((m) => m[1]);
compare("RatingStatus (moteur vs schéma Prisma)", outcomeEngine, outcomeDoc);

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
  for (const cap of m.nonCompensatoryRules) {
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

// Les exceptions proposées par le formulaire doivent être celles que le moteur
// évalue. Une liste recopiée y parvient tant que personne ne modifie le modèle,
// puis dérive en silence : c'est ainsi que cinq plafonds retirés en V3 sont
// restés cochables sans le moindre effet. Le contrôle porte donc sur le
// MÉCANISME — le formulaire dérive-t-il sa liste du modèle chargé — et non plus
// sur la présence de chaque nom, qu'une liste figée satisfait tout aussi bien.
const engineFlags = CORP_STD_V1.nonCompensatoryRules.map((c) => c.trigger);
const orphelins = unmappedTriggers(engineFlags);
if (orphelins.length > 0) fail(`déclencheurs sans champ d'entrée : ${orphelins.join(", ")}`);

const derivesExceptions =
  form.includes("CAP_TRIGGER_TO_FLAG") && form.includes("model.nonCompensatoryRules");
if (derivesExceptions) {
  ok(
    `les ${engineFlags.length} exceptions non compensatoires sont dérivées du modèle chargé`
  );
} else {
  // Repli : si la dérivation disparaît, on exige au moins que chaque nom de
  // drapeau soit présent quelque part dans le formulaire.
  const capFlags = [...form.matchAll(/\b(\w+)\b/g)].map((m) => m[1]);
  const uncovered = engineFlags.filter((t) => !capFlags.includes(CAP_TRIGGER_TO_FLAG[t]));
  if (uncovered.length) {
    fail(`exceptions non proposées dans le formulaire : ${uncovered.join(", ")}`);
  } else {
    fail(
      "le formulaire ne dérive plus ses exceptions du modèle : la liste redeviendra obsolète à la prochaine version"
    );
  }
}

// Les constats retirés restent saisissables, mais doivent être présentés comme
// sans effet sur le grade — sinon l'analyste croit poser un garde-fou.
if (form.includes("RETIRED_CAP_OBSERVATIONS")) {
  ok(`${RETIRED_CAP_OBSERVATIONS.length} constats retirés présentés comme sans effet sur le grade`);
} else {
  fail("les constats structurels retirés ne sont plus distingués des exceptions dans le formulaire");
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
    .flatMap((m) => m.nonCompensatoryRules.map((c) => c.code))
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
    const echelle = model.gradeScale.bands.map((b) => b.grade);
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


// --- Contrats de données : validation, OpenAPI, moteur, écrans ----------------
// Les sections précédentes comparent des listes de valeurs. Celle-ci compare
// les FORMES : champs acceptés par la validation et décrits par le contrat,
// champs produits par le moteur et décrits par le contrat, champs que le
// moteur lit et que l'écran envoie. C'est à ce niveau qu'étaient passés
// inaperçus cinq champs de requête non documentés, un contrat illisible par
// un analyseur strict et des critères ESG saisis puis ignorés (D-43).
console.log("\n7. Contrats de données : validation, OpenAPI, moteur, écrans\n");
{
  // 7a. Le contrat doit être lisible par un analyseur YAML strict : une clé
  // dupliquée le rend inexploitable par les générateurs de clients.
  let spec: any = null;
  try {
    spec = yaml.load(openapi);
    ok("openapi.yaml lisible par un analyseur YAML strict (aucune clé dupliquée)");
  } catch (e) {
    fail(`openapi.yaml illisible par un analyseur strict : ${(e as Error).message.split("\n")[0]}`);
    spec = yaml.load(openapi, { json: true });
  }
  const components = spec.components.schemas;
  const resolve = (o: any) => (o?.$ref ? components[o.$ref.split("/").pop()] : o);
  const bodyOf = (path: string, method: string) =>
    resolve(spec.paths[path]?.[method]?.requestBody?.content?.["application/json"]?.schema);

  // 7b. Champs acceptés par la validation (Zod, .strict) vs champs documentés,
  // récursivement sur les objets imbriqués.
  const shapeOf = (schema: ZodTypeAny): Record<string, ZodTypeAny> | null => {
    let t: any = schema;
    while (t?._def && t._def.typeName !== "ZodObject") {
      t = t._def.schema ?? t._def.innerType ?? t._def.type;
    }
    return t?._def?.typeName === "ZodObject" ? t._def.shape() : null;
  };
  const compareShape = (label: string, schema: ZodTypeAny, doc: any): string[] => {
    const shape = shapeOf(schema);
    const resolved = resolve(doc);
    if (!shape || !resolved?.properties) return [];
    const documented = Object.keys(resolved.properties);
    const gaps = [
      ...Object.keys(shape)
        .filter((k) => !documented.includes(k))
        .map((k) => `${label}.${k} accepté mais non documenté`),
      ...documented
        .filter((k) => !(k in shape))
        .map((k) => `${label}.${k} documenté mais refusé par la validation`),
    ];
    for (const k of Object.keys(shape)) {
      if (documented.includes(k)) gaps.push(...compareShape(`${label}.${k}`, shape[k], resolved.properties[k]));
    }
    return gaps;
  };
  const contracts: Array<[string, ZodTypeAny, any]> = [
    ["RatingRequest", requestSchemas.ratingRequestSchema, components.RatingRequest],
    ["POST /counterparties", requestSchemas.counterpartySchema, bodyOf("/counterparties", "post")],
    ["PATCH /counterparties/{id}", requestSchemas.counterpartyPatchSchema, bodyOf("/counterparties/{id}", "patch")],
    ["OverrideRequest", requestSchemas.overrideRequestSchema, components.OverrideRequest],
    ["POST /overrides/{id}/decision", requestSchemas.overrideDecisionSchema, bodyOf("/overrides/{id}/decision", "post")],
    ["POST /webhook-subscriptions", requestSchemas.webhookSubscriptionSchema, bodyOf("/webhook-subscriptions", "post")],
    ["POST /rating-runs/compare", requestSchemas.compareRequestSchema, bodyOf("/rating-runs/compare", "post")],
  ];
  for (const [label, schema, doc] of contracts) {
    if (!doc) {
      fail(`${label} : corps de requête introuvable dans le contrat`);
      continue;
    }
    const gaps = compareShape(label, schema, doc);
    if (gaps.length) gaps.forEach((g) => fail(g));
    else ok(`${label} — champs validés et documentés identiques`);
  }
  const patchRequired = bodyOf("/counterparties/{id}", "patch")?.required ?? [];
  if (patchRequired.length) fail(`PATCH /counterparties/{id} : champs requis dans le contrat (${patchRequired.join(", ")}) alors que la mise à jour est partielle`);

  // 7c. Champs produits par le moteur vs champs documentés du résultat. Deux
  // dossiers — l'un noté, l'autre sans grade — couvrent les deux formes.
  const minimal = {
    modelId: CORP_STD_V1.modelId,
    segment: "PME" as const,
    asOfDate: "2026-06-30",
    criteria: {},
    confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
  };
  const complete = {
    ...minimal,
    criteria: Object.fromEntries(
      CORP_STD_V1.criteria.map((c) => [
        c.code,
        c.type === "QUANTITATIVE" ? { status: "AVAILABLE" as const, value: 1 } : { status: "AVAILABLE" as const, score: 50 as const },
      ])
    ),
  };
  const produced = new Set(
    [computeRating(CORP_STD_V1, minimal), computeRating(CORP_STD_V1, complete)].flatMap((r) => Object.keys(r))
  );
  const documentedResult = Object.keys(components.RatingResult.properties);
  const undocumented = [...produced].filter((k) => !documentedResult.includes(k));
  const phantom = documentedResult.filter((k) => !produced.has(k));
  if (undocumented.length) fail(`RatingResult : champs produits non documentés — ${undocumented.join(", ")}`);
  if (phantom.length) fail(`RatingResult : champs documentés jamais produits — ${phantom.join(", ")}`);
  if (!undocumented.length && !phantom.length) ok(`RatingResult — ${produced.size} champs produits, tous documentés`);

  // 7d. Tout événement proposé à la souscription doit être émis quelque part :
  // « counterparty.updated » était souscriptible sans jamais être publié.
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) return e === "generated" ? [] : sources(full);
      return /\.tsx?$/.test(e) ? [full] : [];
    });
  const emitters = sources("src")
    .filter((f) => !f.endsWith("webhooks.ts") && !f.endsWith("schemas.ts"))
    .map((f) => readFileSync(f, "utf8"))
    .filter((src) => src.includes("publishEvent("))
    .join("\n");
  const neverEmitted = eventsCode.filter((e) => !emitters.includes(`"${e}"`));
  if (neverEmitted.length) fail(`événements souscriptibles jamais publiés : ${neverEmitted.join(", ")}`);
  else ok(`les ${eventsCode.length} événements souscriptibles sont publiés`);

  // 7e. Libellés d'écran : chaque code du moteur ou de la validation a son
  // libellé français, sans libellé orphelin.
  const labelSets: Array<[string, string[], Record<string, string>]> = [
    ["DataStatus", statusEngine, DATA_STATUS_LABELS],
    ["RedFlagLevel", enumFrom(types, /export type RedFlagLevel = ([\s\S]*?);/), RED_FLAG_LEVEL_LABELS],
    ["RuleSource", enumFrom(types, /export type RuleSource = ([\s\S]*?);/), RED_FLAG_SOURCE_LABELS],
    ["PdStatus", enumFrom(types, /export type PdStatus =\s*([\s\S]*?);/), PD_STATUS_LABELS],
    ["ComplianceStatus", enumFrom(types, /export type ComplianceStatus = ([\s\S]*?);/), EVALUATION_STATUS_LABELS],
    ["ResultPurpose", enumFrom(types, /export type ResultPurpose = ([\s\S]*?);/), PURPOSE_LABELS],
    ["Statut de modèle", enumFrom(types, /status: ("DRAFT_EXPERT_SEED"[^;]*);/), MODEL_STATUS_LABELS],
    ["Motif de dérogation", enumFrom(schemas, /reasonCode: z\.enum\(\[([\s\S]*?)\]\)/), OVERRIDE_REASON_LABELS],
  ];
  for (const [label, codes, labels] of labelSets) {
    compare(`Libellés « ${label} »`, codes, Object.keys(labels));
  }

  // 7f. Ce que l'écran envoie vs ce que la validation accepte. Les champs que
  // l'écran n'envoie pas doivent l'être délibérément, et motivés ici.
  const NOT_FROM_SCREEN: Record<string, string> = {
    counterpartyId: "transmis à part par l'action serveur",
    segmentationData: "segment choisi dans le cadrage (segmentation automatique non branchée)",
    complianceStatus: "fourni par le système conformité amont ; l'écran transmet les red flags RF01 à RF03",
    existingExposure: "sans effet sur le calcul",
  };
  const requestFields = Object.keys(shapeOf(requestSchemas.ratingRequestSchema) ?? {});
  const payloadBlock = form.slice(form.indexOf("const payload = {"), form.indexOf("runScoringAction(payload"));
  const notSent = requestFields.filter(
    (k) => !(k in NOT_FROM_SCREEN) && !new RegExp(`\\b${k}\\b`).test(payloadBlock)
  );
  if (notSent.length) fail(`champs de notation que l'écran n'envoie pas : ${notSent.join(", ")}`);
  else ok(`l'écran envoie les ${requestFields.length - Object.keys(NOT_FROM_SCREEN).length} champs de notation qu'il recueille ; ${Object.keys(NOT_FROM_SCREEN).length} exclus et motivés`);
  if (!form.includes("materialityGate")) {
    fail("le formulaire ne tient pas compte des portes de matérialité : les critères conditionnels seraient saisis puis ignorés");
  }

  // 7g. Une action serveur est un point d'entrée public : la session doit être
  // vérifiée avant toute lecture, écriture ou calcul, comme le fait l'API.
  const PUBLIC_ACTIONS = new Set(["loginAction", "logoutAction"]);
  const actionFiles = sources("src/app").filter((f) => readFileSync(f, "utf8").startsWith('"use server"'));
  for (const file of actionFiles) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/^export async function (\w+)\([\s\S]*?^}/gm)) {
      const [body, name] = [m[0], m[1]];
      if (PUBLIC_ACTIONS.has(name)) continue;
      const guardAt = body.search(/getSessionIdentity\(|requireSession\(|getCurrentSession\(/);
      const workAt = body.search(/simulateRating\(|computeRating\(|executeRatingRun\(|prisma\.|\$transaction\(|accounts?\./);
      if (guardAt === -1) fail(`${file} : ${name} ne vérifie aucune session`);
      else if (workAt !== -1 && workAt < guardAt) fail(`${file} : ${name} travaille avant de vérifier la session`);
      else ok(`${name} — session vérifiée avant tout traitement`);
    }
  }
}

console.log(
  failures === 0
    ? "\nAlignement complet : aucune divergence.\n"
    : `\n${failures} divergence(s) détectée(s).\n`
);
process.exit(failures === 0 ? 0 : 1);
