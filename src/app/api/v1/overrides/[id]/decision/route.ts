import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { overrideDecisionSchema } from "@/lib/schemas";
import { publishEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/overrides/{id}/decision — approbation/rejet (checker).
 * Maker-checker strict : l'auto-approbation est refusée. L'approbation
 * applique le grade final sur le run en conservant engine/capped grades.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "RISK_MANAGER");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = overrideDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "Payload invalide", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }

  const override = await prisma.override.findUnique({
    where: { id },
    include: { ratingRun: true },
  });
  if (!override) return problem(404, "Override inconnu.");
  if (override.status !== "PENDING") {
    return problem(409, `Override déjà décidé (${override.status}).`);
  }
  if (override.requestedBy === auth.identity.name) {
    return problem(403, "Auto-approbation interdite : le valideur doit différer du demandeur (maker-checker).");
  }

  const { decision, comment } = parsed.data;
  const updated = await prisma.$transaction(async (tx) => {
    const dec = await tx.override.update({
      where: { id },
      data: {
        status: decision,
        decidedBy: auth.identity.name,
        decisionComment: comment,
        decidedAt: new Date(),
      },
    });
    if (decision === "APPROVED") {
      await tx.ratingRun.update({
        where: { id: override.ratingRunId },
        data: { finalGrade: override.toGrade },
      });
    }
    await auditWithin(tx, {
      actor: auth.identity.name,
      actorRole: auth.identity.role,
      action: decision === "APPROVED" ? "OVERRIDE_APPROVED" : "OVERRIDE_REJECTED",
      resourceType: "Override",
      resourceId: id,
      detail: {
        ratingRunId: override.ratingRunId,
        fromGrade: override.fromGrade,
        toGrade: override.toGrade,
        requestedBy: override.requestedBy,
      },
    });
    return dec;
  });

  if (decision === "APPROVED") {
    void publishEvent({
      type: "rating.overridden",
      data: {
        runId: override.ratingRunId,
        overrideId: id,
        fromGrade: override.fromGrade,
        toGrade: override.toGrade,
        reasonCode: override.reasonCode,
      },
    }).catch(() => undefined);
  }

  return ok(updated);
}
