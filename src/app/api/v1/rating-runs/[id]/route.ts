import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Détail complet d'un run : snapshots d'entrée et de résultat inclus. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

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
