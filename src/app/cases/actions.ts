"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RatingResult } from "@/core/types";
import { AiError } from "@/lib/ai";
import { addDocument, decideProposal, generateProposals } from "@/lib/ai-assist";
import type { CaseDraft } from "@/lib/case-input";
import { cancelCase, CaseError, createCase, decideCase, previewCase, reopenCase, saveDraft, submitCase } from "@/lib/cases";
import type { FxConversion } from "@/lib/fx";
import { decideOverride, OverrideError, requestOverride } from "@/lib/overrides";
import { overrideDecisionSchema, overrideRequestSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";
import { getDb, getSessionIdentity } from "@/lib/session";

/**
 * Actions serveur du workflow des dossiers de notation.
 *
 * Chaque action vérifie la session et le rôle AVANT tout traitement (une
 * action serveur est un point d'entrée public), puis délègue à src/lib/cases.ts,
 * le même chemin que l'API : client cloisonné au périmètre, séparation des
 * fonctions, journal d'audit dans la transaction.
 */

export interface ActionResult {
  ok: boolean;
  errorFr?: string;
  okFr?: string;
}

function failure(e: unknown): ActionResult {
  if (e instanceof CaseError || e instanceof OverrideError || e instanceof AiError) {
    const detail = e instanceof OverrideError && e.detail ? ` ${e.detail}` : "";
    return { ok: false, errorFr: `${e.message}${detail}` };
  }
  if (isOutOfScope(e)) return { ok: false, errorFr: "Dossier hors de votre périmètre." };
  console.error("[dossier]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Opération impossible (base indisponible ?)." };
}

export async function createCaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  let id: string;
  try {
    const created = await createCase(await getDb(), session.identity, {
      counterpartyId: String(fd.get("counterpartyId") ?? ""),
      modelId: String(fd.get("modelId") ?? ""),
      asOfDate: String(fd.get("asOfDate") ?? ""),
    });
    id = created.id;
  } catch (e) {
    return failure(e);
  }
  redirect(`/cases/${id}`);
}

export async function saveDraftAction(caseId: string, draft: CaseDraft): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await saveDraft(await getDb(), session.identity, caseId, draft);
    return { ok: true, okFr: "Brouillon enregistré." };
  } catch (e) {
    return failure(e);
  }
}

export async function previewCaseAction(
  caseId: string,
  draft: CaseDraft
): Promise<ActionResult & { result?: RatingResult; fx?: FxConversion | null }> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const { result, fx } = await previewCase(await getDb(), caseId, draft);
    return { ok: true, result, fx };
  } catch (e) {
    return failure(e);
  }
}

export async function submitCaseAction(caseId: string, draft: CaseDraft): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await submitCase(await getDb(), session.identity, caseId, draft);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { ok: true, okFr: "Dossier soumis à validation." };
}

export async function decideCaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const caseId = String(fd.get("caseId") ?? "");
  const decision = fd.get("decision") === "VALIDATED" ? "VALIDATED" : "REJECTED";
  try {
    await decideCase(await getDb(), session.identity, caseId, decision, String(fd.get("comment") ?? "") || undefined);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  revalidatePath("/");
  return { ok: true, okFr: decision === "VALIDATED" ? "Notation validée : elle devient la note de la contrepartie." : "Dossier rejeté." };
}

export async function reopenCaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  let id: string;
  try {
    id = (await reopenCase(await getDb(), session.identity, String(fd.get("caseId") ?? ""))).id;
  } catch (e) {
    return failure(e);
  }
  redirect(`/cases/${id}`);
}

export async function cancelCaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const caseId = String(fd.get("caseId") ?? "");
  try {
    await cancelCase(await getDb(), session.identity, caseId);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { ok: true, okFr: "Dossier abandonné." };
}

// --- Pièces et IA ------------------------------------------------------------------

export async function uploadDocumentAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const caseId = String(fd.get("caseId") ?? "");
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, errorFr: "Choisissez au moins un fichier." };
  try {
    const db = await getDb();
    for (const f of files) {
      await addDocument(db, session.identity, caseId, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, okFr: files.length > 1 ? `${files.length} pièces ajoutées.` : "Pièce ajoutée." };
}

export async function generateProposalsAction(
  caseId: string,
  documentIds: string[],
  notes: string
): Promise<ActionResult & { summary?: string }> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const g = await generateProposals(await getDb(), session.identity, caseId, { documentIds, notes });
    revalidatePath(`/cases/${caseId}`);
    return {
      ok: true,
      summary: g.summary,
      okFr: `${g.created} proposition(s) à examiner${g.discarded ? ` ; ${g.discarded} écartée(s) car hors grille ou invalides` : ""}.`,
    };
  } catch (e) {
    return failure(e);
  }
}

export async function decideProposalAction(
  proposalId: string,
  accept: boolean
): Promise<ActionResult & { field?: string; value?: string }> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const { field, value } = await decideProposal(await getDb(), session.identity, proposalId, accept);
    return { ok: true, field, value };
  } catch (e) {
    return failure(e);
  }
}

// --- Dérogations -------------------------------------------------------------------

export async function requestOverrideAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const parsed = overrideRequestSchema.safeParse({
    ratingRunId: String(fd.get("ratingRunId") ?? ""),
    toGrade: String(fd.get("toGrade") ?? ""),
    reasonCode: String(fd.get("reasonCode") ?? ""),
    comment: String(fd.get("comment") ?? ""),
    ...(fd.get("evidence") ? { evidence: String(fd.get("evidence")) } : {}),
  });
  if (!parsed.success) {
    return { ok: false, errorFr: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ") };
  }
  try {
    await requestOverride(await getDb(), session.identity, parsed.data);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/rating-runs/${parsed.data.ratingRunId}`);
  return { ok: true, okFr: "Dérogation demandée : elle attend la décision d'une seconde personne." };
}

export async function decideOverrideAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await getSessionIdentity("RISK_MANAGER");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const parsed = overrideDecisionSchema.safeParse({
    decision: String(fd.get("decision") ?? ""),
    ...(fd.get("comment") ? { comment: String(fd.get("comment")) } : {}),
  });
  if (!parsed.success) return { ok: false, errorFr: "Décision invalide." };
  const runId = String(fd.get("ratingRunId") ?? "");
  try {
    await decideOverride(await getDb(), session.identity, String(fd.get("overrideId") ?? ""), parsed.data.decision, parsed.data.comment);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/rating-runs/${runId}`);
  return { ok: true, okFr: parsed.data.decision === "APPROVED" ? "Dérogation approuvée." : "Dérogation rejetée." };
}
