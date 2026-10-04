import type { NextRequest } from "next/server";
import { ok, problem, runScoresAsNumbers } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

/** Historique des notations d'une contrepartie, arrêté le plus récent d'abord. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { id } = await params;
  const counterparty = await prisma.counterparty.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!counterparty) return problem(404, "Contrepartie inconnue.");

  const runs = await prisma.ratingRun.findMany({
    where: { counterpartyId: id },
    // Même ordre que la fiche contrepartie et la liste : la date d'arrêté
    // d'abord, puis la date de calcul. Trié par date de calcul seule, l'API
    // désignait comme « dernière » une renotation d'un arrêté ancien, quand
    // l'écran retenait l'arrêté le plus récent (D-43).
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      modelId: true,
      modelVersion: true,
      asOfDate: true,
      segment: true,
      outcome: true,
      rawScore: true,
      confidenceScore: true,
      engineGrade: true,
      cappedGrade: true,
      finalGrade: true,
      requestedBy: true,
      createdAt: true,
    },
  });
  return ok({ items: runs.map(runScoresAsNumbers) });
}
