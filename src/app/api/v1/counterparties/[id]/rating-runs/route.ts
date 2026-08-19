import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

/** Historique des notations d'une contrepartie, plus récentes d'abord. */
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
    orderBy: { createdAt: "desc" },
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
  return ok({ items: runs });
}
