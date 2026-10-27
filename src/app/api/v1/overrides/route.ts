import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { OverrideError, requestOverride } from "@/lib/overrides";
import { guard, readJsonBody } from "@/lib/route-guard";
import { overrideRequestSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/overrides — proposition de dérogation (demandeur).
 *
 * Règles dans src/lib/overrides.ts, partagées avec l'écran : grade moteur jamais
 * écrasé, ampleur plafonnée par le paramétrage, défaut ni quitté ni atteint,
 * notation validée et de la version de modèle chargée.
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, overrideRequestSchema);
  if (!body.ok) return body.response;

  try {
    const override = await requestOverride(g.ctx.db, g.ctx.identity, body.value, g.ctx.correlationId);
    return ok(override, 201);
  } catch (e) {
    if (e instanceof OverrideError) return problem(e.status, e.message, e.detail);
    if (isOutOfScope(e)) return problem(404, "Run de notation inconnu.");
    throw e;
  }
}
