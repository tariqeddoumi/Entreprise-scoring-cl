"use server";

import { computeRating } from "@/core/engine";
import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import { executeRatingRun } from "@/lib/rating-service";
import { ratingRequestSchema } from "@/lib/schemas";

export interface ScoringActionResult {
  ok: boolean;
  result?: RatingResult;
  runId?: string;
  persisted: boolean;
  errorFr?: string;
  persistenceWarningFr?: string;
}

/**
 * Action serveur du parcours analyste.
 *
 * Le calcul est toujours effectué côté serveur à partir de la version de
 * modèle publiée : le navigateur n'envoie que des observations et des scores
 * qualitatifs ancrés, jamais des poids, formules ou score final.
 *
 * L'identité de l'analyste provient ici de la session applicative ; dans un
 * déploiement bancaire elle est fournie par le SSO/OIDC (voir docs/04).
 */
export async function runScoringAction(
  payload: unknown,
  counterpartyId?: string
): Promise<ScoringActionResult> {
  const parsed = ratingRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      persisted: false,
      errorFr: parsed.error.issues
        .map((i) => `${i.path.join(".")} : ${i.message}`)
        .join(" ; "),
    };
  }

  const { counterpartyId: _payloadCp, ...input } = parsed.data;
  const model = getModel(input.modelId);
  if (!model) {
    return { ok: false, persisted: false, errorFr: `Modèle inconnu : ${input.modelId}` };
  }

  // Calcul systématique (pur, sans base) — jamais bloqué par l'infrastructure.
  const result = computeRating(model, input as RatingInput);

  if (!counterpartyId) {
    return { ok: true, result, persisted: false };
  }

  try {
    const run = await executeRatingRun(
      { name: "ui-analyst", role: "ANALYST" },
      input as RatingInput,
      counterpartyId
    );
    return { ok: true, result: run.result, runId: run.runId, persisted: true };
  } catch (e) {
    return {
      ok: true,
      result,
      persisted: false,
      persistenceWarningFr:
        e instanceof Error
          ? `Résultat calculé mais non enregistré : ${e.message}`
          : "Résultat calculé mais non enregistré (base indisponible).",
    };
  }
}
