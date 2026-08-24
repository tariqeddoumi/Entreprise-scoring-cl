import type { NextRequest } from "next/server";
import type { RatingInput } from "@/core/types";
import { ok, problem } from "@/lib/api-utils";
import { RatingServiceError, simulateRating } from "@/lib/rating-service";
import { guard, readJsonBody } from "@/lib/route-guard";
import { ratingRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-runs/simulate — calcul sans persistance.
 * Mêmes règles de validation ; aucun état modifié, aucun événement émis.
 */
export async function POST(req: NextRequest) {
  const g = guard(req, "ANALYST");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, ratingRequestSchema);
  if (!body.ok) return body.response;

  // counterpartyId est ignoré en simulation : aucune donnée n'est rattachée.
  const { counterpartyId: _unused, ...ratingInput } = body.value;
  try {
    return ok({ simulation: true, result: simulateRating(ratingInput as RatingInput) });
  } catch (e) {
    if (e instanceof RatingServiceError) return problem(e.status, e.message);
    throw e;
  }
}
