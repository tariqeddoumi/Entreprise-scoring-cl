import type { NextRequest } from "next/server";
import { gradeRank } from "@/core/grades";
import { ok, problem } from "@/lib/api-utils";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { overrideRequestSchema } from "@/lib/schemas";
import { getModel } from "@/models";

export const dynamic = "force-dynamic";

/** Ampleur maximale d'une dérogation ordinaire, en crans. */
const MAX_NOTCHES = 2;

/**
 * POST /api/v1/overrides — proposition de dérogation (demandeur).
 *
 * Le résultat moteur n'est jamais écrasé : la dérogation est un objet
 * distinct, appliqué au grade final seulement après approbation par un
 * second acteur.
 */
export async function POST(req: NextRequest) {
  const g = guard(req, "RISK_MANAGER");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, overrideRequestSchema);
  if (!body.ok) return body.response;
  const { ratingRunId, toGrade, reasonCode, comment, evidence, expiresAt } = body.value;

  const run = await prisma.ratingRun.findUnique({ where: { id: ratingRunId } });
  if (!run) return problem(404, "Run de notation inconnu.");
  if (!run.cappedGrade) {
    return problem(409, "Ce run n'a pas de grade : une dérogation est impossible.");
  }
  if (run.cappedGrade.startsWith("DEF")) {
    return problem(
      409,
      "Amélioration d'un grade défaut interdite",
      "Un retour en encours sain relève du processus formel de guérison, hors dérogation ordinaire."
    );
  }

  // Une dérogation déjà en attente sur le même run doit être tranchée avant
  // d'en proposer une autre : deux dérogations concurrentes produiraient un
  // grade final dépendant de l'ordre d'approbation.
  const pending = await prisma.override.findFirst({
    where: { ratingRunId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    return problem(
      409,
      "Une dérogation est déjà en attente de décision sur ce run.",
      `Dérogation ${pending.id}.`
    );
  }

  const model = getModel(run.modelId);
  if (!model) {
    return problem(500, "Version de modèle du run indisponible.");
  }
  let notches: number;
  try {
    notches = Math.abs(
      gradeRank(model.masterScale, toGrade) - gradeRank(model.masterScale, run.cappedGrade)
    );
  } catch {
    return problem(400, `Grade cible inconnu : ${toGrade}`);
  }
  if (notches === 0) return problem(400, "Le grade cible est identique au grade actuel.");
  if (notches > MAX_NOTCHES) {
    return problem(
      422,
      `Dérogation ordinaire limitée à ±${MAX_NOTCHES} crans (demandé : ${notches}).`,
      "Passer par le comité."
    );
  }

  const override = await prisma.$transaction(async (tx) => {
    const created = await tx.override.create({
      data: {
        ratingRunId,
        fromGrade: run.cappedGrade!,
        toGrade,
        reasonCode,
        comment,
        evidence,
        requestedBy: g.ctx.identity.name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    await auditWithin(tx, {
      actor: g.ctx.identity.name,
      actorRole: g.ctx.identity.role,
      action: "OVERRIDE_REQUESTED",
      resourceType: "Override",
      resourceId: created.id,
      detail: { ratingRunId, fromGrade: run.cappedGrade, toGrade, reasonCode, notches },
      correlationId: g.ctx.correlationId,
    });
    return created;
  });

  return ok(override, 201);
}
