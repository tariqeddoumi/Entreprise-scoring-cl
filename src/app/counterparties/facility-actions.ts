"use server";

import { revalidatePath } from "next/cache";
import { FacilityError, reconcileFacilities, saveManualFacilities, syncFacilitiesFromT24, type ReconcileDecision } from "@/lib/facilities";
import { isOutOfScope } from "@/lib/scope";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";

export interface FacilityActionState {
  ok: boolean;
  okFr?: string;
  errorFr?: string;
}

function failure(e: unknown): FacilityActionState {
  if (e instanceof FacilityError) return { ok: false, errorFr: e.message };
  if (isOutOfScope(e)) return { ok: false, errorFr: e instanceof Error ? e.message : "Hors de votre périmètre." };
  console.error("[engagements]", e instanceof Error ? e.message : e);
  return { ok: false, errorFr: "Enregistrement impossible (base ou T24 indisponible)." };
}

/** Lignes saisies du client (remplacent les lignes saisies précédentes). */
export async function saveFacilitiesAction(counterpartyId: string, lines: unknown[], asOfDate: string): Promise<FacilityActionState> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const n = await saveManualFacilities(await getDb(), await getPerimeter(), session.identity, counterpartyId, lines, asOfDate);
    revalidatePath(`/counterparties/${counterpartyId}`);
    return { ok: true, okFr: `${n} ligne(s) saisie(s) enregistrée(s).` };
  } catch (e) {
    return failure(e);
  }
}

/** Rapatriement des engagements depuis T24 (remplacent les lignes T24 précédentes). */
export async function syncFacilitiesAction(counterpartyId: string): Promise<FacilityActionState> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const n = await syncFacilitiesFromT24(await getDb(), await getPerimeter(), session.identity, counterpartyId);
    revalidatePath(`/counterparties/${counterpartyId}`);
    const db = await getDb();
    const pending = await db.creditFacility.count({ where: { counterpartyId, source: "SAISIE", reconciliation: null } });
    return {
      ok: true,
      okFr: `${n} ligne(s) rapatriée(s) de T24.${pending ? ` ${pending} ligne(s) saisie(s) à rapprocher : vérifiez l'appariement proposé.` : ""}`,
    };
  } catch (e) {
    return failure(e);
  }
}

/** Rapprochement des lignes saisies avec les lignes T24 (rapprochée, gardée, écartée). */
export async function reconcileFacilitiesAction(counterpartyId: string, decisions: ReconcileDecision[]): Promise<FacilityActionState> {
  const session = await getSessionIdentity("ANALYST");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  try {
    const n = await reconcileFacilities(await getDb(), await getPerimeter(), session.identity, counterpartyId, decisions);
    revalidatePath(`/counterparties/${counterpartyId}`);
    return { ok: true, okFr: `${n} ligne(s) saisie(s) rapprochée(s) : les totaux portent désormais sur les lignes retenues.` };
  } catch (e) {
    return failure(e);
  }
}
