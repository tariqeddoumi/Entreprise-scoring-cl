import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { CaseLift } from "./case-input";
import {
  CLASSIFICATION_KEY,
  parseClassification,
  parseWatchlistLevels,
  WATCHLIST_LEVELS_KEY,
  type ClassificationSettings,
  type WatchlistCap,
  type WatchlistLevel,
} from "@/reference/classification";

/** Paramétrage des critères de classement et levées en vigueur (D-57). */

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadClassification(db: Db): Promise<ClassificationSettings> {
  try {
    return parseClassification((await db.appSetting.findUnique({ where: { key: CLASSIFICATION_KEY } }))?.value);
  } catch {
    return parseClassification(null);
  }
}

export function parseCodes(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Levées en vigueur sur un dossier. */
export async function caseLifts(db: Db, caseId: string): Promise<CaseLift[]> {
  const rows = await db.committeeDecision.findMany({ where: { caseId, kind: "LEVEE_CRITERES", status: "EFFECTIVE" }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ codes: parseCodes(r.criteria), committeeDate: r.committeeDate, reference: r.reference, recordedBy: r.recordedBy, confirmedBy: r.confirmedBy }));
}


export async function loadWatchlistLevels(db: Db): Promise<WatchlistLevel[]> {
  try {
    return parseWatchlistLevels((await db.appSetting.findUnique({ where: { key: WATCHLIST_LEVELS_KEY } }))?.value);
  } catch {
    return parseWatchlistLevels(null);
  }
}

/** Watch list en vigueur d'un client (dernière décision effective), avec le plafond de son niveau. */
export async function activeWatchlistCap(db: Db, counterpartyId: string): Promise<WatchlistCap | null> {
  const last = await db.committeeDecision.findFirst({
    where: { counterpartyId, kind: { in: ["WL_ENTREE", "WL_SORTIE"] }, status: "EFFECTIVE" },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
  });
  if (!last || last.kind !== "WL_ENTREE") return null;
  const levels = await loadWatchlistLevels(db);
  const lv = levels.find((l) => l.code === last.level) ?? levels.find((l) => l.active);
  if (!lv) return null;
  return { level: lv.code, labelFr: lv.labelFr, cap: lv.cap, since: last.effectiveDate };
}
