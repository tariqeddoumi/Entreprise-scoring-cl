import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { getModel } from "@/models";

export const dynamic = "force-dynamic";

/** Configuration complète d'une version de modèle (lecture seule). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) return problem(404, `Modèle inconnu : ${modelId}`);
  return ok(model);
}
