import type { NextRequest } from "next/server";
import type { RatingInput } from "@/core/types";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { executeRatingRun, RatingServiceError } from "@/lib/rating-service";
import { ratingRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-runs — exécute et persiste un run de notation.
 *
 * Le serveur détermine poids, barèmes et scores depuis la version de modèle
 * publiée : le client ne fournit jamais le score final ni un poids exécutable.
 * Idempotence via l'en-tête `Idempotency-Key`.
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
  if (!parsed.data.counterpartyId) {
    return problem(400, "counterpartyId requis (utiliser /rating-runs/simulate pour un calcul sans persistance).");
  }

  const idempotencyKey = req.headers.get("idempotency-key") ?? undefined;
  const correlationId = req.headers.get("x-correlation-id") ?? undefined;

  const { counterpartyId, ...ratingInput } = parsed.data;
  try {
    const { runId, result, replayed } = await executeRatingRun(
      auth.identity,
      ratingInput as RatingInput,
      counterpartyId,
      idempotencyKey,
      correlationId
    );
    return ok({ runId, replayed, result }, replayed ? 200 : 201);
  } catch (e) {
    if (e instanceof RatingServiceError) return problem(e.status, e.message);
    throw e;
  }
}

/** GET /api/v1/rating-runs — derniers runs (tous portefeuilles). */
export async function GET(req: NextRequest) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
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
