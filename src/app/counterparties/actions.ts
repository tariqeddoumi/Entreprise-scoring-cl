"use server";

import { revalidatePath } from "next/cache";
import { CounterpartyError, createCounterparty } from "@/lib/counterparties";
import { isOutOfScope } from "@/lib/scope";
import { counterpartySchema } from "@/lib/schemas";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";

export interface CreateCounterpartyResult {
  ok: boolean;
  id?: string;
  errorFr?: string;
}

/**
 * Action serveur de création d'une contrepartie depuis l'interface web.
 *
 * Même chemin que l'API REST `POST /api/v1/counterparties`
 * (src/lib/counterparties.ts) : mêmes règles de validation, même rôle minimal,
 * même périmètre d'écriture, même journal d'audit. L'identité provient de la session
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
    const created = await createCounterparty(
      await getDb(),
      await getPerimeter(),
      session.identity,
      parsed.data
    );
    revalidatePath("/counterparties");
    return { ok: true, id: created.id };
  } catch (e) {
    if (e instanceof CounterpartyError) return { ok: false, errorFr: e.message };
    if (isOutOfScope(e)) return { ok: false, errorFr: "Entité hors de votre périmètre d'écriture." };
    return {
      ok: false,
      errorFr: e instanceof Error ? e.message : "Échec de l'enregistrement (base indisponible).",
    };
  }
}
