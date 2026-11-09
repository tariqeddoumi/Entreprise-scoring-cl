import type { Prisma, PrismaClient } from "@/generated/prisma";
import { clientIdentity, DOC_KIND_PROFILE, DOC_KIND_PROOF, DOC_KIND_REPORT, latestCreditReport, legalProfileStatus } from "./external-data";
import { facilityStatus } from "./facilities";
import { POSTE_BY_KEY } from "@/financials/chart";
import type { CaseDraft } from "./case-input";
import type { Correction } from "@/reference/corrections";
import type { CreditReportData } from "@/reference/credit-report";
import type { LegalProfile } from "@/reference/legal-profile";

/**
 * Éléments au jour de la décision : à la soumission, le dossier fige ce qui a
 * fondé la note — rapport de solvabilité (tel que lu, corrections, vue
 * retenue), fiche InfoRisque, position des engagements, fiche client T24,
 * corrections du bilan — et copie dans les pièces du dossier les PDF lus et
 * les justificatifs des corrections. La fiche client peut évoluer ensuite :
 * le dossier, lui, ne bouge plus.
 */

export interface FrozenPiece {
  caseDocumentId: string;
  /** Pièce de la fiche client dont elle est la copie. */
  sourceId: string;
  kind: string;
  fileName: string;
  sha256: string;
  origin: "RAPPORT_SOLVABILITE" | "FICHE_JURIDIQUE" | "JUSTIFICATIF_CORRECTION";
}

export interface CaseEvidence {
  version: 1;
  frozenAt: string;
  frozenBy: string;
  client: {
    name: string;
    identity: Record<string, string | null | undefined>;
    coreBankingId: string | null;
    dataSource: string | null;
    coreBankingSyncedAt: string | null;
    /** Fiche T24 telle que rapatriée (JSON). */
    t24: unknown;
  };
  creditReport: {
    id: string;
    bureau: string;
    source: string;
    reportDate: string;
    reference: string | null;
    documentId: string | null;
    documentName: string | null;
    data: CreditReportData;
    raw: CreditReportData;
    corrections: Correction[];
    findings: Array<{ level: string; textFr: string }>;
    signals: string[];
  } | null;
  legal: {
    reportId: string | null;
    source: string;
    reportDate: string;
    documentId: string | null;
    documentName: string | null;
    profile: LegalProfile;
    raw: LegalProfile | null;
    corrections: Correction[];
    findings: Array<{ level: string; textFr: string }>;
    signals: string[];
  } | null;
  facilities: {
    positionDate: string | null;
    lines: unknown[];
    totals: unknown;
    findings: Array<{ level: string; textFr: string }>;
  };
  bilan: {
    source: string;
    document: { id: string; name: string; sha256: string } | null;
    corrections: Array<{ fiscalYear: string; key: string; labelFr: string; read: string; retained: string; reason: string }>;
  };
  pieces: FrozenPiece[];
}

type Findingish = { level: string; textFr?: string; messageFr?: string; labelFr?: string };
const findings = (xs: Findingish[] | undefined) => (xs ?? []).map((f) => ({ level: f.level, textFr: f.textFr ?? f.messageFr ?? f.labelFr ?? "" }));

/** Lecture des éléments (hors transaction). */
export async function collectEvidence(db: PrismaClient, caseId: string, draft: CaseDraft, by: string, declaredExposure: number | null): Promise<CaseEvidence> {
  const c = await db.ratingCase.findUnique({
    where: { id: caseId },
    select: {
      counterparty: {
        select: { id: true, name: true, ice: true, rc: true, legalForm: true, legalProfile: true, coreBankingId: true, dataSource: true, coreBankingSyncedAt: true, coreBankingData: true },
      },
    },
  });
  if (!c) throw new Error("Dossier introuvable.");
  const cp = c.counterparty;
  const [report, legal, ident] = await Promise.all([
    latestCreditReport(db, cp.id, { declaredExposure }),
    legalProfileStatus(db, cp),
    clientIdentity(db, cp.id),
  ]);
  const fac = await facilityStatus(db, cp.id, { bureauOwnOutstanding: report?.analysis.totals.ownOutstanding ?? null, declaredExposure });
  let t24: unknown = null;
  try {
    t24 = cp.coreBankingData ? JSON.parse(cp.coreBankingData) : null;
  } catch {
    t24 = null;
  }
  const fin = draft.financials;
  const bilanCorrections = (fin?.years ?? []).flatMap((y) =>
    Object.entries(y.corrections ?? {}).map(([key, cor]) => ({
      fiscalYear: y.fiscalYear,
      key,
      labelFr: POSTE_BY_KEY.get(key)?.labelFr ?? key,
      read: cor.read,
      retained: y.values[key] ?? "",
      reason: cor.reason,
    }))
  );
  const { dataSource: _ds, ...identity } = ident;
  void _ds;
  return {
    version: 1,
    frozenAt: new Date().toISOString(),
    frozenBy: by,
    client: {
      name: cp.name,
      identity,
      coreBankingId: cp.coreBankingId,
      dataSource: cp.dataSource,
      coreBankingSyncedAt: cp.coreBankingSyncedAt?.toISOString() ?? null,
      t24,
    },
    creditReport: report
      ? {
          id: report.id,
          bureau: report.bureau,
          source: report.source,
          reportDate: report.reportDate,
          reference: report.reference,
          documentId: report.documentId,
          documentName: report.documentName,
          data: report.data,
          raw: report.raw,
          corrections: report.corrections,
          findings: findings([...report.reading, ...report.analysis.findings] as Findingish[]),
          signals: report.analysis.signals,
        }
      : null,
    legal: legal
      ? {
          reportId: legal.profile.reportId ?? null,
          source: legal.profile.source,
          reportDate: legal.profile.reportDate,
          documentId: legal.documentId,
          documentName: legal.profile.documentName ?? null,
          profile: legal.profile,
          raw: legal.raw,
          corrections: legal.corrections,
          findings: findings(legal.analysis.findings as Findingish[]),
          signals: legal.analysis.signals,
        }
      : null,
    facilities: { positionDate: fac.positionDate, lines: fac.lines, totals: fac.totals, findings: findings(fac.findings as unknown as Findingish[]) },
    bilan: { source: fin?.source ?? "", document: fin?.document ?? null, corrections: bilanCorrections },
    pieces: [],
  };
}

/**
 * Copie dans les pièces du dossier (dans la transaction de soumission) des
 * PDF lus et des justificatifs ; une pièce déjà présente (même empreinte)
 * n'est pas dupliquée.
 */
export async function freezePieces(tx: Prisma.TransactionClient, caseId: string, counterpartyId: string, ev: CaseEvidence): Promise<CaseEvidence> {
  const wanted = new Map<string, FrozenPiece["origin"]>();
  if (ev.creditReport?.documentId) wanted.set(ev.creditReport.documentId, "RAPPORT_SOLVABILITE");
  if (ev.legal?.documentId) wanted.set(ev.legal.documentId, "FICHE_JURIDIQUE");
  for (const c of [...(ev.creditReport?.corrections ?? []), ...(ev.legal?.corrections ?? [])]) if (c.documentId && !wanted.has(c.documentId)) wanted.set(c.documentId, "JUSTIFICATIF_CORRECTION");
  if (!wanted.size) return ev;
  const docs = await tx.counterpartyDocument.findMany({ where: { id: { in: [...wanted.keys()] }, counterpartyId } });
  const existing = await tx.caseDocument.findMany({ where: { caseId }, select: { id: true, sha256: true, kind: true, fileName: true } });
  const pieces: FrozenPiece[] = [];
  const kindOf = { RAPPORT_SOLVABILITE: DOC_KIND_REPORT, FICHE_JURIDIQUE: DOC_KIND_PROFILE, JUSTIFICATIF_CORRECTION: DOC_KIND_PROOF } as const;
  for (const d of docs) {
    const origin = wanted.get(d.id)!;
    const kind = kindOf[origin];
    const same = existing.find((e) => e.sha256 === d.sha256);
    const row =
      same ??
      (await tx.caseDocument.create({
        data: { caseId, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, sha256: d.sha256, kind, content: d.content, uploadedBy: `${d.uploadedBy} (figé à la soumission)` },
        select: { id: true, sha256: true, kind: true, fileName: true },
      }));
    if (!same) existing.push(row);
    pieces.push({ caseDocumentId: row.id, sourceId: d.id, kind: row.kind ?? kind, fileName: row.fileName, sha256: row.sha256, origin });
  }
  return { ...ev, pieces };
}

export function parseEvidence(raw: string | null | undefined): CaseEvidence | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as CaseEvidence;
    return v && v.version === 1 ? v : null;
  } catch {
    return null;
  }
}
