"use server";

import { revalidatePath } from "next/cache";
import { CoreBankingError, createFromT24, fetchT24Customer, syncFromT24 } from "@/lib/core-banking";
import { extractCreditReport, extractLegalProfile, fetchCreditReport, saveCreditReport, saveLegalProfile, wrapAiError, type ReportDraft } from "@/lib/external-data";
import { canWrite, isOutOfScope, loadTree } from "@/lib/scope";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";
import type { CoreBankingCustomer, FieldChange } from "@/reference/core-banking";
import type { LegalProfile } from "@/reference/legal-profile";

/**
 * Actions des sources externes de la fiche client : T24, rapport de
 * solvabilité du crédit bureau, fiche juridique InfoRisque. Identité tirée de
 * la session, périmètre d'écriture contrôlé dans chaque fonction appelée.
 */

export interface T24Result {
  ok: boolean;
  customer?: CoreBankingCustomer;
  /** Entité correspondant au centre d'affaires T24, si elle est connue. */
  entityName?: string | null;
  id?: string;
  changes?: FieldChange[];
  errorKind?: string;
  errorFr?: string;
}

function t24Failure(e: unknown): T24Result {
  if (e instanceof CoreBankingError) return { ok: false, errorKind: e.kind, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorKind: "PERIMETRE", errorFr: e instanceof Error ? e.message : "Hors de votre périmètre." };
  console.error("[t24]", e instanceof Error ? e.message : e);
  return { ok: false, errorKind: "INDISPONIBLE", errorFr: "T24 ou la base ne répond pas : saisissez les informations minimales." };
}

/** Aperçu de la fiche T24 avant création (rien n'est enregistré). */
export async function previewT24Action(code: string): Promise<T24Result> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const customer = await fetchT24Customer(await getDb(), code);
    const tree = await loadTree();
    const e = customer.businessCenterCode ? tree.find((x) => x.code.toUpperCase() === customer.businessCenterCode.toUpperCase()) : undefined;
    // Le centre de T24 n'est proposé que s'il est dans le périmètre d'écriture ; sinon l'utilisateur choisit.
    return { ok: true, customer, entityName: e && canWrite(await getPerimeter(), e.id) ? e.name : null };
  } catch (e) {
    return t24Failure(e);
  }
}

export async function createFromT24Action(code: string, entityId: string | null): Promise<T24Result> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const row = await createFromT24(await getDb(), await getPerimeter(), session.identity, { code, entityId });
    revalidatePath("/counterparties");
    revalidatePath("/scoring");
    return { ok: true, id: row.id };
  } catch (e) {
    return t24Failure(e);
  }
}

/** Rattachement d'une fiche saisie à T24, ou actualisation d'une fiche T24. */
export async function syncT24Action(counterpartyId: string, code?: string): Promise<T24Result> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const r = await syncFromT24(await getDb(), await getPerimeter(), session.identity, counterpartyId, code || undefined);
    revalidatePath(`/counterparties/${counterpartyId}`);
    revalidatePath("/counterparties");
    return { ok: true, changes: r.changes };
  } catch (e) {
    return t24Failure(e);
  }
}

// --- Rapport de solvabilité ----------------------------------------------------------

export interface ReportResult {
  ok: boolean;
  draft?: ReportDraft;
  errorFr?: string;
  okFr?: string;
}

export async function fetchCreditReportAction(counterpartyId: string): Promise<ReportResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    return { ok: true, draft: await fetchCreditReport(await getDb(), await getPerimeter(), counterpartyId) };
  } catch (e) {
    return { ok: false, errorFr: wrapAiError(e) };
  }
}

export async function extractCreditReportAction(counterpartyId: string, fd: FormData): Promise<ReportResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, errorFr: "Joignez le rapport (PDF ou image)." };
  try {
    const draft = await extractCreditReport(await getDb(), await getPerimeter(), counterpartyId, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { ok: true, draft, okFr: "Rapport lu par l'IA : vérifiez la date de mise à jour, chaque ligne et chaque incident avant d'enregistrer." };
  } catch (e) {
    return { ok: false, errorFr: wrapAiError(e) };
  }
}

export async function saveCreditReportAction(counterpartyId: string, draft: ReportDraft, caseId?: string | null): Promise<ReportResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await saveCreditReport(await getDb(), await getPerimeter(), session.identity, counterpartyId, draft, caseId);
    revalidatePath(`/counterparties/${counterpartyId}`);
    if (caseId) revalidatePath(`/cases/${caseId}`);
    return { ok: true, okFr: "Rapport de solvabilité enregistré." };
  } catch (e) {
    return { ok: false, errorFr: wrapAiError(e) };
  }
}

// --- Fiche juridique InfoRisque ----------------------------------------------------------

export interface ProfileResult {
  ok: boolean;
  profile?: LegalProfile;
  filled?: string[];
  errorFr?: string;
  okFr?: string;
}

export async function extractLegalProfileAction(counterpartyId: string, fd: FormData): Promise<ProfileResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, errorFr: "Joignez le rapport InfoRisque (PDF ou image)." };
  try {
    const profile = await extractLegalProfile(await getDb(), await getPerimeter(), counterpartyId, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return { ok: true, profile, okFr: "Rapport InfoRisque lu par l'IA : vérifiez avant d'enregistrer." };
  } catch (e) {
    return { ok: false, errorFr: wrapAiError(e) };
  }
}

export async function saveLegalProfileAction(counterpartyId: string, profile: LegalProfile): Promise<ProfileResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const r = await saveLegalProfile(await getDb(), await getPerimeter(), session.identity, counterpartyId, profile);
    revalidatePath(`/counterparties/${counterpartyId}`);
    return { ok: true, filled: r.filled, okFr: `Fiche juridique enregistrée${r.filled.length ? ` ; fiche client complétée (${r.filled.join(", ")})` : ""}.` };
  } catch (e) {
    return { ok: false, errorFr: wrapAiError(e) };
  }
}
