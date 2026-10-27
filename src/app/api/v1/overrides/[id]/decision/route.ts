import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { decideOverride, OverrideError } from "@/lib/overrides";
import { guard, readJsonBody } from "@/lib/route-guard";
import { overrideDecisionSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/overrides/{id}/decision — approbation ou rejet (valideur).
 * Auto-approbation refusée ; décisions concurrentes impossibles
 * (src/lib/overrides.ts).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const { id } = await params;
  const body = await readJsonBody(req, overrideDecisionSchema);
  if (!body.ok) return body.response;

  try {
    const updated = await decideOverride(
      g.ctx.db,
      g.ctx.identity,
      id,
      body.value.decision,
      body.value.comment,
      g.ctx.correlationId
    );
    return ok(updated);
  } catch (e) {
    if (e instanceof OverrideError) return problem(e.status, e.message, e.detail);
    if (isOutOfScope(e)) return problem(404, "Dérogation inconnue.");
    throw e;
  }
}
