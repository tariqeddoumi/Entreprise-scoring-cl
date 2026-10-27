import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { CASE_STATUSES } from "@/lib/cases";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 200;

/** GET /api/v1/rating-cases — dossiers de notation du périmètre, filtrables par statut. */
export async function GET(req: NextRequest) {
  const g = await guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status && !(CASE_STATUSES as readonly string[]).includes(status)) {
    return problem(400, `Paramètre « status » invalide (${CASE_STATUSES.join(", ")}).`);
  }
  const limit = Number(searchParams.get("limit") ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return problem(400, `Paramètre « limit » invalide (entier de 1 à ${MAX_PAGE_SIZE}).`);
  }

  const items = await g.ctx.db.ratingCase.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      counterpartyId: true,
      modelId: true,
      asOfDate: true,
      status: true,
      runId: true,
      createdBy: true,
      submittedBy: true,
      submittedAt: true,
      decidedBy: true,
      decidedAt: true,
      decisionComment: true,
      updatedAt: true,
    },
  });
  return ok({ items });
}
