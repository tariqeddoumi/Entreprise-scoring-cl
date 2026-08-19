import type { NextRequest } from "next/server";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { guard, readJsonBody } from "@/lib/route-guard";
import { counterpartySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;

/** Liste paginée (curseur stable par identifiant) avec filtre de recherche. */
export async function GET(req: NextRequest) {
  const g = guard(req, "READONLY");
  if (!g.ok) return g.response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 200) || undefined;
  const cursor = searchParams.get("cursor") ?? undefined;

  const rawLimit = Number(searchParams.get("limit") ?? 25);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_PAGE_SIZE) {
    return problem(400, `Paramètre « limit » invalide (entier de 1 à ${MAX_PAGE_SIZE}).`);
  }

  const items = await prisma.counterparty.findMany({
    // `contains` simple, sans mode : la sensibilité à la casse dépend de la
    // collation de la base, ce qui préserve la portabilité entre dialectes.
    where: q
      ? { OR: [{ name: { contains: q } }, { ice: { contains: q } }, { rc: { contains: q } }] }
      : undefined,
    orderBy: { id: "asc" },
    take: rawLimit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > rawLimit;
  const page = hasMore ? items.slice(0, rawLimit) : items;
  return ok({ items: page, nextCursor: hasMore ? page[page.length - 1].id : null });
}

/** Création d'une contrepartie. */
export async function POST(req: NextRequest) {
  const g = guard(req, "ANALYST");
  if (!g.ok) return g.response;

  const body = await readJsonBody(req, counterpartySchema);
  if (!body.ok) return body.response;

  try {
    const created = await prisma.counterparty.create({ data: body.value });
    await audit({
      actor: g.ctx.identity.name,
      actorRole: g.ctx.identity.role,
      action: "COUNTERPARTY_CREATED",
      resourceType: "Counterparty",
      resourceId: created.id,
      detail: { name: created.name, ice: created.ice },
      correlationId: g.ctx.correlationId,
    });
    return ok(created, 201);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return problem(409, "Conflit : cet ICE est déjà enregistré.");
    }
    throw e;
  }
}
