"use server";

import { revalidatePath } from "next/cache";
import { CaseError } from "@/lib/cases";
import { cancelDecision, confirmDecision, recordLift, recordWatchlist } from "@/lib/committee";
import { isOutOfScope } from "@/lib/scope";
import { getDb, getSessionIdentity } from "@/lib/session";

export interface CommitteeActionResult {
  ok: boolean;
  okFr?: string;
  errorFr?: string;
}

function failure(e: unknown): CommitteeActionResult {
  if (e instanceof CaseError) return { ok: false, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorFr: "Hors de votre périmètre." };
  console.error("[comité]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Opération impossible (base indisponible ?)." };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function refresh(caseId?: string, counterpartyId?: string) {
  if (caseId) revalidatePath(`/cases/${caseId}`);
  if (counterpartyId) revalidatePath(`/counterparties/${counterpartyId}`);
  revalidatePath("/cases");
  revalidatePath("/counterparties");
}

/** Levée de critères de classement sur décision de comité (profil habilité). */
export async function recordLiftAction(_prev: CommitteeActionResult, fd: FormData): Promise<CommitteeActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const caseId = str(fd, "caseId");
  try {
    const r = await recordLift(await getDb(), session.identity, caseId, {
      codes: fd.getAll("codes").map(String),
      committeeDate: str(fd, "committeeDate"),
      reference: str(fd, "reference"),
      motif: str(fd, "motif"),
    });
    refresh(caseId);
    return {
      ok: true,
      okFr:
        r.status === "EN_ATTENTE"
          ? "Levée enregistrée : elle prendra effet après confirmation par une seconde personne habilitée."
          : `Levée enregistrée et appliquée.${r.newGrade ? ` Note recalculée : ${r.newGrade}.` : " Elle s'appliquera au calcul du dossier."}`,
    };
  } catch (e) {
    return failure(e);
  }
}

export async function confirmDecisionAction(_prev: CommitteeActionResult, fd: FormData): Promise<CommitteeActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const r = await confirmDecision(await getDb(), session.identity, str(fd, "decisionId"));
    refresh(str(fd, "caseId") || undefined, str(fd, "counterpartyId") || undefined);
    return { ok: true, okFr: `Décision confirmée.${r.newGrade ? ` Note recalculée : ${r.newGrade}.` : ""}` };
  } catch (e) {
    return failure(e);
  }
}

export async function cancelDecisionAction(_prev: CommitteeActionResult, fd: FormData): Promise<CommitteeActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    await cancelDecision(await getDb(), session.identity, str(fd, "decisionId"), str(fd, "reason"));
    refresh(str(fd, "caseId") || undefined, str(fd, "counterpartyId") || undefined);
    return { ok: true, okFr: "Décision annulée." };
  } catch (e) {
    return failure(e);
  }
}

/** Entrée ou sortie de watch list sur décision de comité (profil habilité). */
export async function recordWatchlistAction(_prev: CommitteeActionResult, fd: FormData): Promise<CommitteeActionResult> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const counterpartyId = str(fd, "counterpartyId");
  try {
    const kind = str(fd, "kind") === "WL_SORTIE" ? "WL_SORTIE" : "WL_ENTREE";
    const r = await recordWatchlist(await getDb(), session.identity, counterpartyId, {
      kind,
      level: str(fd, "level") || undefined,
      effectiveDate: str(fd, "effectiveDate"),
      committeeDate: str(fd, "committeeDate"),
      reference: str(fd, "reference"),
      motif: str(fd, "motif"),
    });
    refresh(undefined, counterpartyId);
    return {
      ok: true,
      okFr:
        r.status === "EN_ATTENTE"
          ? "Décision enregistrée : en attente de confirmation par une seconde personne habilitée."
          : kind === "WL_SORTIE"
            ? "Sortie de watch list enregistrée."
            : r.change
              ? "Changement de niveau enregistré."
              : "Entrée en watch list enregistrée.",
    };
  } catch (e) {
    return failure(e);
  }
}
