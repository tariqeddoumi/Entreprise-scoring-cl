import { createHash } from "node:crypto";
import { computeRating } from "@/core/engine";
import type { EngineOptions } from "@/core/engine";
import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { config } from "./env";
import { prisma } from "./prisma";
import { stableStringify } from "./api-utils";
import { publishEvent } from "./webhooks";

/**
 * Options du moteur dérivées de l'environnement.
 *
 * Le moteur est pur et ne lit jamais l'environnement : la décision d'exposer
 * ou non une probabilité de défaut non calibrée est prise ICI, à la frontière,
 * et transmise explicitement (constat C02).
 */
export function engineOptions(): EngineOptions {
  return { syntheticPdAllowed: config().allowSyntheticPd };
}

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
  return computeRating(model, input, engineOptions());
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

  // Idempotence liée au CONTENU (constat M01) : une même clé présentée avec un
  // payload différent est un conflit, pas un rejeu. Sans ce contrôle, un
  // appelant qui réutilise sa clé par erreur reçoit silencieusement le résultat
  // d'un autre dossier.
  const payloadHash = createHash("sha256")
    .update(stableStringify({ counterpartyId, input }))
    .digest("hex");

  if (idempotencyKey) {
    const replay = await findReplay(idempotencyKey, payloadHash);
    if (replay) return replay;
  }

  const result = computeRating(model, input, engineOptions());

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
          outcome: result.ratingStatus,
          rawScore: result.rawScore,
          confidenceScore: result.confidence.score,
          engineGrade: result.engineGrade,
          cappedGrade: result.standaloneGrade,
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
          outcome: result.ratingStatus,
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
      const replay = await findReplay(idempotencyKey, payloadHash);
      if (replay) return replay;
    }
    throw e;
  }

  // Publication après validation de la transaction. Au mieux : un échec de
  // livraison est journalisé dans webhook_deliveries et rejouable, il ne
  // remet jamais en cause le résultat métier déjà persisté et audité.
  void publishEvent({
    type:
      result.ratingStatus === "RATED" || result.ratingStatus === "DEFAULTED"
        ? "rating.completed"
        : "rating.blocked",
    data: {
      runId: run.id,
      counterpartyId,
      modelId: result.modelId,
      modelVersion: result.modelVersion,
      outcome: result.ratingStatus,
      segment: result.segment,
      rawScore: result.rawScore,
      gradeScaleId: result.gradeScaleId,
      finalGrade: result.finalGrade,
      asOfDate: result.asOfDate,
      pdStatus: result.pdStatus,
      // Les droits d'usage voyagent avec l'événement : un consommateur aval
      // n'a pas à deviner ce qu'il a le droit de faire du grade (constat M01).
      purpose: result.usageRights.purpose,
      permittedUses: result.usageRights.permittedUsesFr,
      restrictions: result.usageRights.restrictionsFr,
    },
  }).catch(() => undefined);

  return { runId: run.id, result, replayed: false };
}

/**
 * Relit un run déjà enregistré sous une clé d'idempotence donnée.
 *
 * Le rejeu n'est accordé que si le contenu présenté est identique à celui qui a
 * produit le run : une même clé sur un payload différent lève un conflit
 * explicite (409), conformément au constat M01.
 */
async function findReplay(
  idempotencyKey: string,
  payloadHash: string
): Promise<PersistedRun | null> {
  const existing = await prisma.ratingRun.findUnique({ where: { idempotencyKey } });
  if (!existing) return null;

  const storedInput = existing.inputSnapshot;
  const storedHash = createHash("sha256")
    .update(
      stableStringify({
        counterpartyId: existing.counterpartyId,
        input: JSON.parse(storedInput) as RatingInput,
      })
    )
    .digest("hex");
  if (storedHash !== payloadHash) {
    throw new RatingServiceError(
      409,
      "Conflit d'idempotence : cette clé a déjà été utilisée avec un contenu différent. Utiliser une clé distincte pour un dossier distinct."
    );
  }

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
