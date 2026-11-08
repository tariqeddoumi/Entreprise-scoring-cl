"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RatingResult } from "@/core/types";
import { AiError } from "@/lib/ai";
import {
  addDocument,
  decideProposal,
  extractFinancials,
  generateProposals,
  importFinancialsTemplate,
  type ExtractedFinancials, setDocumentKind } from "@/lib/ai-assist";
import type { CaseDraft } from "@/lib/case-input";
import { cancelCase, CaseError, createCase, decideCase, previewCase, reopenCase, saveDraft, submitCase } from "@/lib/cases";
import type { FxConversion } from "@/lib/fx";
import { decideOverride, OverrideError, requestOverride } from "@/lib/overrides";
import { overrideDecisionSchema, overrideRequestSchema } from "@/lib/schemas";
import { isOutOfScope } from "@/lib/scope";
import { refreshAtOpening } from "@/lib/opening-refresh";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";

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
    const db = await getDb();
    const counterpartyId = String(fd.get("counterpartyId") ?? "");
    // Actualisation T24 avant la création : le dossier reprend l'engagement
    // global du jour. Une panne ne bloque pas l'ouverture.
    const openingRefresh = await refreshAtOpening(db, await getPerimeter(), session.identity, counterpartyId).catch((e) => {
      console.error("[ouverture] actualisation T24", e instanceof Error ? e.message : e);
      return null;
    });
    const created = await createCase(db, session.identity, {
      openingRefresh,
      counterpartyId,
      modelId: String(fd.get("modelId") ?? ""),
      asOfDate: String(fd.get("asOfDate") ?? ""),
      purpose: String(fd.get("purpose") ?? "") || undefined,
      creditType: String(fd.get("creditType") ?? "") || undefined,
      exercise: fd.get("exercise") === "SUIVANT" ? "SUIVANT" : fd.get("exercise") === "CONSERVE" ? "CONSERVE" : undefined,
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
  let outcome: Awaited<ReturnType<typeof decideCase>>;
  try {
    outcome = await decideCase(await getDb(), session.identity, caseId, decision, String(fd.get("comment") ?? "") || undefined);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  revalidatePath("/");
  const okFr =
    outcome.status === "VALIDATED"
      ? "Validation finale : la notation devient la note du client."
      : outcome.status === "REJECTED"
        ? "Dossier rejeté."
        : outcome.opinion
          ? `Avis ${outcome.opinion === "FAVORABLE" ? "favorable" : "défavorable"} enregistré (« ${outcome.stepFr} »).${outcome.nextStepFr ? ` En attente : ${outcome.nextStepFr}.` : ""}`
          : `Étape « ${outcome.stepFr} » validée. Étape suivante : ${outcome.nextStepFr}.`;
  return { ok: true, okFr };
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
  const kind = String(fd.get("kind") ?? "") || null;
  if (files.length === 0) return { ok: false, errorFr: "Choisissez au moins un fichier." };
  try {
    const db = await getDb();
    for (const f of files) {
      await addDocument(db, session.identity, caseId, { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()), kind });
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, okFr: files.length > 1 ? `${files.length} pièces ajoutées.` : "Pièce ajoutée." };
}

/** Type d'une pièce du dossier (pièces requises par motif). */
export async function setDocumentKindAction(caseId: string, documentId: string, kind: string): Promise<ActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await setDocumentKind(await getDb(), session.identity, documentId, kind || null);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/cases/${caseId}`);
  return { ok: true, okFr: "Type de la pièce enregistré." };
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

// --- Bilan ------------------------------------------------------------------------

/** Lecture du bilan par l'IA : remplit le tableau à l'écran, rien n'est enregistré. */
export async function extractFinancialsAction(
  caseId: string,
  documentIds: string[]
): Promise<ActionResult & { financials?: ExtractedFinancials }> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const financials = await extractFinancials(await getDb(), session.identity, caseId, { documentIds });
    return {
      ok: true,
      financials,
      okFr: `${financials.recognized} montant(s) lus${financials.discarded ? `, ${financials.discarded} écarté(s)` : ""}. Relisez le tableau, en priorité les valeurs signalées, puis enregistrez.`,
    };
  } catch (e) {
    return failure(e);
  }
}

/** Import du gabarit Excel : la pièce est conservée au dossier, le tableau est rempli à l'écran. */
export async function importFinancialsAction(fd: FormData): Promise<ActionResult & { financials?: ExtractedFinancials }> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const caseId = String(fd.get("caseId") ?? "");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errorFr: "Choisissez le gabarit Excel rempli." };
  try {
    const financials = await importFinancialsTemplate(await getDb(), session.identity, caseId, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true, financials, okFr: `${financials.recognized} montant(s) importés depuis le gabarit. Vérifiez puis enregistrez.` };
  } catch (e) {
    return failure(e);
  }
}

// --- Dérogations -------------------------------------------------------------------

export async function requestOverrideAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  // Même rôle que POST /overrides : la demande relève du gestionnaire des
  // risques, la décision d'une seconde personne (D-43 : mêmes droits partout).
  const session = await getSessionIdentity("RISK_MANAGER");
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
