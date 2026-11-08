import type { Prisma, PrismaClient } from "@/generated/prisma";
import { parseAmount } from "@/financials/chart";
import { type FinancialsDraft, type FinancialYearDraft } from "@/financials/compute";
import {
  CASE_PURPOSES_KEY,
  CREDIT_TYPES_KEY,
  DEFAULT_CREDIT_TYPES,
  DEFAULT_ENTITY_TIERS,
  COMMERCIAL_SEGMENTS_KEY,
  DEFAULT_COMMERCIAL_SEGMENTS,
  ENTITY_TIERS_KEY,
  nextClosing,
  parsePurposes,
  parseRefItems,
  type CasePurpose,
  type ExerciseChoice,
  type RefItem,
} from "@/reference/case-purposes";

export { nextClosing, suggestedExercise, type ExerciseChoice } from "@/reference/case-purposes";

/**
 * Référentiel des bilans du client et reprise à l'ouverture d'un dossier.
 *
 * Deux cas à l'ouverture, au choix du chargé d'affaires :
 *  - CONSERVE : même dernier exercice arrêté que la dernière note validée —
 *    le bilan est repris tel quel, rien à recharger ;
 *  - SUIVANT : un exercice plus récent est clos — l'exercice N de la dernière
 *    note devient N−1, son N−1 devient N−2, et seul le nouveau bilan N est à
 *    charger (pré-rempli s'il figure déjà au référentiel, par la reprise du
 *    stock par exemple).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadPurposes(db: Db): Promise<CasePurpose[]> {
  try {
    const row = await db.appSetting.findUnique({ where: { key: CASE_PURPOSES_KEY } });
    return parsePurposes(row?.value);
  } catch {
    return parsePurposes(null);
  }
}

export async function loadCreditTypes(db: Db): Promise<RefItem[]> {
  try {
    return parseRefItems((await db.appSetting.findUnique({ where: { key: CREDIT_TYPES_KEY } }))?.value, DEFAULT_CREDIT_TYPES);
  } catch {
    return DEFAULT_CREDIT_TYPES;
  }
}

export async function loadEntityTiers(db: Db): Promise<RefItem[]> {
  try {
    return parseRefItems((await db.appSetting.findUnique({ where: { key: ENTITY_TIERS_KEY } }))?.value, DEFAULT_ENTITY_TIERS);
  } catch {
    return DEFAULT_ENTITY_TIERS;
  }
}

export async function loadCommercialSegments(db: Db): Promise<RefItem[]> {
  try {
    return parseRefItems((await db.appSetting.findUnique({ where: { key: COMMERCIAL_SEGMENTS_KEY } }))?.value, DEFAULT_COMMERCIAL_SEGMENTS);
  } catch {
    return DEFAULT_COMMERCIAL_SEGMENTS;
  }
}

function hasValues(y: FinancialYearDraft | undefined): boolean {
  return !!y && Object.values(y.values ?? {}).some((v) => parseAmount(v) !== undefined);
}

function fromStatement(s: { fiscalYear: string; closingDate: string; values: string }): FinancialYearDraft {
  let values: Record<string, string> = {};
  try {
    const v = JSON.parse(s.values) as Record<string, unknown>;
    values = Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" || typeof x === "number").map(([k, x]) => [k, String(x)]));
  } catch {
    values = {};
  }
  return { fiscalYear: s.fiscalYear, closingDate: s.closingDate, values };
}

/**
 * Bilan du nouveau dossier. `previous` : bilan de la dernière note validée ;
 * `statements` : référentiel du client, du plus récent au plus ancien.
 */
export function carryFinancials(
  previous: FinancialsDraft | null,
  statements: Array<{ fiscalYear: string; closingDate: string; values: string; statementModel: string | null; certified: boolean }>,
  choice: ExerciseChoice,
  empty: FinancialsDraft
): { financials: FinancialsDraft; carriedYears: string[]; toLoad: string | null } {
  const byClosing = new Map(statements.map((s) => [s.closingDate, s]));
  const base: FinancialYearDraft[] = previous && hasValues(previous.years[0]) ? previous.years.filter(hasValues) : statements.slice(0, 3).map(fromStatement);
  if (base.length === 0) return { financials: empty, carriedYears: [], toLoad: null };
  if (choice === "CONSERVE") {
    const financials: FinancialsDraft = previous && hasValues(previous.years[0])
      ? { ...previous, years: previous.years.map((y) => ({ ...y, values: { ...y.values } })) }
      : { ...empty, statementModel: (statements[0]?.statementModel as FinancialsDraft["statementModel"]) ?? "", certified: statements[0]?.certified ?? false, source: "", years: base };
    while (financials.years.length < 2) financials.years.push({ fiscalYear: "", closingDate: "", values: {} });
    return { financials, carriedYears: base.map((y) => y.fiscalYear || y.closingDate), toLoad: null };
  }
  const n = base[0];
  const closing = nextClosing(n.closingDate);
  const fiscalYear = /^\d{4}$/.test(n.fiscalYear) ? String(Number(n.fiscalYear) + 1) : closing.slice(0, 4);
  const known = closing ? byClosing.get(closing) : undefined;
  const newN: FinancialYearDraft = known ? fromStatement(known) : { fiscalYear, closingDate: closing, values: {} };
  const years = [newN, { ...n, values: { ...n.values } }, ...(base[1] ? [{ ...base[1], values: { ...base[1].values } }] : [])].map((y) => {
    const copy = { ...y };
    delete copy.lineage;
    return copy;
  });
  return {
    financials: {
      ...empty,
      statementModel: previous?.statementModel ?? ((statements[0]?.statementModel as FinancialsDraft["statementModel"]) ?? ""),
      certified: known?.certified ?? false,
      source: known ? "SAISIE" : "",
      document: null,
      years,
      overrides: {},
    },
    carriedYears: years.slice(1).map((y) => y.fiscalYear || y.closingDate),
    toLoad: known ? null : fiscalYear || closing,
  };
}

/** Enregistre au référentiel les bilans d'un dossier validé (le plus récent l'emporte). */
export async function recordStatements(
  tx: Db,
  c: { id: string; counterpartyId: string; runId: string | null; currency: string; actor: string; financials: FinancialsDraft; formatVersion?: string }
): Promise<number> {
  let n = 0;
  for (const y of c.financials.years) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y.closingDate) || !hasValues(y)) continue;
    const values = JSON.stringify(Object.fromEntries(Object.entries(y.values).filter(([, v]) => parseAmount(v) !== undefined)));
    const data = {
      fiscalYear: (y.fiscalYear || y.closingDate.slice(0, 4)).slice(0, 20),
      statementModel: c.financials.statementModel || null,
      certified: c.financials.certified,
      values,
      currency: c.currency,
      source: c.financials.source || "SAISIE",
      formatVersion: c.formatVersion ?? null,
      caseId: c.id,
      runId: c.runId,
    };
    await tx.financialStatement.upsert({
      where: { counterpartyId_closingDate: { counterpartyId: c.counterpartyId, closingDate: y.closingDate } },
      update: data,
      create: { ...data, counterpartyId: c.counterpartyId, closingDate: y.closingDate, createdBy: c.actor },
    });
    n++;
  }
  return n;
}

/** Dernier bilan au référentiel et dernière note validée, par client (formulaire d'ouverture). */
export async function lastRatingInfo(
  db: PrismaClient,
  counterpartyIds: string[]
): Promise<Map<string, { fiscalYear: string; closingDate: string; grade: string | null; decidedAt: string | null }>> {
  const out = new Map<string, { fiscalYear: string; closingDate: string; grade: string | null; decidedAt: string | null }>();
  if (counterpartyIds.length === 0) return out;
  const [statements, cases] = await Promise.all([
    db.financialStatement.findMany({
      where: { counterpartyId: { in: counterpartyIds } },
      orderBy: [{ counterpartyId: "asc" }, { closingDate: "desc" }],
      distinct: ["counterpartyId"],
      select: { counterpartyId: true, fiscalYear: true, closingDate: true },
    }),
    db.ratingCase.findMany({
      where: { counterpartyId: { in: counterpartyIds }, status: "VALIDATED" },
      orderBy: [{ counterpartyId: "asc" }, { decidedAt: "desc" }],
      distinct: ["counterpartyId"],
      select: { counterpartyId: true, decidedAt: true, run: { select: { finalGrade: true } } },
    }),
  ]);
  const grade = new Map(cases.map((c) => [c.counterpartyId, c]));
  for (const s of statements) {
    const c = grade.get(s.counterpartyId);
    out.set(s.counterpartyId, { fiscalYear: s.fiscalYear, closingDate: s.closingDate, grade: c?.run?.finalGrade ?? null, decidedAt: c?.decidedAt?.toISOString().slice(0, 10) ?? null });
  }
  return out;
}
