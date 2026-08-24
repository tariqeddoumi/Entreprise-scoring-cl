import type { NextRequest } from "next/server";
import type { RatingInput } from "@/core/types";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { executeRatingRun, RatingServiceError } from "@/lib/rating-service";
import { guard, readJsonBody } from "@/lib/route-guard";
import { ratingRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 200;

/**
 * POST /api/v1/rating-runs — exécute et persiste une notation.
 *
 * Le serveur détermine poids, barèmes et scores depuis la version de modèle
 * publiée : le client ne fournit jamais le score final ni un poids exécutable.
 * Idempotence via l'en-tête « Idempotency-Key ».
 */
export async function POST(req: NextRequest) {
  const g = guard(req, "ANALYST");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, ratingRequestSchema);
  if (!body.ok) return body.response;

  const { counterpartyId, ...ratingInput } = body.value;
  if (!counterpartyId) {
    return problem(
      400,
      "counterpartyId requis",
      "Utiliser /rating-runs/simulate pour un calcul sans persistance."
    );
  }

  try {
    const { runId, result, replayed } = await executeRatingRun(
      g.ctx.identity,
      ratingInput as RatingInput,
      counterpartyId,
      g.ctx.idempotencyKey,
      g.ctx.correlationId
    );
    return ok({ runId, replayed, result }, replayed ? 200 : 201);
  } catch (e) {
    if (e instanceof RatingServiceError) return problem(e.status, e.message);
    throw e;
  }
}

/** GET /api/v1/rating-runs — derniers runs, tous portefeuilles confondus. */
export async function GET(req: NextRequest) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return problem(400, `Paramètre « limit » invalide (entier de 1 à ${MAX_PAGE_SIZE}).`);
  }

  const runs = await prisma.ratingRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      counterpartyId: true,
      counterparty: { select: { name: true } },
      modelId: true,
      modelVersion: true,
      asOfDate: true,
      segment: true,
      outcome: true,
      rawScore: true,
      finalGrade: true,
      requestedBy: true,
      createdAt: true,
    },
  });
  return ok({ items: runs });
}
