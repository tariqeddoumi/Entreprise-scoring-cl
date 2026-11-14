"use server";

import { revalidatePath } from "next/cache";
import { AiError } from "@/lib/ai";
import { extractCounterparty, type CounterpartyExtraction } from "@/lib/ai-assist";
import { CounterpartyError, createCounterparty, deleteCounterparty, updateCounterparty } from "@/lib/counterparties";
import { isOutOfScope } from "@/lib/scope";
import { checkMinimalEntry } from "@/reference/core-banking";
import { checkAgainstLists } from "@/reference/entry-lists";
import { loadEntryLists } from "@/lib/entry-lists";
import { counterpartyPatchSchema, counterpartySchema } from "@/lib/schemas";
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

  // Écran : saisie minimale exigée (le rapatriement T24 a son propre chemin).
  const missing = checkMinimalEntry(parsed.data);
  if (missing.length) return { ok: false, errorFr: `Saisie minimale incomplète : ${missing.join(" ")}` };
  // Valeurs figées : forme juridique, secteur et ville viennent des listes paramétrées.
  const offList = checkAgainstLists(parsed.data, await loadEntryLists(await getDb()));
  if (offList.length) return { ok: false, errorFr: offList.join(" ") };

  try {
    const created = await createCounterparty(
      await getDb(),
      await getPerimeter(),
      session.identity,
      parsed.data
    );
    revalidatePath("/counterparties");
    revalidatePath("/scoring");
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
 * Pré-remplissage de la fiche par l'OCR intelligent, depuis un extrait (RC, attestation ICE,
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


function issuesFr(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`).join(" ; ");
}

function failure(e: unknown): CreateCounterpartyResult {
  if (e instanceof CounterpartyError) return { ok: false, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorFr: e instanceof Error ? e.message : "Hors de votre périmètre d'écriture." };
  console.error("[client]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Échec de l'enregistrement (base indisponible)." };
}

/** Modification d'une fiche client (même chemin que `PATCH /api/v1/counterparties/{id}`). */
export async function updateCounterpartyAction(id: string, payload: unknown): Promise<CreateCounterpartyResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const parsed = counterpartyPatchSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, errorFr: issuesFr(parsed.error) };
  try {
    const db = await getDb();
    // Fiche en saisie : valeurs des listes (une valeur déjà enregistrée reste admise).
    const prev = await db.counterparty.findUnique({ where: { id }, select: { legalForm: true, sectorCode: true, city: true, dataSource: true } });
    if (prev && prev.dataSource !== "T24") {
      const offList = checkAgainstLists(parsed.data, await loadEntryLists(db), prev);
      if (offList.length) return { ok: false, errorFr: offList.join(" ") };
    }
    await updateCounterparty(await getDb(), await getPerimeter(), session.identity, id, parsed.data);
    revalidatePath("/counterparties");
    revalidatePath(`/counterparties/${id}`);
    revalidatePath("/scoring");
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}

export interface DeleteCounterpartyResult {
  ok: boolean;
  mode?: "DELETED" | "DEACTIVATED";
  messageFr?: string;
  errorFr?: string;
}

/**
 * Suppression d'un client (gestionnaire des risques) : définitive sans
 * historique, désactivation sinon (`DELETE /api/v1/counterparties/{id}`).
 */
export async function deleteCounterpartyAction(id: string): Promise<DeleteCounterpartyResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const outcome = await deleteCounterparty(await getDb(), await getPerimeter(), session.identity, id);
    revalidatePath("/counterparties");
    revalidatePath("/scoring");
    return { ok: true, ...outcome };
  } catch (e) {
    const f = failure(e);
    return { ok: false, errorFr: f.errorFr };
  }
}

/** Réactivation d'un client désactivé (gestionnaire des risques). */
export async function reactivateCounterpartyAction(id: string): Promise<CreateCounterpartyResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await updateCounterparty(await getDb(), await getPerimeter(), session.identity, id, { isActive: true });
    revalidatePath("/counterparties");
    revalidatePath(`/counterparties/${id}`);
    revalidatePath("/scoring");
    return { ok: true, id };
  } catch (e) {
    return failure(e);
  }
}
