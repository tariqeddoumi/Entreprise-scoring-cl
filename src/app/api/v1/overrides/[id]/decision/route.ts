import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { overrideDecisionSchema } from "@/lib/schemas";
import { publishEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/overrides/{id}/decision — approbation ou rejet (valideur).
 *
 * Séparation des tâches stricte : l'auto-approbation est refusée. La décision
 * est prise dans une transaction avec relecture du statut, afin que deux
 * décisions concurrentes ne puissent pas s'appliquer toutes les deux.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const { id } = await params;
  const body = await readJsonBody(req, overrideDecisionSchema);
  if (!body.ok) return body.response;
  const { decision, comment } = body.value;

  const override = await prisma.override.findUnique({ where: { id } });
  if (!override) return problem(404, "Dérogation inconnue.");
  if (override.status !== "PENDING") {
    return problem(409, `Dérogation déjà décidée (${override.status}).`);
  }
  if (override.requestedBy === g.ctx.identity.name) {
    return problem(
      403,
      "Auto-approbation interdite",
      "Le valideur doit être distinct du demandeur (principe des quatre yeux)."
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Relecture conditionnelle : si une autre décision a été enregistrée
      // entre-temps, updateMany n'affecte aucune ligne et la transaction est
      // annulée. Aucun verrou explicite n'est nécessaire.
      const claimed = await tx.override.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: decision,
          decidedBy: g.ctx.identity.name,
          decisionComment: comment,
          decidedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        throw new ConcurrentDecisionError();
      }

      if (decision === "APPROVED") {
        await tx.ratingRun.update({
          where: { id: override.ratingRunId },
          data: { finalGrade: override.toGrade },
        });
      }

      await auditWithin(tx, {
        actor: g.ctx.identity.name,
        actorRole: g.ctx.identity.role,
        action: decision === "APPROVED" ? "OVERRIDE_APPROVED" : "OVERRIDE_REJECTED",
        resourceType: "Override",
        resourceId: id,
        detail: {
          ratingRunId: override.ratingRunId,
          fromGrade: override.fromGrade,
          toGrade: override.toGrade,
          requestedBy: override.requestedBy,
        },
        correlationId: g.ctx.correlationId,
      });

      return tx.override.findUniqueOrThrow({ where: { id } });
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
  } catch (e) {
    if (e instanceof ConcurrentDecisionError) {
      return problem(409, "Dérogation déjà décidée par un autre valideur.");
    }
    throw e;
  }
}

class ConcurrentDecisionError extends Error {}
