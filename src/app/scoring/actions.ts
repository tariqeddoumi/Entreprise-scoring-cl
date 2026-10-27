"use server";

import type { RatingInput, RatingResult } from "@/core/types";
import { getModel } from "@/models";
import { draftToRequest, type CaseDraft } from "@/lib/case-input";
import { simulateRating } from "@/lib/rating-service";
import { ratingRequestSchema } from "@/lib/schemas";
import { getSessionIdentity } from "@/lib/session";

export interface SimulationResult {
  ok: boolean;
  result?: RatingResult;
  errorFr?: string;
}

/**
 * Simulation du parcours analyste : calcul serveur, rien n'est enregistré.
 *
 * Une notation enregistrée passe désormais par un dossier (brouillon →
 * soumission → validation) : l'ancienne action qui enregistrait directement un
 * run créait une note officielle sans validation par une seconde personne.
 *
 * Mêmes règles que l'API (D-43) : session exigée AVANT tout calcul — une action
 * serveur est un point d'entrée public — et rôle ANALYST, comme
 * `/rating-runs/simulate`. Sans montants convertis, la segmentation repose sur
 * le segment imposé.
 */
export async function simulateDraftAction(modelId: string, draft: CaseDraft): Promise<SimulationResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const model = getModel(modelId);
  if (!model) return { ok: false, errorFr: `Modèle inconnu : ${modelId}` };
  if (!draft.segment) {
    return {
      ok: false,
      errorFr: "En simulation, imposez le segment : la conversion des montants n'est faite que dans un dossier.",
    };
  }
  const parsed = ratingRequestSchema.safeParse(draftToRequest(draft, model));
  if (!parsed.success) {
    return { ok: false, errorFr: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ") };
  }
  const { counterpartyId: _ignored, ...input } = parsed.data;
  return { ok: true, result: simulateRating(input as RatingInput) };
}
