import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { listModels } from "@/models";

export const dynamic = "force-dynamic";

/** Liste des versions de modèle publiées (résumé). */
export async function GET(req: NextRequest) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  return ok({
    items: listModels().map((m) => ({
      modelId: m.modelId,
      version: m.version,
      labelFr: m.labelFr,
      status: m.status,
      effectiveFrom: m.effectiveFrom,
      segments: m.segments,
      pdStatus: m.pdStatus,
      criteriaCount: m.criteria.length,
      domains: m.domains,
      disclaimerFr: m.disclaimerFr,
    })),
  });
}
