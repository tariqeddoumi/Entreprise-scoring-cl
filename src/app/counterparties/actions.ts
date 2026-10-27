"use server";

import { revalidatePath } from "next/cache";
import { AiError } from "@/lib/ai";
import { extractCounterparty, type CounterpartyExtraction } from "@/lib/ai-assist";
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

export interface ExtractionResult {
  ok: boolean;
  data?: CounterpartyExtraction;
  errorFr?: string;
  okFr?: string;
}

/**
 * Pré-remplissage de la fiche par l'IA, depuis un extrait (RC, attestation ICE,
 * statuts) ou un texte collé. Rien n'est enregistré : l'analyste relit et
 * enregistre lui-même.
 */
export async function extractCounterpartyAction(
  fd: FormData
): Promise<ExtractionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const file = fd.get("file");
  const text = String(fd.get("text") ?? "");
  try {
    if (file instanceof File && file.size > 15 * 1024 * 1024) {
      return { ok: false, errorFr: "Pièce trop volumineuse (15 Mo au plus)." };
    }
    const document =
      file instanceof File && file.size > 0
        ? { name: file.name, mimeType: file.type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") }
        : undefined;
    const data = await extractCounterparty({ text, document });
    return { ok: true, data, okFr: "Fiche pré-remplie : relisez chaque champ avant d'enregistrer." };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, errorFr: e.message };
    console.error("[ia]", e instanceof Error ? e.message : e);
    return { ok: false, errorFr: "Pré-remplissage impossible." };
  }
}

