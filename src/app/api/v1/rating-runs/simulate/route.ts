import type { NextRequest } from "next/server";
import type { RatingInput } from "@/core/types";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { RatingServiceError, simulateRating } from "@/lib/rating-service";
import { ratingRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-runs/simulate — calcul sans persistance (what-if).
 * Mêmes règles de validation ; aucun état modifié, aucun webhook émis.
 */
export async function POST(req: NextRequest) {
  const auth = authenticate(req, "ANALYST");
  if (!auth.ok) return problem(auth.status, auth.message);

  const body = await req.json().catch(() => null);
  const parsed = ratingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(
      400,
      "Payload invalide",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; ")
    );
  }

  const { counterpartyId: _ignored, ...ratingInput } = parsed.data;
  try {
    const result = simulateRating(ratingInput as RatingInput);
    return ok({ simulation: true, result });
  } catch (e) {
    if (e instanceof RatingServiceError) return problem(e.status, e.message);
    throw e;
  }
}
