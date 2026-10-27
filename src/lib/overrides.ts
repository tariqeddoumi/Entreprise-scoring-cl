import type { PrismaClient } from "@/generated/prisma";
import type { z } from "zod";
import { gradeRank } from "@/core/grades";
import { getModel } from "@/models";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import type { overrideRequestSchema } from "./schemas";
import { settingInt } from "./settings";
import { publishEvent } from "./webhooks";

/**
 * Dérogations (maker-checker) — chemin unique de l'API et de l'écran.
 *
 * Le résultat moteur n'est jamais écrasé : la dérogation est un objet distinct,
 * appliqué au grade final seulement après approbation par une seconde personne.
 *
 * RÉFÉRENCE — l'écart en crans se mesure depuis `cappedGrade`, qui porte le
 * grade produit par le moteur, support groupe compris : `finalGrade` porte déjà
 * le résultat d'une dérogation approuvée, ce qui permettrait d'enchaîner les
 * dérogations et de dépasser la limite par accumulation.
 */

export class OverrideError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string
  ) {
    super(message);
  }
}

export async function requestOverride(
  db: PrismaClient,
  identity: Identity,
  input: z.infer<typeof overrideRequestSchema>,
  correlationId?: string
) {
  const { ratingRunId, toGrade, reasonCode, comment, evidence, expiresAt } = input;
  const maxNotches = await settingInt("OVERRIDE_MAX_NOTCHES");

  const run = await db.ratingRun.findUnique({
    where: { id: ratingRunId },
    include: { counterparty: { select: { entityId: true } }, ratingCase: { select: { status: true } } },
  });
  if (!run) throw new OverrideError(404, "Run de notation inconnu.");
  if (run.ratingCase && run.ratingCase.status !== "VALIDATED") {
    throw new OverrideError(
      409,
      "Dérogation impossible sur une notation non validée",
      "Une dérogation porte sur une note validée ; avant la validation, le dossier se corrige ou se rejette."
    );
  }
  if (!run.cappedGrade) throw new OverrideError(409, "Ce run n'a pas de grade : une dérogation est impossible.");
  if (run.cappedGrade.startsWith("DEF")) {
    throw new OverrideError(
      409,
      "Amélioration d'un grade défaut interdite",
      "Un retour en encours sain relève du processus formel de guérison, hors dérogation ordinaire."
    );
  }
  // Un défaut est un constat reçu d'un moteur amont, jamais un jugement.
  if (toGrade.startsWith("DEF")) {
    throw new OverrideError(
      409,
      "Passage en défaut par dérogation interdit",
      "Le défaut se déclare comme un constat (defaultTriggered, defaultGrade) lors d'une nouvelle notation, pas par dérogation."
    );
  }
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new OverrideError(400, "Date d'expiration déjà passée.", `expiresAt = ${expiresAt}`);
  }
  const pending = await db.override.findFirst({ where: { ratingRunId, status: "PENDING" }, select: { id: true } });
  if (pending) {
    throw new OverrideError(409, "Une dérogation est déjà en attente de décision sur ce run.", `Dérogation ${pending.id}.`);
  }

  const model = getModel(run.modelId);
  if (!model) throw new OverrideError(500, "Version de modèle du run indisponible.");
  // L'écart se mesure sur l'échelle de la version qui a produit le grade.
  if (run.modelVersion !== model.version) {
    throw new OverrideError(
      409,
      "Dérogation impossible sur une notation d'une version antérieure du modèle",
      `Run produit par ${run.modelId} v${run.modelVersion} ; version chargée : v${model.version}. Produire une nouvelle notation, puis déroger sur celle-ci.`
    );
  }
  let notches: number;
  try {
    notches = Math.abs(gradeRank(model.gradeScale, toGrade) - gradeRank(model.gradeScale, run.cappedGrade));
  } catch {
    throw new OverrideError(400, `Grade cible inconnu : ${toGrade}`);
  }
  if (notches === 0) throw new OverrideError(400, "Le grade cible est identique au grade actuel.");
  if (notches > maxNotches) {
    throw new OverrideError(422, `Dérogation ordinaire limitée à ±${maxNotches} crans (demandé : ${notches}).`, "Passer par le comité.");
  }

  return db.$transaction(async (tx) => {
    const created = await tx.override.create({
      data: {
        ratingRunId,
        fromGrade: run.cappedGrade!,
        toGrade,
        reasonCode,
        comment,
        evidence,
        requestedBy: identity.name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "OVERRIDE_REQUESTED",
      resourceType: "Override",
      resourceId: created.id,
      entityId: run.counterparty.entityId,
      detail: { ratingRunId, fromGrade: run.cappedGrade, toGrade, reasonCode, notches },
      correlationId,
    });
    return created;
  });
}

class ConcurrentDecisionError extends Error {}

/**
 * Approbation ou rejet. Séparation des tâches stricte : l'auto-approbation est
 * refusée. La décision est prise dans une transaction avec relecture du statut,
 * afin que deux décisions concurrentes ne puissent pas s'appliquer toutes deux.
 */
export async function decideOverride(
  db: PrismaClient,
  identity: Identity,
  id: string,
  decision: "APPROVED" | "REJECTED",
  comment: string | undefined,
  correlationId?: string
) {
  const override = await db.override.findUnique({
    where: { id },
    include: { ratingRun: { select: { counterparty: { select: { entityId: true } } } } },
  });
  if (!override) throw new OverrideError(404, "Dérogation inconnue.");
  if (override.status !== "PENDING") throw new OverrideError(409, `Dérogation déjà décidée (${override.status}).`);
  if (override.requestedBy === identity.name) {
    throw new OverrideError(403, "Auto-approbation interdite", "Le valideur doit être distinct du demandeur (principe des quatre yeux).");
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.override.updateMany({
        where: { id, status: "PENDING" },
        data: { status: decision, decidedBy: identity.name, decisionComment: comment, decidedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConcurrentDecisionError();
      if (decision === "APPROVED") {
        await tx.ratingRun.update({ where: { id: override.ratingRunId }, data: { finalGrade: override.toGrade } });
      }
      await auditWithin(tx, {
        actor: identity.name,
        actorRole: identity.role,
        action: decision === "APPROVED" ? "OVERRIDE_APPROVED" : "OVERRIDE_REJECTED",
        resourceType: "Override",
        resourceId: id,
        entityId: override.ratingRun.counterparty.entityId,
        detail: {
          ratingRunId: override.ratingRunId,
          fromGrade: override.fromGrade,
          toGrade: override.toGrade,
          requestedBy: override.requestedBy,
        },
        correlationId,
      });
      return tx.override.findUniqueOrThrow({ where: { id } });
    });

    if (decision === "APPROVED") {
      void publishEvent({
        type: "rating.overridden",
        data: {
          runId: override.ratingRunId,
          overrideId: id,
          fromGrade: override.fromGrade,
          toGrade: override.toGrade,
          reasonCode: override.reasonCode,
        },
      }).catch(() => undefined);
    }
    return updated;
  } catch (e) {
    if (e instanceof ConcurrentDecisionError) {
      throw new OverrideError(409, "Dérogation déjà décidée par un autre valideur.");
    }
    throw e;
  }
}
