/**
 * Actualisation des données T24 à l'ouverture d'un dossier.
 *
 * Pour un client rattaché à T24, l'ouverture du dossier relit la fiche client
 * et, si le chemin est paramétré, les lignes d'engagement : le dossier part de
 * données du jour (engagement global, gestionnaire, segment). Une panne de T24
 * ne bloque jamais l'ouverture : le dossier part des dernières données
 * enregistrées, et l'avertissement est conservé au journal du dossier.
 */
import type { PrismaClient } from "@/generated/prisma";

import type { Identity } from "./auth";
import { CoreBankingError, syncFromT24, t24Config } from "./core-banking";
import { FacilityError, syncFacilitiesFromT24 } from "./facilities";
import { canWrite, type Perimeter } from "./scope";
import { loadSettings } from "./settings";

export type RefreshStatus = "ACTUALISE" | "ECHEC" | "IGNORE";

export interface RefreshPart {
  status: RefreshStatus;
  detailFr: string;
}

export interface OpeningRefresh {
  fiche: RefreshPart;
  engagements: RefreshPart;
}

/** Une fiche relue il y a moins d'une heure n'est pas relue. */
const FRESH_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;

/** Première phrase du message : les conseils de saisie visent la fiche client, pas l'ouverture. */
function message(e: unknown): string {
  if (!(e instanceof CoreBankingError || e instanceof FacilityError)) return "T24 indisponible.";
  const first = e.message.split(/(?<=\.)\s/)[0].replace(/\s*:\s*saisissez.*$/, ".");
  return first.endsWith(".") ? first : `${first}.`;
}

export async function refreshAtOpening(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  counterpartyId: string,
  now: Date = new Date()
): Promise<OpeningRefresh | null> {
  const mode = (await loadSettings()).T24_REFRESH_AT_OPENING ?? "FICHE_ET_ENGAGEMENTS";
  if (mode === "AUCUNE") return null;
  const cfg = await t24Config();
  if (!cfg.enabled) return null;
  const cp = await db.counterparty.findUnique({
    where: { id: counterpartyId },
    select: { id: true, entityId: true, coreBankingId: true, dataSource: true, coreBankingSyncedAt: true, isActive: true },
  });
  // Seule une fiche rapatriée de T24 s'actualise d'office : une saisie minimale
  // porte un code non vérifié, à rattacher explicitement depuis la fiche.
  if (!cp || !cp.isActive || cp.dataSource !== "T24" || !cp.coreBankingId) return null;
  if (!canWrite(perimeter, cp.entityId)) return null;

  let fiche: RefreshPart;
  if (cp.coreBankingSyncedAt && now.getTime() - cp.coreBankingSyncedAt.getTime() < FRESH_MS) {
    fiche = { status: "IGNORE", detailFr: "Fiche déjà actualisée depuis T24 il y a moins d'une heure." };
  } else {
    try {
      const { changes } = await syncFromT24(db, perimeter, identity, cp.id, undefined, { timeoutMs: TIMEOUT_MS });
      fiche = {
        status: "ACTUALISE",
        detailFr: changes.length ? `Fiche actualisée depuis T24 : ${changes.length} champ(s) modifié(s).` : "Fiche actualisée depuis T24 : aucun changement.",
      };
    } catch (e) {
      const last = cp.coreBankingSyncedAt ? ` Dernière actualisation : ${cp.coreBankingSyncedAt.toISOString().slice(0, 10)}.` : "";
      fiche = { status: "ECHEC", detailFr: `Fiche non actualisée : ${message(e)}${last}` };
    }
  }

  let engagements: RefreshPart;
  const path = (await loadSettings()).T24_FACILITIES_PATH ?? "";
  if (mode !== "FICHE_ET_ENGAGEMENTS" || !path) {
    engagements = { status: "IGNORE", detailFr: "Rapatriement des engagements à l'ouverture non activé." };
  } else {
    const today = now.toISOString().slice(0, 10);
    const latest = await db.creditFacility.findFirst({
      where: { counterpartyId: cp.id, source: "API" },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    });
    if (latest?.asOfDate === today) {
      engagements = { status: "IGNORE", detailFr: "Engagements déjà rapatriés de T24 aujourd'hui." };
    } else {
      try {
        const n = await syncFacilitiesFromT24(db, perimeter, identity, cp.id, { timeoutMs: TIMEOUT_MS });
        engagements = { status: "ACTUALISE", detailFr: `Engagements rapatriés de T24 : ${n} ligne(s), position du jour.` };
      } catch (e) {
        const last = latest?.asOfDate ? ` Dernière position : ${latest.asOfDate}.` : "";
        engagements = { status: "ECHEC", detailFr: `Engagements non actualisés : ${message(e)}${last}` };
      }
    }
  }
  return { fiche, engagements };
}

export function parseOpeningRefresh(detail: string | null | undefined): OpeningRefresh | null {
  if (!detail) return null;
  try {
    const r = (JSON.parse(detail) as { openingRefresh?: OpeningRefresh }).openingRefresh;
    return r && r.fiche && r.engagements ? r : null;
  } catch {
    return null;
  }
}
