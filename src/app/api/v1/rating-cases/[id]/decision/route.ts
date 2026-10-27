import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { CaseError, decideCase } from "@/lib/cases";
import { guard, readJsonBody } from "@/lib/route-guard";
import { caseDecisionSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rating-cases/{id}/decision — validation ou rejet d'un dossier
 * soumis. Valideur distinct de tout contributeur ; rôle selon le paramétrage et
 * la délégation par montant ; motif obligatoire pour un rejet.
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
    await decideCase(g.ctx.db, g.ctx.identity, id, body.value.decision, body.value.comment);
    const updated = await g.ctx.db.ratingCase.findUniqueOrThrow({
      where: { id },
      select: { id: true, status: true, runId: true, decidedBy: true, decidedAt: true, decisionComment: true },
    });
    return ok(updated);
  } catch (e) {
    if (e instanceof CaseError) return problem(e.status, e.message);
    if (isOutOfScope(e)) return problem(404, "Dossier introuvable.");
    throw e;
  }
}
