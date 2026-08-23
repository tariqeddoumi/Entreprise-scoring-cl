/**
 * Produit le jeu de démonstration sous forme de SQL portable.
 *
 * Les notations sont calculées par le VRAI moteur : le SQL généré ne peut
 * donc pas diverger du modèle. Utile lorsque l'application n'a pas d'accès
 * direct à la base (déploiement piloté par un administrateur, ou application
 * via une console SQL).
 *
 * Les identifiants sont déterministes et préfixés « seed_ », ce qui rend le
 * script rejouable et la purge triviale.
 *
 * Usage : npx tsx scripts/seed-to-sql.mts > prisma/sql/02-seed-demonstration.sql
 */
import { computeRating } from "../src/core/engine.js";
import type { RatingInput } from "../src/core/types.js";
import { gradeRank } from "../src/core/grades.js";
import { getModel } from "../src/models/index.js";
import { COUNTERPARTIES, OVERRIDES, RUNS } from "../prisma/seed-data.js";

const SCHEMA = "corp_scoring";
const DEFAULT_MODEL = "CORP_STD_V1";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}
const stable = (v: unknown) => JSON.stringify(sortKeys(v));

/** Littéral SQL : les apostrophes sont doublées, jamais concaténées à l'aveugle. */
function lit(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_");

const out: string[] = [];
const w = (s = "") => out.push(s);

w("-- ---------------------------------------------------------------------------");
w("-- Jeu de démonstration SYNTHÉTIQUE — toutes les contreparties sont FICTIVES.");
w("--");
w("-- Généré par scripts/seed-to-sql.mts depuis le moteur de notation : les");
w("-- scores, grades et instantanés proviennent d'un calcul réel, jamais d'une");
w("-- saisie manuelle. Régénérer après toute modification du modèle.");
w("--");
w("-- Identifiants préfixés « seed_ » : le script est rejouable et la purge");
w("-- se limite à ce préfixe.");
w("--");
w("-- NE JAMAIS APPLIQUER EN PRODUCTION.");
w("-- ---------------------------------------------------------------------------");
w();
w("BEGIN;");
w();
w("-- Purge des seules données de démonstration.");
w(`DELETE FROM ${SCHEMA}.overrides WHERE id LIKE 'seed_%';`);
w(`DELETE FROM ${SCHEMA}.rating_runs WHERE id LIKE 'seed_%';`);
w(`DELETE FROM ${SCHEMA}.counterparties WHERE id LIKE 'seed_%';`);
w();

// --- Contreparties -----------------------------------------------------------
w("-- --- Contreparties ---------------------------------------------------------");
const cpId = new Map<string, string>();
for (const c of COUNTERPARTIES) {
  const id = `seed_cp_${slug(c.key)}`;
  cpId.set(c.key, id);
  w(
    `INSERT INTO ${SCHEMA}.counterparties (id, name, ice, rc, "fiscalId", "legalForm", "sectorCode", city, "isActive", "createdAt", "updatedAt") VALUES (` +
      [lit(id), lit(c.name), lit(c.ice), lit(c.rc), lit(c.fiscalId), lit(c.legalForm), lit(c.sectorCode), lit(c.city)].join(", ") +
      ", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);"
  );
}
w();

// --- Notations ---------------------------------------------------------------
w("-- --- Notations (calculées par le moteur) -----------------------------------");
const runId = new Map<string, string>();
const segmentByCp = new Map<string, string>();
const cappedByRun = new Map<string, string | null>();
const tally: Record<string, number> = {};

for (const r of RUNS) {
  const counterpartyId = cpId.get(r.counterpartyKey);
  if (!counterpartyId) throw new Error(`Contrepartie inconnue : ${r.counterpartyKey}`);

  const modelId = r.input.modelId ?? DEFAULT_MODEL;
  const model = getModel(modelId);
  if (!model) throw new Error(`Modèle inconnu : ${modelId}`);

  const input: RatingInput = { ...r.input, modelId, asOfDate: r.asOfDate };
  const result = computeRating(model, input, `${r.asOfDate}T12:00:00.000Z`);
  tally[result.outcome] = (tally[result.outcome] ?? 0) + 1;

  const id = `seed_run_${slug(r.counterpartyKey)}_${r.asOfDate.replace(/-/g, "")}`;
  runId.set(`${r.counterpartyKey}:${r.asOfDate}`, id);
  cappedByRun.set(id, result.cappedGrade);
  if (result.segment) segmentByCp.set(r.counterpartyKey, result.segment);

  w(`-- ${r.purposeFr}`);
  w(
    `INSERT INTO ${SCHEMA}.rating_runs (id, "counterpartyId", "modelId", "modelVersion", "engineVersion", "asOfDate", segment, outcome, "rawScore", "confidenceScore", "engineGrade", "cappedGrade", "finalGrade", "inputSnapshot", "resultSnapshot", "requestedBy", "idempotencyKey", "createdAt") VALUES (` +
      [
        lit(id),
        lit(counterpartyId),
        lit(result.modelId),
        lit(result.modelVersion),
        lit(result.engineVersion),
        lit(result.asOfDate),
        lit(result.segment),
        lit(result.outcome),
        lit(result.rawScore),
        lit(result.confidenceScore),
        lit(result.engineGrade),
        lit(result.cappedGrade),
        lit(result.finalGrade),
        lit(stable(input)),
        lit(stable(result)),
        lit(r.requestedBy),
        lit(`seed:${r.counterpartyKey}:${r.asOfDate}`),
      ].join(", ") +
      `, TIMESTAMP '${r.asOfDate} 12:00:00');`
  );
}
w();

// Le segment de la contrepartie reflète la dernière notation exploitable.
w("-- Segment de la contrepartie : reflet de la dernière notation exploitable.");
for (const [key, segment] of segmentByCp) {
  w(
    `UPDATE ${SCHEMA}.counterparties SET segment = ${lit(segment)} WHERE id = ${lit(cpId.get(key)!)};`
  );
}
w();

// --- Dérogations -------------------------------------------------------------
w("-- --- Dérogations (circuit demandeur / valideur) ----------------------------");
let n = 0;
for (const o of OVERRIDES) {
  const rid = runId.get(`${o.counterpartyKey}:${o.asOfDate}`);
  if (!rid) throw new Error(`Run introuvable pour la dérogation ${o.counterpartyKey}`);
  const from = cappedByRun.get(rid);
  if (!from) {
    w(`-- dérogation ignorée : le run ${rid} n'a pas de grade.`);
    continue;
  }
  // Le jeu de démonstration ne doit jamais contenir une dérogation que l'API
  // refuserait : mêmes règles que POST /api/v1/overrides.
  const scale = getModel(DEFAULT_MODEL)!.masterScale;
  const notches = Math.abs(gradeRank(scale, o.toGrade) - gradeRank(scale, from));
  if (notches === 0) {
    throw new Error(
      `Dérogation ${o.counterpartyKey} : grade cible identique au grade actuel (${from}).`
    );
  }
  if (notches > 2) {
    throw new Error(
      `Dérogation ${o.counterpartyKey} : ${notches} crans demandés, limite ordinaire de 2 dépassée.`
    );
  }
  if (o.decidedBy && o.decidedBy === o.requestedBy) {
    throw new Error(
      `Dérogation ${o.counterpartyKey} : le valideur doit différer du demandeur.`
    );
  }

  const id = `seed_ovr_${slug(o.counterpartyKey)}_${++n}`;
  const decidedAt = o.decision ? `TIMESTAMP '${o.asOfDate} 15:00:00'` : "NULL";
  w(
    `INSERT INTO ${SCHEMA}.overrides (id, "ratingRunId", "fromGrade", "toGrade", "reasonCode", comment, evidence, "requestedBy", "decidedBy", status, "decisionComment", "createdAt", "decidedAt") VALUES (` +
      [
        lit(id),
        lit(rid),
        lit(from),
        lit(o.toGrade),
        lit(o.reasonCode),
        lit(o.comment),
        lit(o.evidence),
        lit(o.requestedBy),
        lit(o.decidedBy ?? null),
        lit(o.decision ?? "PENDING"),
        lit(o.decisionComment ?? null),
      ].join(", ") +
      `, TIMESTAMP '${o.asOfDate} 14:00:00', ${decidedAt});`
  );
  if (o.decision === "APPROVED") {
    w(
      `UPDATE ${SCHEMA}.rating_runs SET "finalGrade" = ${lit(o.toGrade)} WHERE id = ${lit(rid)};`
    );
  }
}
w();
w("COMMIT;");
w();
w("-- Couverture des comportements du moteur :");
for (const [outcome, count] of Object.entries(tally).sort()) {
  w(`--   ${outcome.padEnd(24)} ${count}`);
}

process.stdout.write(out.join("\n") + "\n");
