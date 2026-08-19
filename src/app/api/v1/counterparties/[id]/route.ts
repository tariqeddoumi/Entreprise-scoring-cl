import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { ok, problem } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { counterpartyPatchSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "READONLY");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { id } = await params;
  const counterparty = await prisma.counterparty.findUnique({ where: { id } });
  if (!counterparty) return problem(404, "Contrepartie inconnue.");
  return ok(counterparty);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = authenticate(req, "ANALYST");
  if (!auth.ok) return problem(auth.status, auth.message);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = counterpartyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, "Payload invalide", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ; "));
  }

  const existing = await prisma.counterparty.findUnique({ where: { id } });
  if (!existing) return problem(404, "Contrepartie inconnue.");

  const updated = await prisma.counterparty.update({ where: { id }, data: parsed.data });
  await audit({
    actor: auth.identity.name,
    actorRole: auth.identity.role,
    action: "COUNTERPARTY_UPDATED",
    resourceType: "Counterparty",
    resourceId: id,
    detail: { before: existing, after: updated },
  });
  return ok(updated);
}
