import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { createBatch, createBatchSchema, normalizeRefreshRows, parseSummary, RenotationError } from "@/lib/renotation";
import { guard, readJsonBody } from "@/lib/route-guard";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/** GET /api/v1/renotation-batches — derniers lots du périmètre. */
export async function GET(req: NextRequest) {
  const g = await guard(req, "READONLY");
  if (!g.ok) return g.response;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 30);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return problem(400, "Paramètre « limit » invalide (1 à 200).");
  const rows = await g.ctx.db.renotationBatch.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return ok({
    items: rows.map((b) => ({
      id: b.id,
      name: b.name,
      asOfDate: b.asOfDate,
      status: b.status,
      total: b.total,
      processed: b.processed,
      filters: JSON.parse(b.filters),
      summary: parseSummary(b.summary),
      scheduleId: b.scheduleId,
      createdBy: b.createdBy,
      createdAt: b.createdAt,
      finishedAt: b.finishedAt,
    })),
  });
}

/**
 * POST /api/v1/renotation-batches — crée un lot de renotation (sans le
 * traiter : POST /renotation-batches/{id}/process, ou la tâche planifiée).
 * Même rôle que l'écran : gestionnaire des risques.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;
  const body = await readJsonBody(req, createBatchSchema);
  if (!body.ok) return body.response;
  const refresh = body.value.refresh ? normalizeRefreshRows(body.value.refresh) : null;
  if (refresh?.errors.length) return problem(400, "Données rafraîchies invalides", refresh.errors.slice(0, 20).join(" ; "));
  try {
    const { batch, refreshed } = await createBatch(g.ctx.db, g.ctx.perimeter, g.ctx.identity, {
      name: body.value.name,
      asOfDate: body.value.asOfDate,
      filters: body.value.filters,
      options: body.value.options,
      refresh: refresh?.rows,
    });
    return ok({ id: batch.id, status: batch.status, total: batch.total, refreshed }, 201);
  } catch (e) {
    if (e instanceof RenotationError) return problem(e.status, e.message);
    if (isOutOfScope(e)) return problem(403, "Sélection hors du périmètre d'écriture.");
    throw e;
  }
}
