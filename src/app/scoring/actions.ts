"use server";

import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import { executeRatingRun, simulateRating } from "@/lib/rating-service";
import { ratingRequestSchema } from "@/lib/schemas";
import { getSessionIdentity } from "@/lib/session";

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
 * L'identité de l'analyste provient de la session authentifiée (cookie
 * HttpOnly vérifié côté serveur), jamais d'une valeur codée en dur ni d'un
 * champ de formulaire.
 *
 * Mêmes règles que l'API (D-43) :
 *  - la session est exigée AVANT tout calcul, simulation comprise. Une action
 *    serveur est un point d'entrée public — son identifiant figure dans le
 *    JavaScript livré au navigateur — et l'écran qui l'appelle ne la protège
 *    pas : sans ce contrôle, le moteur répondait à un appel anonyme alors que
 *    `/rating-runs/simulate` le refuse (401) ;
 *  - rôle ANALYST, comme `/rating-runs/simulate` et `/rating-runs` ;
 *  - options du moteur dérivées de l'environnement par le service de notation,
 *    pour qu'un même dossier donne le même résultat à l'écran et par l'API.
 */
export async function runScoringAction(
  payload: unknown,
  counterpartyId?: string
): Promise<ScoringActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) {
    return { ok: false, persisted: false, errorFr: session.reasonFr };
  }

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
  if (!getModel(input.modelId)) {
    return { ok: false, persisted: false, errorFr: `Modèle inconnu : ${input.modelId}` };
  }

  // Calcul systématique (pur, sans base) — jamais bloqué par l'infrastructure.
  const result = simulateRating(input as RatingInput);

  if (!counterpartyId) {
    return { ok: true, result, persisted: false };
  }

  try {
    const run = await executeRatingRun(
      session.identity,
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
