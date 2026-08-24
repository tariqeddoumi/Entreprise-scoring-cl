import type { NextRequest } from "next/server";
import { compareRuns } from "@/core/compare";
import type { RatingResult } from "@/core/types";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { compareRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-runs/compare — attribue l'écart entre deux notations.
 *
 * La comparaison s'appuie sur les instantanés persistés, jamais sur un
 * recalcul : elle reste donc valable même si le modèle a évolué depuis.
 */
export async function POST(req: NextRequest) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, compareRequestSchema);
  if (!body.ok) return body.response;
  const { previousRunId, currentRunId } = body.value;

  if (previousRunId === currentRunId) {
    return problem(400, "Les deux identifiants de run sont identiques.");
  }

  const runs = await prisma.ratingRun.findMany({
    where: { id: { in: [previousRunId, currentRunId] } },
    select: { id: true, counterpartyId: true, asOfDate: true, resultSnapshot: true },
  });

  const previous = runs.find((r) => r.id === previousRunId);
  const current = runs.find((r) => r.id === currentRunId);
  if (!previous || !current) {
    return problem(
      404,
      "Run de notation inconnu",
      `Introuvable : ${!previous ? previousRunId : currentRunId}`
    );
  }
  if (previous.counterpartyId !== current.counterpartyId) {
    return problem(
      422,
      "Runs de contreparties différentes",
      "La comparaison n'a de sens qu'entre deux notations d'une même contrepartie."
    );
  }

  const comparison = compareRuns(
    JSON.parse(previous.resultSnapshot) as RatingResult,
    JSON.parse(current.resultSnapshot) as RatingResult
  );

  return ok({
    previousRunId,
    currentRunId,
    counterpartyId: previous.counterpartyId,
    previousAsOfDate: previous.asOfDate,
    currentAsOfDate: current.asOfDate,
    comparison,
  });
}
