import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { runScheduler } from "@/lib/renotation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/v1/renotation/cron — tâche planifiée de la renotation.
 *
 * Crée les lots des planifications échues et poursuit les lots en cours, dans
 * le périmètre de la personne qui les a créés. Authentifiée par le secret
 * CRON_SECRET (en-tête « Authorization: Bearer … », envoyé par Vercel Cron) :
 * sans secret configuré, la route est fermée.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return problem(503, "Tâche planifiée non configurée (CRON_SECRET).");
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return problem(401, "Non authentifié.");
  const r = await runScheduler(new Date(), 250_000);
  return ok(r);
}
