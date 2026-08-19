import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { overrideRequestSchema } from "@/lib/schemas";
import { getModel } from "@/models";
import { gradeRank } from "@/core/grades";

export const dynamic = "force-dynamic";

const MAX_NOTCHES = 2; // override ordinaire limité à ±2 crans (grilles §19.1)

/**
 * POST /api/v1/overrides — proposition d'override (maker).
 * Le résultat moteur n'est jamais écrasé : l'override est un objet distinct,
 * appliqué au grade final uniquement après approbation par un second acteur.
 */
export async function POST(req: NextRequest) {
  const auth = authenticate(req, "RISK_MANAGER");
  if (!auth.ok) return problem(auth.status, auth.message);

  const body = await req.json().catch(() => null);
  const parsed = overrideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "Payload invalide", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }
  const { ratingRunId, toGrade, reasonCode, comment, evidence, expiresAt } = parsed.data;

  const run = await prisma.ratingRun.findUnique({ where: { id: ratingRunId } });
  if (!run) return problem(404, "Run de notation inconnu.");
  if (!run.cappedGrade) {
    return problem(409, "Ce run n'a pas de grade : un override est impossible.");
  }
  if (run.cappedGrade.startsWith("DEF")) {
    return problem(
      409,
      "Amélioration d'un grade défaut interdite sans processus formel de cure (hors périmètre de l'override ordinaire)."
    );
  }

  const model = getModel(run.modelId);
  if (!model) return problem(500, "Version de modèle du run indisponible.");
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
      `Override ordinaire limité à ±${MAX_NOTCHES} crans (demandé : ${notches}). Passer par le comité.`
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
        requestedBy: auth.identity.name,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    await auditWithin(tx, {
      actor: auth.identity.name,
      actorRole: auth.identity.role,
      action: "OVERRIDE_REQUESTED",
      resourceType: "Override",
      resourceId: created.id,
      detail: { ratingRunId, fromGrade: run.cappedGrade, toGrade, reasonCode },
    });
    return created;
  });

  return ok(override, 201);
}
