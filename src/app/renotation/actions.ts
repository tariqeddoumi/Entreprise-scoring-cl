"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelBatch,
  createBatch,
  createSchedule,
  parseRefreshCsv,
  processBatch,
  RenotationError,
  renotationFiltersSchema,
  selectCounterparties,
  setScheduleActive,
  type RenotationFilters,
} from "@/lib/renotation";
import { isOutOfScope } from "@/lib/scope";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";

/**
 * Actions serveur de la renotation par lot.
 *
 * Lancer, poursuivre, annuler ou planifier un lot relève du gestionnaire des
 * risques (RISK_MANAGER), comme POST /api/v1/renotation-batches. Le lot
 * s'exécute dans le périmètre d'écriture de la personne qui le lance.
 */

export interface RenotationActionResult {
  ok: boolean;
  errorFr?: string;
  okFr?: string;
  count?: number;
  warningsFr?: string[];
}

function failure(e: unknown): RenotationActionResult {
  if (e instanceof RenotationError) return { ok: false, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorFr: "Sélection hors de votre périmètre d'écriture." };
  console.error("[renotation]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Opération impossible (base indisponible ?)." };
}

/** Lecture des filtres d'un formulaire : un champ vide ne filtre pas. */
function readFilters(fd: FormData): RenotationFilters {
  const text = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v === "" ? undefined : v;
  };
  const months = text("validatedBeforeMonths");
  return renotationFiltersSchema.parse({
    ...(text("entityId") ? { entityId: text("entityId") } : {}),
    ...(text("economicGroupId") ? { economicGroupId: text("economicGroupId") } : {}),
    ...(text("segment") ? { segment: text("segment") } : {}),
    ...(text("sectorPrefix") ? { sectorPrefix: text("sectorPrefix") } : {}),
    ...(months ? { validatedBeforeMonths: Number(months) } : {}),
  });
}

function readOptions(fd: FormData) {
  return {
    notchThreshold: Math.max(1, Math.min(10, Number(fd.get("notchThreshold") ?? 1) || 1)),
    openCases: fd.get("openCases") === "on",
  };
}

export async function previewSelectionAction(fd: FormData): Promise<RenotationActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const ids = await selectCounterparties(await getDb(), await getPerimeter(), readFilters(fd));
    return { ok: true, count: ids.length, okFr: `${ids.length} contrepartie(s) sélectionnée(s).` };
  } catch (e) {
    return failure(e);
  }
}

export async function createBatchAction(_prev: RenotationActionResult, fd: FormData): Promise<RenotationActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  let id: string;
  try {
    const file = fd.get("refresh");
    let refresh;
    let warningsFr: string[] = [];
    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) return { ok: false, errorFr: "Fichier de mise à jour trop volumineux (10 Mo au plus)." };
      const parsed = parseRefreshCsv(await file.text());
      if (parsed.rows.length === 0) return { ok: false, errorFr: parsed.errors.join(" ") || "Fichier de mise à jour sans ligne exploitable." };
      refresh = parsed.rows;
      warningsFr = parsed.errors;
      if (warningsFr.length) console.warn("[renotation] fichier de mise à jour :", warningsFr.slice(0, 5).join(" | "));
    }
    const { batch } = await createBatch(await getDb(), await getPerimeter(), session.identity, {
      name: String(fd.get("name") ?? ""),
      asOfDate: String(fd.get("asOfDate") ?? ""),
      filters: readFilters(fd),
      options: readOptions(fd),
      refresh,
    });
    id = batch.id;
  } catch (e) {
    if (e && typeof e === "object" && "issues" in e) return { ok: false, errorFr: "Sélection invalide." };
    return failure(e);
  }
  revalidatePath("/renotation");
  redirect(`/renotation/${id}`);
}

export async function processBatchAction(batchId: string): Promise<RenotationActionResult & { status?: string; processed?: number; total?: number }> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const r = await processBatch(await getDb(), batchId, 20_000);
    if (r.status === "DONE") revalidatePath(`/renotation/${batchId}`);
    return { ok: true, ...r };
  } catch (e) {
    return failure(e);
  }
}

export async function cancelBatchAction(_prev: RenotationActionResult, fd: FormData): Promise<RenotationActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const batchId = String(fd.get("batchId") ?? "");
  try {
    await cancelBatch(await getDb(), session.identity, batchId);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/renotation/${batchId}`);
  revalidatePath("/renotation");
  return { ok: true, okFr: "Lot annulé : les contreparties déjà renotées le restent." };
}

export async function createScheduleAction(_prev: RenotationActionResult, fd: FormData): Promise<RenotationActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await createSchedule(await getDb(), await getPerimeter(), session.identity, {
      name: String(fd.get("name") ?? ""),
      intervalMonths: Number(fd.get("intervalMonths") ?? 1),
      dayOfMonth: Number(fd.get("dayOfMonth") ?? 5),
      filters: readFilters(fd),
      options: readOptions(fd),
    });
  } catch (e) {
    if (e && typeof e === "object" && "issues" in e) return { ok: false, errorFr: "Sélection invalide." };
    return failure(e);
  }
  revalidatePath("/renotation");
  return { ok: true, okFr: "Planification enregistrée." };
}

export async function toggleScheduleAction(_prev: RenotationActionResult, fd: FormData): Promise<RenotationActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const active = fd.get("active") === "true";
  try {
    await setScheduleActive(await getDb(), session.identity, String(fd.get("scheduleId") ?? ""), active);
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/renotation");
  return { ok: true, okFr: active ? "Planification réactivée." : "Planification suspendue." };
}
