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

  // --- 1. Contreparties ------------------------------------------------------
  const idByKey = new Map<string, string>();
  for (const c of COUNTERPARTIES) {
    const row = await prisma.counterparty.upsert({
      where: { ice: c.ice },
      update: {
        name: c.name,
        rc: c.rc,
        fiscalId: c.fiscalId,
        legalForm: c.legalForm,
        sectorCode: c.sectorCode,
        city: c.city,
      },
      create: {
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
    tally[result.outcome] = (tally[result.outcome] ?? 0) + 1;

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
      outcome: result.outcome,
      rawScore: result.rawScore,
      confidenceScore: result.confidenceScore,
      engineGrade: result.engineGrade,
      cappedGrade: result.cappedGrade,
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

    if (result.segment && result.outcome !== "BLOCKED_SEGMENTATION") {
      await prisma.counterparty.update({
        where: { id: counterpartyId },
        data: { segment: result.segment },
      });
    }

    const grade = result.finalGrade ?? "—";
    const score = result.rawScore !== null ? result.rawScore.toFixed(2).padStart(6) : "    —";
    console.log(
      `  ${r.asOfDate}  ${score}  ${grade.padEnd(4)} ${result.outcome.padEnd(22)} ${r.counterpartyKey}`
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
