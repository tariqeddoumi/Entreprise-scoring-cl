import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { MOVEMENTS, parseSummary } from "@/lib/renotation";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

const ITEM_STATUSES = ["PENDING", "PROCESSING", "DONE", "SKIPPED", "ERROR"];

/** GET /api/v1/renotation-batches/{id} — avancement, synthèse et résultats par contrepartie. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "READONLY");
  if (!g.ok) return g.response;
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const movement = sp.get("movement");
  const status = sp.get("status");
  if (movement && !(MOVEMENTS as readonly string[]).includes(movement)) return problem(400, `Paramètre « movement » invalide (${MOVEMENTS.join(", ")}).`);
  if (status && !ITEM_STATUSES.includes(status)) return problem(400, `Paramètre « status » invalide (${ITEM_STATUSES.join(", ")}).`);
  const limit = Number(sp.get("limit") ?? 500);
  const offset = Number(sp.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) return problem(400, "Paramètre « limit » invalide (1 à 5000).");
  if (!Number.isInteger(offset) || offset < 0) return problem(400, "Paramètre « offset » invalide.");

  const batch = await g.ctx.db.renotationBatch.findUnique({ where: { id } });
  if (!batch) return problem(404, "Lot introuvable.");
  const items = await g.ctx.db.renotationItem.findMany({
    where: { batchId: id, ...(movement ? { movement } : {}), ...(status ? { status } : {}) },
    orderBy: { id: "asc" },
    skip: offset,
    take: limit,
    select: {
      counterpartyId: true,
      status: true,
      movement: true,
      previousGrade: true,
      newGrade: true,
      notchDelta: true,
      outcome: true,
      runId: true,
      caseId: true,
      messageFr: true,
      processedAt: true,
      counterparty: { select: { ice: true, name: true } },
    },
  });
  return ok({
    id: batch.id,
    name: batch.name,
    asOfDate: batch.asOfDate,
    status: batch.status,
    total: batch.total,
    processed: batch.processed,
    filters: JSON.parse(batch.filters),
    options: JSON.parse(batch.options),
    summary: parseSummary(batch.summary),
    items,
  });
}
