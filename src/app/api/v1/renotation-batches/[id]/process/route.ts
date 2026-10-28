import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { processBatch, RenotationError } from "@/lib/renotation";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/v1/renotation-batches/{id}/process — traite une tranche du lot
 * (au plus ~50 s) et rend l'avancement. À rappeler tant que le statut n'est
 * pas DONE ; une reprise après interruption ne note jamais deux fois.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;
  const { id } = await params;
  try {
    return ok(await processBatch(g.ctx.db, id, 50_000));
  } catch (e) {
    if (e instanceof RenotationError) return problem(e.status, e.message);
    throw e;
  }
}
