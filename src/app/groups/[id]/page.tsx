import Link from "next/link";
import { notFound } from "next/navigation";
import { OFFICIAL_RUN_WHERE } from "@/lib/cases";
import { safeQuery } from "@/lib/safe-db";
import { getSessionIdentity, requireSession } from "@/lib/session";
import { GradeBadge } from "@/app/ui-helpers";
import { AssignForm } from "../GroupForms";

export const dynamic = "force-dynamic";

/** Fiche d'un groupe d'affaires : membres et note officielle de chacun. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const canEdit = (await getSessionIdentity("ANALYST")).ok;
  const canRenote = (await getSessionIdentity("RISK_MANAGER")).ok;
  const { id } = await params;
  const { data } = await safeQuery(
    async (db) =>
      db.economicGroup.findUnique({
        where: { id },
        include: {
          counterparties: {
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              ice: true,
              segment: true,
              sectorCode: true,
              isActive: true,
              ratingRuns: {
                where: OFFICIAL_RUN_WHERE,
                orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
                take: 1,
                select: { finalGrade: true, asOfDate: true },
              },
            },
          },
        },
      }),
    null
  );
  if (!data) notFound();
  const members = data.counterparties;
  const grades = members.map((m) => m.ratingRuns[0]?.finalGrade).filter(Boolean) as string[];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <Link href="/groups" className="muted" style={{ fontSize: 13 }}>
          ← Groupes d&apos;affaires
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>
          {data.code} — {data.name}
        </h1>
        {data.notes && <p className="muted">{data.notes}</p>}
        <p className="muted" style={{ fontSize: 13 }}>
          {members.length} membre(s) · {grades.length} noté(s)
          {canRenote && members.length > 0 && (
            <>
              {" · "}
              <Link href={`/renotation?group=${data.id}`} style={{ color: "var(--brand)" }}>
                Renoter le groupe
              </Link>
            </>
          )}
        </p>
      </div>
      <section className="card" style={{ padding: 16 }}>
        {members.length === 0 ? (
          <p className="muted">Aucune contrepartie rattachée.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Contrepartie</th>
                <th>ICE</th>
                <th>Segment</th>
                <th>Secteur</th>
                <th>Note officielle</th>
                <th>Arrêté</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/counterparties/${m.id}`} style={{ color: "var(--brand)" }}>
                      {m.name}
                    </Link>
                    {!m.isActive && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>désactivée</span>}
                  </td>
                  <td>{m.ice ?? "—"}</td>
                  <td>{m.segment ?? "—"}</td>
                  <td>{m.sectorCode ?? "—"}</td>
                  <td>
                    <GradeBadge grade={m.ratingRuns[0]?.finalGrade} />
                  </td>
                  <td className="nowrap">{m.ratingRuns[0]?.asOfDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {canEdit && (
        <section className="card" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div>
            <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Rattacher des contreparties</h2>
            <AssignForm groupId={data.id} />
          </div>
          {members.length > 0 && (
            <div>
              <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Détacher des contreparties</h2>
              <AssignForm groupId={null} detach />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
