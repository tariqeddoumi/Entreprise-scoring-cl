import { Prisma, type PrismaClient } from "@/generated/prisma";
import { prisma } from "./prisma";
import { OFFICIAL_RUN_WHERE } from "./cases";

/**
 * Note courante de chaque client : la notation qui fait foi (validée, ou
 * antérieure au workflow, hors lot), au dernier arrêté, la plus récente à
 * arrêté égal.
 *
 * PostgreSQL : une sous-requête LATERAL par client (LIMIT 1), servie par
 * l'index (client, arrêté, date) — la base ne renvoie qu'une ligne par client
 * (mesuré : 4 fois plus rapide qu'un DISTINCT ON sur 210 000 notations). Autres bases : même
 * résultat par Prisma (dédoublonnage côté serveur d'application, plus lent sur
 * un gros historique).
 *
 * Cloisonnement : la liste des clients vient toujours du client Prisma
 * cloisonné de l'appelant ; la requête directe ne lit que ces clients.
 */

export interface CurrentRating {
  id: string;
  counterpartyId: string;
  modelId: string;
  finalGrade: string | null;
  rawScore: number | null;
  asOfDate: string;
}

function postgresSchema(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//i.test(url)) return null;
  try {
    const schema = new URL(url).searchParams.get("schema") || "public";
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) ? schema : null;
  } catch {
    return null;
  }
}

/**
 * @param db client cloisonné de l'appelant
 * @param counterpartyIds clients visibles déjà lus ; à défaut, tous ceux du périmètre
 */
export async function currentRatings(db: PrismaClient, counterpartyIds?: string[]): Promise<CurrentRating[]> {
  const ids = counterpartyIds ?? (await db.counterparty.findMany({ select: { id: true } })).map((c) => c.id);
  if (!ids.length) return [];
  const schema = postgresSchema();
  if (schema) {
    const s = Prisma.raw(`"${schema}"`);
    const rows = await prisma.$queryRaw<Array<{ id: string; counterpartyId: string; modelId: string; finalGrade: string | null; rawScore: Prisma.Decimal | null; asOfDate: string }>>`
      SELECT x."id", c."id" AS "counterpartyId", x."modelId", x."finalGrade", x."rawScore", x."asOfDate"
      FROM unnest(${ids}::text[]) AS c("id")
      CROSS JOIN LATERAL (
        SELECT r."id", r."modelId", r."finalGrade", r."rawScore", r."asOfDate"
        FROM ${s}."rating_runs" r
        LEFT JOIN ${s}."rating_cases" rc ON rc."runId" = r."id"
        WHERE r."counterpartyId" = c."id"
          AND ((rc."id" IS NULL AND r."origin" <> 'BATCH') OR rc."status" = 'VALIDATED')
        ORDER BY r."asOfDate" DESC, r."createdAt" DESC
        LIMIT 1
      ) x`;
    return rows.map((r) => ({ ...r, rawScore: r.rawScore === null ? null : Number(r.rawScore) }));
  }
  const rows = await db.ratingRun.findMany({
    where: { counterpartyId: { in: ids }, ...OFFICIAL_RUN_WHERE },
    distinct: ["counterpartyId"],
    orderBy: [{ counterpartyId: "asc" }, { asOfDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, counterpartyId: true, modelId: true, finalGrade: true, rawScore: true, asOfDate: true },
  });
  return rows.map((r) => ({ ...r, rawScore: r.rawScore === null ? null : Number(r.rawScore) }));
}

export interface OfficialRun {
  counterpartyId: string;
  asOfDate: string;
  segment: string | null;
  finalGrade: string | null;
  cappedGrade: string | null;
  createdAt: Date;
  exposureBase: number | null;
  decidedAt: Date | null;
}

/**
 * Historique des notations qui font foi des clients donnés (surveillance),
 * par client puis par date. PostgreSQL : une jointure directe (3,5 fois plus
 * rapide que la requête Prisma équivalente sur 210 000 notations).
 */
export async function officialRunHistory(db: PrismaClient, counterpartyIds: string[]): Promise<OfficialRun[]> {
  if (!counterpartyIds.length) return [];
  const schema = postgresSchema();
  if (schema) {
    const s = Prisma.raw(`"${schema}"`);
    const rows = await prisma.$queryRaw<Array<Omit<OfficialRun, "exposureBase"> & { exposureBase: Prisma.Decimal | null }>>`
      SELECT r."counterpartyId", r."asOfDate", r."segment", r."finalGrade", r."cappedGrade", r."createdAt", r."exposureBase", rc."decidedAt"
      FROM ${s}."rating_runs" r
      LEFT JOIN ${s}."rating_cases" rc ON rc."runId" = r."id"
      WHERE r."counterpartyId" = ANY(${counterpartyIds}::text[])
        AND ((rc."id" IS NULL AND r."origin" <> 'BATCH') OR rc."status" = 'VALIDATED')
      ORDER BY r."counterpartyId", r."createdAt"`;
    return rows.map((r) => ({ ...r, exposureBase: r.exposureBase === null ? null : Number(r.exposureBase) }));
  }
  const rows = await db.ratingRun.findMany({
    where: { counterpartyId: { in: counterpartyIds }, ...OFFICIAL_RUN_WHERE },
    select: { counterpartyId: true, asOfDate: true, segment: true, finalGrade: true, cappedGrade: true, createdAt: true, exposureBase: true, ratingCase: { select: { decidedAt: true } } },
    orderBy: [{ counterpartyId: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(({ ratingCase, ...r }) => ({ ...r, exposureBase: r.exposureBase === null ? null : Number(r.exposureBase), decidedAt: ratingCase?.decidedAt ?? null }));
}
