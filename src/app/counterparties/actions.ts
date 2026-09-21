"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auditWithin } from "@/lib/audit";
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
    // Création et audit dans une seule transaction : une contrepartie ne doit
    // pas pouvoir exister sans l'événement qui en trace l'auteur. Hors
    // transaction, un échec de l'audit laissait la contrepartie enregistrée
    // mais l'appelant en erreur — une reprise butait alors sur un conflit
    // d'ICE portant sur sa propre écriture.
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.counterparty.create({ data: parsed.data });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "COUNTERPARTY_CREATED",
        resourceType: "Counterparty",
        resourceId: row.id,
        detail: { name: row.name, ice: row.ice },
      });
      return row;
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
