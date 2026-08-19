import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { counterpartySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Liste paginée (curseur stable par id) avec filtre de recherche. */
export async function GET(req: NextRequest) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 25), 100);

  const items = await prisma.counterparty.findMany({
    // `contains` simple (sans mode) pour rester portable entre dialectes ;
    // la sensibilité à la casse dépend de la collation de la base.
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { ice: { contains: q } },
            { rc: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return ok({
    items: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

/** Création d'une contrepartie. */
export async function POST(req: NextRequest) {
  const auth = authenticate(req, "ANALYST");
  if (!auth.ok) return problem(auth.status, auth.message);

  const body = await req.json().catch(() => null);
  const parsed = counterpartySchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "Payload invalide", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }

  try {
    const created = await prisma.counterparty.create({ data: parsed.data });
    await audit({
      actor: auth.identity.name,
      actorRole: auth.identity.role,
      action: "COUNTERPARTY_CREATED",
      resourceType: "Counterparty",
      resourceId: created.id,
      detail: { name: created.name, ice: created.ice },
    });
    return ok(created, 201);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return problem(409, "Conflit : ICE déjà enregistré.");
    }
    throw e;
  }
}
