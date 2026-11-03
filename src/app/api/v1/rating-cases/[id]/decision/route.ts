import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { CaseError, decideCase } from "@/lib/cases";
import { guard, readJsonBody } from "@/lib/route-guard";
import { caseDecisionSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-cases/{id}/decision — décision sur l'étape en attente du
 * circuit de validation (validation de l'étape ou rejet du dossier). Mêmes
 * règles qu'à l'écran : fonction et rôle de l'étape, valideur distinct de tout
 * contributeur et des valideurs des étapes précédentes, motif obligatoire pour
 * un rejet. Une clé API ne porte pas de fonction : elle ne décide que des
 * étapes ouvertes à toute fonction.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const { id } = await params;
  const body = await readJsonBody(req, caseDecisionSchema);
  if (!body.ok) return body.response;

  try {
    const outcome = await decideCase(g.ctx.db, g.ctx.identity, id, body.value.decision, body.value.comment);
    const updated = await g.ctx.db.ratingCase.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, runId: true, decidedBy: true, decidedAt: true, decisionComment: true },
    });
    return ok({ ...updated, step: outcome.stepFr, nextStep: outcome.nextStepFr });
  } catch (e) {
    if (e instanceof CaseError) return problem(e.status, e.message);
    if (isOutOfScope(e)) return problem(404, "Dossier introuvable.");
    throw e;
  }
}
