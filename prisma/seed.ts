/**
 * Jeu de démonstration SYNTHÉTIQUE — application.
 *
 * Les notations sont produites par le VRAI moteur, jamais écrites à la main :
 * le jeu de démonstration reste donc cohérent avec la version de modèle
 * courante, et se régénère si le modèle évolue.
 *
 * Refuse de s'exécuter en production : ces données sont fictives.
 *
 * Usage : npm run db:seed  [--reset]
 */
import { computeRating } from "../src/core/engine";
import type { RatingInput } from "../src/core/types";
import { getModel } from "../src/models";
import { PrismaClient } from "../src/generated/prisma";
import { COUNTERPARTIES, OVERRIDES, RUNS } from "./seed-data";

const prisma = new PrismaClient();
const DEFAULT_MODEL = "CORP_STD_V1";

/** Organisation fictive : un groupe, une banque au Maroc, une filiale africaine. */
const ROOT_ENTITY_ID = "ent_groupe";
const DEMO_BANK_ID = "ent_demo_maroc";
const DEMO_ENTITIES = [
  { id: ROOT_ENTITY_ID, code: "GROUPE", name: "Groupe", type: "GROUP", parentId: null, country: "MA", currency: "MAD" },
  { id: DEMO_BANK_ID, code: "DEMO-MA", name: "Banque de démonstration Maroc", type: "BANK", parentId: ROOT_ENTITY_ID, country: "MA", currency: "MAD" },
  { id: "ent_demo_afrique", code: "DEMO-AFR", name: "Filiales Afrique (démonstration)", type: "SUBSIDIARY_GROUP", parentId: ROOT_ENTITY_ID, country: null, currency: "XOF" },
  { id: "ent_demo_ci", code: "DEMO-CI", name: "Filiale de démonstration Côte d'Ivoire", type: "SUBSIDIARY", parentId: "ent_demo_afrique", country: "CI", currency: "XOF" },
];
function pathOf(e: { id: string; parentId: string | null }): string {
  const parent = DEMO_ENTITIES.find((x) => x.id === e.parentId);
  return parent ? `${pathOf(parent)}${e.id}/` : `/${e.id}/`;
}
const reset = process.argv.includes("--reset");

/** Sérialisation stable : mêmes clés, même ordre, donc même empreinte. */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
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

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refus d'exécuter le jeu de démonstration en production : ces données sont fictives."
    );
  }

  console.log("Jeu de démonstration — données FICTIVES\n");

  if (reset) {
    // Ordre imposé par les clés étrangères. L'audit est en ajout seul : il
    // n'est jamais purgé, ce qui est le comportement recherché.
    const demoIces = COUNTERPARTIES.map((c) => c.ice);
    const demo = await prisma.counterparty.findMany({
      where: { ice: { in: demoIces } },
      select: { id: true },
    });
    const ids = demo.map((d) => d.id);
    if (ids.length > 0) {
      const runs = await prisma.ratingRun.findMany({
        where: { counterpartyId: { in: ids } },
        select: { id: true },
      });
      await prisma.override.deleteMany({
        where: { ratingRunId: { in: runs.map((r) => r.id) } },
      });
      await prisma.ratingRun.deleteMany({ where: { counterpartyId: { in: ids } } });
      await prisma.counterparty.deleteMany({ where: { id: { in: ids } } });
      console.log(`  purge : ${ids.length} contrepartie(s) de démonstration supprimée(s)\n`);
    }
  }

  // --- 0. Organisation de démonstration --------------------------------------
  // La racine porte l'identifiant que crée aussi la migration
  // prisma/sql/04-multi-entites-workflow-ia.sql, pour qu'un jeu installé sur une
  // base migrée retrouve la même organisation.
  for (const e of DEMO_ENTITIES) {
    const parent = DEMO_ENTITIES.find((x) => x.id === e.parentId);
    const path = parent ? `${pathOf(parent)}${e.id}/` : `/${e.id}/`;
    await prisma.entity.upsert({
      where: { id: e.id },
      update: { name: e.name, type: e.type, country: e.country, currency: e.currency },
      create: { ...e, path, level: path.split("/").filter(Boolean).length - 1 },
    });
  }
  console.log(`  ${DEMO_ENTITIES.length} entités (groupe, banque, filiales)`);

  // --- 1. Contreparties ------------------------------------------------------
  const idByKey = new Map<string, string>();
  for (const c of COUNTERPARTIES) {
    const row = await prisma.counterparty.upsert({
      where: { entityId_ice: { entityId: DEMO_BANK_ID, ice: c.ice } },
      update: {
        name: c.name,
        rc: c.rc,
        fiscalId: c.fiscalId,
        legalForm: c.legalForm,
        sectorCode: c.sectorCode,
        city: c.city,
      },
      create: {
        entityId: DEMO_BANK_ID,
        country: "MA",
        currency: "MAD",
        name: c.name,
        ice: c.ice,
        rc: c.rc,
        fiscalId: c.fiscalId,
        legalForm: c.legalForm,
        sectorCode: c.sectorCode,
        city: c.city,
      },
    });
    idByKey.set(c.key, row.id);
  }
  console.log(`  ${COUNTERPARTIES.length} contreparties`);

  // --- 2. Notations ----------------------------------------------------------
  const runIdByKey = new Map<string, string>();
  const tally: Record<string, number> = {};

  for (const r of RUNS) {
    const counterpartyId = idByKey.get(r.counterpartyKey);
    if (!counterpartyId) throw new Error(`Contrepartie inconnue : ${r.counterpartyKey}`);

    const modelId = r.input.modelId ?? DEFAULT_MODEL;
    const model = getModel(modelId);
    if (!model) throw new Error(`Modèle inconnu : ${modelId}`);

    const input: RatingInput = { ...r.input, modelId, asOfDate: r.asOfDate };
    // Horodatage fixe : le jeu reste reproductible d'une exécution à l'autre.
    const result = computeRating(model, input, `${r.asOfDate}T12:00:00.000Z`);
    tally[result.ratingStatus] = (tally[result.ratingStatus] ?? 0) + 1;

    // La clé d'idempotence rend le seed rejouable sans doublon.
    const idempotencyKey = `seed:${r.counterpartyKey}:${r.asOfDate}`;
    const existing = await prisma.ratingRun.findUnique({ where: { idempotencyKey } });

    const data = {
      counterpartyId,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      engineVersion: result.engineVersion,
      asOfDate: result.asOfDate,
      segment: result.segment,
      outcome: result.ratingStatus,
      rawScore: result.rawScore,
      confidenceScore: result.confidence.score,
      engineGrade: result.engineGrade,
      cappedGrade: result.finalGrade, // grade moteur, support groupe compris
      finalGrade: result.finalGrade,
      inputSnapshot: stableStringify(input),
      resultSnapshot: stableStringify(result),
      requestedBy: r.requestedBy,
      idempotencyKey,
    };

    const row = existing
      ? await prisma.ratingRun.update({ where: { idempotencyKey }, data })
      : await prisma.ratingRun.create({ data });

    runIdByKey.set(`${r.counterpartyKey}:${r.asOfDate}`, row.id);

    if (result.segment && result.ratingStatus !== "NO_RATING_SEGMENT_UNDETERMINED") {
      await prisma.counterparty.update({
        where: { id: counterpartyId },
        data: { segment: result.segment },
      });
    }

    const grade = result.finalGrade ?? "—";
    const score = result.rawScore !== null ? result.rawScore.toFixed(2).padStart(6) : "    —";
    console.log(
      `  ${r.asOfDate}  ${score}  ${grade.padEnd(4)} ${result.ratingStatus.padEnd(22)} ${r.counterpartyKey}`
    );
  }

  // --- 3. Dérogations --------------------------------------------------------
  let overrideCount = 0;
  for (const o of OVERRIDES) {
    const ratingRunId = runIdByKey.get(`${o.counterpartyKey}:${o.asOfDate}`);
    if (!ratingRunId) throw new Error(`Run introuvable pour la dérogation ${o.counterpartyKey}`);

    const run = await prisma.ratingRun.findUniqueOrThrow({ where: { id: ratingRunId } });
    if (!run.cappedGrade) {
      console.log(`  dérogation ignorée (run sans grade) : ${o.counterpartyKey}`);
      continue;
    }

    const already = await prisma.override.findFirst({
      where: { ratingRunId, requestedBy: o.requestedBy, toGrade: o.toGrade },
    });
    if (already) continue;

    await prisma.override.create({
      data: {
        ratingRunId,
        fromGrade: run.cappedGrade,
        toGrade: o.toGrade,
        reasonCode: o.reasonCode,
        comment: o.comment,
        evidence: o.evidence,
        requestedBy: o.requestedBy,
        decidedBy: o.decidedBy,
        status: o.decision ?? "PENDING",
        decisionComment: o.decisionComment,
        decidedAt: o.decision ? new Date(`${o.asOfDate}T15:00:00.000Z`) : null,
      },
    });

    // Une dérogation approuvée s'applique au grade final ; le grade moteur et
    // le grade après caps restent intacts.
    if (o.decision === "APPROVED") {
      await prisma.ratingRun.update({
        where: { id: ratingRunId },
        data: { finalGrade: o.toGrade },
      });
    }
    overrideCount += 1;
  }

  // --- 4. Récapitulatif ------------------------------------------------------
  console.log(`\n  ${RUNS.length} notations, ${overrideCount} dérogations`);
  console.log("\n  Couverture des comportements du moteur :");
  for (const [outcome, n] of Object.entries(tally).sort()) {
    console.log(`    ${outcome.padEnd(24)} ${n}`);
  }
  console.log(
    "\nJeu de démonstration appliqué. Toutes les contreparties sont fictives."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
