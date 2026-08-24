import Link from "next/link";
import { listModels } from "@/models";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

  const { data: stats, dbAvailable } = await safeQuery(
    async () => {
      const [counterparties, runs, recent, gradeRows] = await Promise.all([
        prisma.counterparty.count(),
        prisma.ratingRun.count(),
        prisma.ratingRun.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { counterparty: { select: { name: true } } },
        }),
        prisma.ratingRun.groupBy({
          by: ["finalGrade"],
          _count: { _all: true },
          where: { finalGrade: { not: null } },
        }),
      ]);
      return { counterparties, runs, recent, gradeRows };
    },
    { counterparties: 0, runs: 0, recent: [], gradeRows: [] } as {
      counterparties: number;
      runs: number;
      recent: Array<{
        id: string;
        asOfDate: string;
        segment: string | null;
        outcome: string;
        rawScore: unknown;
        finalGrade: string | null;
        counterparty: { name: string };
      }>;
      gradeRows: Array<{ finalGrade: string | null; _count: { _all: number } }>;
    }
  );

  const models = listModels();

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Tableau de bord</h1>
        <p className="muted">
          Notation interne des contreparties entreprises non financières — segments TPE,
          PME et Grandes Entreprises.
        </p>
      </div>

      {!dbAvailable && (
        <div
          className="card"
          style={{ padding: 14, borderLeftWidth: 4, borderLeftColor: "var(--warn)" }}
        >
          <strong>Base de données non connectée.</strong>{" "}
          <span className="muted">
            Le moteur de notation et la simulation restent pleinement fonctionnels.
            Configurez <code>DATABASE_URL</code> puis lancez{" "}
            <code>npm run db:push</code> pour activer la persistance, l&apos;historique et
            l&apos;audit.
          </span>
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="Contreparties" value={stats.counterparties} />
        <StatCard label="Runs de notation" value={stats.runs} />
        <StatCard label="Modèles publiés" value={models.length} />
        <StatCard label="Statut PD" value="UNCALIBRATED" small />
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Distribution des grades finaux</h2>
        {stats.gradeRows.length === 0 ? (
          <p className="muted">Aucune notation enregistrée.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              {stats.gradeRows
                .sort((a, b) => (a.finalGrade ?? "").localeCompare(b.finalGrade ?? ""))
                .map((g) => (
                  <tr key={g.finalGrade}>
                    <td>{g.finalGrade}</td>
                    <td>{g._count._all}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontWeight: 600 }}>Dernières notations</h2>
          <Link href="/scoring" style={{ color: "var(--brand)" }}>
            Nouvelle notation →
          </Link>
        </div>
        {stats.recent.length === 0 ? (
          <p className="muted">
            Aucun run enregistré. Lancez une notation depuis l&apos;onglet « Nouvelle
            notation ».
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Contrepartie</th>
                <th>Date d&apos;arrêté</th>
                <th>Segment</th>
                <th>Score brut</th>
                <th>Grade final</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.counterparty.name}</td>
                  <td>{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td>{r.finalGrade ?? "—"}</td>
                  <td className="muted">{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Modèles disponibles</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Identifiant</th>
              <th>Libellé</th>
              <th>Version</th>
              <th>Statut</th>
              <th>Segments</th>
              <th>Critères</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.modelId}>
                <td>
                  <Link href={`/models/${m.modelId}`} style={{ color: "var(--brand)" }}>
                    {m.modelId}
                  </Link>
                </td>
                <td>{m.labelFr}</td>
                <td>{m.version}</td>
                <td className="muted">{m.status}</td>
                <td>{m.segments.join(", ")}</td>
                <td>{m.criteria.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 15 : 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}
