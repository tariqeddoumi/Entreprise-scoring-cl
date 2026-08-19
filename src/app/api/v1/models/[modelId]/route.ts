import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { guard } from "@/lib/route-guard";
import { getModel } from "@/models";

export const dynamic = "force-dynamic";

/** Configuration complète d'une version de modèle (lecture seule). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) return problem(404, `Modèle inconnu : ${modelId}`);
  return ok(model);
}
