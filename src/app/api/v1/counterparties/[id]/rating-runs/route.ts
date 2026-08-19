import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Historique des notations d'une contrepartie (résumés, plus récents d'abord). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { id } = await params;
  const counterparty = await prisma.counterparty.findUnique({ where: { id } });
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
