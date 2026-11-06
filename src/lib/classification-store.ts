import type { Prisma, PrismaClient } from "@/generated/prisma";
import type { CaseLift } from "./case-input";
import { CLASSIFICATION_KEY, parseClassification, type ClassificationSettings } from "@/reference/classification";

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

