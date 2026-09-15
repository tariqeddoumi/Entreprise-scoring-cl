"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { counterpartySchema } from "@/lib/schemas";
import { getSessionIdentity } from "@/lib/session";

export interface CreateCounterpartyResult {
  ok: boolean;
  id?: string;
  errorFr?: string;
}

/**
 * Action serveur de création d'une contrepartie depuis l'interface web.
 *
 * Réplique côté navigateur la seule voie qui existait jusqu'ici (l'API REST
 * `POST /api/v1/counterparties`) : mêmes règles de validation, même rôle
 * minimal, même journal d'audit. L'identité provient de la session
 * authentifiée (cookie HttpOnly), jamais d'un champ de formulaire.
 */
export async function createCounterpartyAction(
  payload: unknown
): Promise<CreateCounterpartyResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) {
    return { ok: false, errorFr: session.reasonFr };
  }

  const parsed = counterpartySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      errorFr: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`)
        .join(" ; "),
    };
  }

  try {
    const created = await prisma.counterparty.create({ data: parsed.data });
    await audit({
      actor: session.identity.name,
      actorRole: session.identity.role,
      action: "COUNTERPARTY_CREATED",
      resourceType: "Counterparty",
      resourceId: created.id,
      detail: { name: created.name, ice: created.ice },
    });
    revalidatePath("/counterparties");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, errorFr: "Conflit : cet ICE est déjà enregistré." };
    }
    return {
      ok: false,
      errorFr: e instanceof Error ? e.message : "Échec de l'enregistrement (base indisponible).",
    };
  }
}
