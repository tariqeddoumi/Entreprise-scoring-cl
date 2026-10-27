import Link from "next/link";
import type { Prisma } from "@/generated/prisma";
import { hasRole } from "@/lib/auth";
import { CASE_STATUSES } from "@/lib/cases";
import { safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge } from "@/app/ui-helpers";
import { CaseStatusBadge } from "./CaseStatusBadge";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "todo", label: "À traiter" },
  { key: "DRAFT", label: "Brouillons" },
  { key: "SUBMITTED", label: "À valider" },
  { key: "VALIDATED", label: "Validés" },
  { key: "REJECTED", label: "Rejetés" },
  { key: "CANCELLED", label: "Abandonnés" },
  { key: "all", label: "Tous" },
] as const;

/**
 * Dossiers de notation du périmètre. « À traiter » rassemble ce qui attend
 * l'utilisateur : ses brouillons et ses dossiers rejetés à reprendre, et, pour
 * un valideur, les dossiers soumis par d'autres.
 */
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const identity = await requireSession();
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "todo";
  const validator = hasRole(identity.role, "RISK_MANAGER");

  let where: Prisma.RatingCaseWhereInput = {};
  if (tab === "todo") {
    where = {
      OR: [
        { status: { in: ["DRAFT", "REJECTED"] }, createdBy: identity.name },
        ...(validator ? [{ status: "SUBMITTED", submittedBy: { not: identity.name } }] : []),
      ],
    };
  } else if ((CASE_STATUSES as readonly string[]).includes(tab)) {
    where = { status: tab };
  }

  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      const [cases, counts] = await Promise.all([
        db.ratingCase.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: 200,
          include: {
            counterparty: { select: { id: true, name: true, currency: true, entityId: true } },
            run: { select: { finalGrade: true } },
          },
        }),
        db.ratingCase.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);
      const entities = await db.entity.findMany({ select: { id: true, code: true } });
      return { cases, counts, entityCode: new Map(entities.map((e) => [e.id, e.code])) };
    },
    { cases: [], counts: [], entityCode: new Map<string, string>() }
  );
  const count = (s: string) => data.counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dossiers de notation</h1>
          <p className="muted">
            Brouillon → soumission → validation par une seconde personne. Seule une notation validée devient la note de la contrepartie.
          </p>
        </div>
        {hasRole(identity.role, "ANALYST") && (
          <Link href="/scoring" className="btn-primary" style={{ textDecoration: "none" }}>
            Nouveau dossier
          </Link>
        )}
      </div>

      <div className="stat-grid">
        {(["DRAFT", "SUBMITTED", "VALIDATED", "REJECTED"] as const).map((s) => (
          <div key={s} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              <CaseStatusBadge status={s} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{count(s)}</div>
          </div>
        ))}
      </div>

      <nav className="tabs" aria-label="Filtrer les dossiers">
        {TABS.map((t) => (
          <Link key={t.key} href={`/cases?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      <section className="card" style={{ padding: 16 }}>
        {!dbAvailable ? (
          <p className="muted">Base non connectée.</p>
        ) : data.cases.length === 0 ? (
          <p className="muted">Aucun dossier.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Contrepartie</th>
                <th>Entité</th>
                <th>Arrêté</th>
                <th>Statut</th>
                <th>Grade</th>
                <th>Ouvert par</th>
                <th>Soumis par</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/cases/${c.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                      {c.counterparty.name}
                    </Link>
                  </td>
                  <td className="muted">{data.entityCode.get(c.counterparty.entityId) ?? "—"}</td>
                  <td>{c.asOfDate}</td>
                  <td>
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td>{c.run ? <GradeBadge grade={c.run.finalGrade} /> : <span className="muted">—</span>}</td>
                  <td className="muted">{c.createdBy}</td>
                  <td className="muted">{c.submittedBy ?? "—"}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {c.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
