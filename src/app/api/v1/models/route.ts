import type { NextRequest } from "next/server";
import { ok } from "@/lib/api-utils";
import { guard } from "@/lib/route-guard";
import { listModels } from "@/models";

export const dynamic = "force-dynamic";

/** Liste des versions de modèle publiées (résumé). */
export async function GET(req: NextRequest) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

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
