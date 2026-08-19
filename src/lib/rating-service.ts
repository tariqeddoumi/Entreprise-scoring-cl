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
    const replay = await findReplay(idempotencyKey);
    if (replay) return replay;
  }

  const result = computeRating(model, input);

  const persist = () =>
    prisma.$transaction(async (tx) => {
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

      // L'audit est inscrit dans la même transaction que le run : si l'audit
      // échoue, le run n'existe pas. Aucune opération critique sans trace.
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

  let run;
  try {
    run = await persist();
  } catch (e) {
    // Course d'idempotence : deux requêtes concurrentes portant la même clé
    // franchissent toutes deux le contrôle d'existence, et la seconde viole la
    // contrainte d'unicité. Le comportement attendu est de rejouer le résultat
    // déjà enregistré, jamais de renvoyer une erreur.
    if (idempotencyKey && isUniqueViolation(e)) {
      const replay = await findReplay(idempotencyKey);
      if (replay) return replay;
    }
    throw e;
  }

  // Publication après validation de la transaction. Au mieux : un échec de
  // livraison est journalisé dans webhook_deliveries et rejouable, il ne
  // remet jamais en cause le résultat métier déjà persisté et audité.
  void publishEvent({
    type:
      result.outcome === "SCORED" || result.outcome === "DEFAULT_GRADE"
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

/** Relit un run déjà enregistré sous une clé d'idempotence donnée. */
async function findReplay(idempotencyKey: string): Promise<PersistedRun | null> {
  const existing = await prisma.ratingRun.findUnique({ where: { idempotencyKey } });
  if (!existing) return null;
  return {
    runId: existing.id,
    result: JSON.parse(existing.resultSnapshot) as RatingResult,
    replayed: true,
  };
}

/** Violation de contrainte d'unicité (code Prisma P2002). */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}
