import { computeRating } from "@/core/engine";
import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";
import { publishEvent } from "./webhooks";

export class RatingServiceError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Calcule une notation sans persistance (simulation / what-if). */
export function simulateRating(input: RatingInput): RatingResult {
  const model = getModel(input.modelId);
  if (!model) {
    throw new RatingServiceError(404, `Modèle inconnu : ${input.modelId}`);
  }
  return computeRating(model, input);
}

export interface PersistedRun {
  runId: string;
  result: RatingResult;
  replayed: boolean;
}

/**
 * Exécute et persiste un run de notation.
 *
 * Garanties :
 *  - idempotence : une même Idempotency-Key retourne le run existant, sans
 *    créer un second résultat contradictoire ;
 *  - le snapshot d'entrée et le résultat complet sont persistés de manière
 *    immuable (reproductibilité) ;
 *  - l'audit est écrit DANS la même transaction que le run (atomicité) ;
 *  - l'identité provient du contexte de sécurité, jamais du payload.
 */
export async function executeRatingRun(
  identity: Identity,
  input: RatingInput,
  counterpartyId: string,
  idempotencyKey?: string,
  correlationId?: string
): Promise<PersistedRun> {
  const model = getModel(input.modelId);
  if (!model) {
    throw new RatingServiceError(404, `Modèle inconnu : ${input.modelId}`);
  }

  const counterparty = await prisma.counterparty.findUnique({
    where: { id: counterpartyId },
  });
  if (!counterparty) {
    throw new RatingServiceError(404, `Contrepartie inconnue : ${counterpartyId}`);
  }

  if (idempotencyKey) {
    const existing = await prisma.ratingRun.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return {
        runId: existing.id,
        result: JSON.parse(existing.resultSnapshot) as RatingResult,
        replayed: true,
      };
    }
  }

  const result = computeRating(model, input);

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.ratingRun.create({
      data: {
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
        requestedBy: identity.name,
        idempotencyKey,
      },
    });
    if (result.segment && result.segment !== counterparty.segment) {
      await tx.counterparty.update({
        where: { id: counterpartyId },
        data: { segment: result.segment },
      });
    }
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "RATING_RUN_CREATED",
      resourceType: "RatingRun",
      resourceId: created.id,
      detail: {
        counterpartyId,
        modelId: result.modelId,
        modelVersion: result.modelVersion,
        outcome: result.outcome,
        rawScore: result.rawScore,
        finalGrade: result.finalGrade,
        asOfDate: result.asOfDate,
      },
      correlationId,
    });
    return created;
  });

  // Publication post-commit (best-effort, journalisée).
  void publishEvent({
    type: result.outcome === "SCORED" || result.outcome === "DEFAULT_GRADE"
      ? "rating.completed"
      : "rating.blocked",
    data: {
      runId: run.id,
      counterpartyId,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      outcome: result.outcome,
      segment: result.segment,
      rawScore: result.rawScore,
      finalGrade: result.finalGrade,
      asOfDate: result.asOfDate,
      pdStatus: result.pdStatus,
    },
  }).catch(() => undefined);

  return { runId: run.id, result, replayed: false };
}
