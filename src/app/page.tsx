import Link from "next/link";
import { listModels } from "@/models";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge } from "./ui-helpers";

/** Rang numérique d'un grade pour un tri correct (G10 après G9, jamais après G1). */
function gradeRank(grade: string | null): number {
  if (!grade) return 999;
  if (grade.startsWith("DEF")) return 100 + (Number(grade.slice(3)) || 0);
  const n = Number(grade.slice(1));
  return Number.isFinite(n) ? n : 999;
}

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
  const calibrated = models.filter((m) => m.calibration).length;

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
        <StatCard
          label="Calibration PD"
          value={`${calibrated}/${models.length} calibré(s)`}
          small
        />
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Distribution des grades finaux</h2>
        {stats.gradeRows.length === 0 ? (
          <p className="muted">Aucune notation enregistrée.</p>
        ) : (
          (() => {
            const sorted = [...stats.gradeRows].sort(
              (a, b) => gradeRank(a.finalGrade) - gradeRank(b.finalGrade)
            );
            const max = Math.max(...sorted.map((g) => g._count._all));
            return (
              <table className="data">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>Nombre</th>
                    <th style={{ width: "50%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((g) => (
                    <tr key={g.finalGrade}>
                      <td>
                        <GradeBadge grade={g.finalGrade} />
                      </td>
                      <td>{g._count._all}</td>
                      <td>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 4,
                            width: `${Math.max(4, (g._count._all / max) * 100)}%`,
                            background: "var(--brand)",
                            opacity: 0.6,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()
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
                  <td>
                    <Link href={`/rating-runs/${r.id}`} style={{ color: "var(--brand)" }}>
                      {r.counterparty.name}
                    </Link>
                  </td>
                  <td>{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td><GradeBadge grade={r.finalGrade} /></td>
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
              <th>Calibration</th>
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
                <td className="muted" style={{ fontSize: 12 }}>
                  {m.calibration
                    ? m.calibration.dataSource === "SYNTHETIC"
                      ? "simulée"
                      : "défauts observés"
                    : "non calibré"}
                </td>
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
