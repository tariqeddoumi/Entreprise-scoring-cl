import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guard } from "@/lib/route-guard";

export const dynamic = "force-dynamic";

/** Détail complet d'un run : instantanés d'entrée et de résultat inclus. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { id } = await params;
  const run = await prisma.ratingRun.findUnique({
    where: { id },
    include: {
      counterparty: { select: { id: true, name: true, ice: true, segment: true } },
      overrides: true,
    },
  });
  if (!run) return problem(404, "Run de notation inconnu.");

  return ok({
    ...run,
    inputSnapshot: JSON.parse(run.inputSnapshot),
    resultSnapshot: JSON.parse(run.resultSnapshot),
  });
}
