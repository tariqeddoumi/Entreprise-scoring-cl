import Link from "next/link";
import { getModel, listModels } from "@/models";
import { gradeRank } from "@/core/grades";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { CodeLabel, GradeBadge, MODEL_STATUS_LABELS, OutcomeLabel } from "./ui-helpers";

/**
 * Rang d'un grade DANS L'ÉCHELLE DE SON MODÈLE.
 *
 * Une version locale de ce calcul vivait ici, écrite pour l'échelle G1…G10 :
 * elle lisait le numéro après la première lettre. Sur les échelles V3 elle
 * renvoyait la même valeur de repli pour tous les grades performants, et
 * plaçait les grades de défaut AVANT eux — un tableau de risque qui affichait
 * les défauts en tête, à la place des meilleures notes. Le rang vient
 * désormais de l'échelle publiée du modèle, seule autorité sur l'ordre.
 */
function rankInModel(modelId: string, grade: string | null): number {
  if (!grade) return Number.MAX_SAFE_INTEGER;
  const model = getModel(modelId);
  if (!model) return Number.MAX_SAFE_INTEGER;
  try {
    return gradeRank(model.gradeScale, grade);
  } catch {
    // Grade inconnu de l'échelle courante : notation d'archive, produite par
    // une version antérieure. Rejetée en fin de liste plutôt que classée à tort.
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Un grade appartient-il encore à l'échelle publiée du modèle qui l'a produit ? */
function isCurrentScale(modelId: string, grade: string | null): boolean {
  return grade !== null && rankInModel(modelId, grade) !== Number.MAX_SAFE_INTEGER;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

  const { data: stats, dbAvailable } = await safeQuery(
    async () => {
      const [counterparties, runs, recent, latest] = await Promise.all([
        prisma.counterparty.count(),
        prisma.ratingRun.count(),
        // Champs affichés seulement : les instantanés d'entrée et de résultat
        // pèsent plusieurs dizaines de kilo-octets par run.
        prisma.ratingRun.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            asOfDate: true,
            segment: true,
            outcome: true,
            rawScore: true,
            finalGrade: true,
            counterparty: { select: { name: true } },
          },
        }),
        // Note COURANTE de chaque contrepartie : sa notation au dernier arrêté,
        // la plus récente à arrêté égal. Compter tous les runs ferait peser une
        // contrepartie autant de fois qu'elle a été notée, et mêlerait ses
        // notes successives — ce ne serait plus la distribution du portefeuille.
        prisma.ratingRun.findMany({
          distinct: ["counterpartyId"],
          orderBy: [{ counterpartyId: "asc" }, { asOfDate: "desc" }, { createdAt: "desc" }],
          select: { modelId: true, finalGrade: true },
        }),
      ]);
      // Groupé PAR MODÈLE : deux modèles portent deux échelles que rien ne
      // déclare comparables (constat C03). Les additionner dans une seule
      // distribution reviendrait à traiter un STD-P3 et un TPE-B3 comme le
      // même risque, ce que le moteur refuse explicitement par ailleurs.
      const counts = new Map<string, { modelId: string; finalGrade: string; n: number }>();
      let ungraded = 0;
      for (const run of latest) {
        if (run.finalGrade === null) {
          ungraded++;
          continue;
        }
        const key = `${run.modelId}\u0000${run.finalGrade}`;
        const row = counts.get(key) ?? { modelId: run.modelId, finalGrade: run.finalGrade, n: 0 };
        row.n++;
        counts.set(key, row);
      }
      const gradeRows = [...counts.values()].map((r) => ({
        modelId: r.modelId,
        finalGrade: r.finalGrade,
        _count: { _all: r.n },
      }));
      return { counterparties, runs, recent, gradeRows, ungraded };
    },
    { counterparties: 0, runs: 0, recent: [], gradeRows: [], ungraded: 0 } as {
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
      gradeRows: Array<{
        modelId: string;
        finalGrade: string | null;
        _count: { _all: number };
      }>;
      ungraded: number;
    }
  );

  const models = listModels();
  // Une calibration sur données simulées valide la chaîne de traitement, pas
  // le niveau du risque : la carte ne doit pas la compter comme une calibration.
  const observed = models.filter((m) => m.calibration?.dataSource === "OBSERVED").length;
  const synthetic = models.filter((m) => m.calibration?.dataSource === "SYNTHETIC").length;

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

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard label="Contreparties" value={stats.counterparties} />
        <StatCard label="Notations enregistrées" value={stats.runs} />
        <StatCard label="Modèles disponibles" value={models.length} />
        <StatCard
          label="Calibration PD"
          value={
            observed > 0
              ? `${observed}/${models.length} sur défauts observés`
              : synthetic > 0
                ? "Données simulées uniquement"
                : "Aucune"
          }
          hint={observed === 0 ? "Aucune PD n'est exposée" : undefined}
          small
        />
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Distribution des grades finaux</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Note courante de chaque contrepartie — sa notation au dernier arrêté. Une
          distribution par modèle : les échelles ne sont pas comparables entre elles
          tant qu&apos;aucune correspondance sur probabilités de défaut n&apos;a été
          validée, et les additionner produirait un histogramme qui ne mesure rien.
        </p>
        {stats.gradeRows.length === 0 && stats.ungraded === 0 ? (
          <p className="muted">Aucune notation enregistrée.</p>
        ) : (
          (() => {
            const current = stats.gradeRows.filter((g) =>
              isCurrentScale(g.modelId, g.finalGrade)
            );
            const archived = stats.gradeRows.filter(
              (g) => !isCurrentScale(g.modelId, g.finalGrade)
            );
            const byModel = new Map<string, typeof current>();
            for (const row of current) {
              const list = byModel.get(row.modelId) ?? [];
              list.push(row);
              byModel.set(row.modelId, list);
            }
            const archivedTotal = archived.reduce((acc, g) => acc + g._count._all, 0);

            return (
              <div style={{ display: "grid", gap: 18 }}>
                {[...byModel.entries()].map(([modelId, rows]) => {
                  const sorted = [...rows].sort(
                    (a, b) =>
                      rankInModel(modelId, a.finalGrade) -
                      rankInModel(modelId, b.finalGrade)
                  );
                  const max = Math.max(...sorted.map((g) => g._count._all));
                  const scaleId = getModel(modelId)?.gradeScale.scaleId ?? "—";
                  return (
                    <div key={modelId}>
                      <h3 style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        {modelId}{" "}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          — échelle {scaleId}
                        </span>
                      </h3>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Grade</th>
                            <th>Nombre</th>
                            <th style={{ width: "50%" }}>
                              <span className="sr-only">Répartition</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((g) => (
                            <tr key={`${modelId}:${g.finalGrade}`}>
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
                    </div>
                  );
                })}

                {stats.ungraded > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    <strong>{stats.ungraded}</strong> contrepartie(s) sans grade à leur
                    dernier arrêté (données insuffisantes, segment indéterminé ou routage
                    vers un autre traitement) : elles ne figurent pas dans la distribution.
                  </p>
                )}

                {archivedTotal > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    <strong>{archivedTotal}</strong> contrepartie(s) ont pour dernière
                    notation un grade qui n&apos;appartient à aucune échelle publiée —{" "}
                    {archived
                      .map((g) => `${g.finalGrade} (${g._count._all})`)
                      .join(", ")}
                    . Produites par une version antérieure du moteur, ces notations
                    restent consultables mais ne sont pas classées ici : les ranger dans
                    l&apos;échelle courante leur donnerait un sens qu&apos;elles
                    n&apos;ont pas. Une renotation les y fera entrer.
                  </p>
                )}
              </div>
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
                  <td className="nowrap">{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td><GradeBadge grade={r.finalGrade} /></td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    <OutcomeLabel outcome={r.outcome} />
                  </td>
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
                <td className="muted">
                  <CodeLabel code={m.status} labels={MODEL_STATUS_LABELS} />
                </td>
                <td>{m.segments.join(", ")}</td>
                <td>{m.criteria.length}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {m.calibration
                    ? m.calibration.dataSource === "SYNTHETIC"
                      ? "simulée"
                      : "défauts observés"
                    : "non calibrée"}
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
  hint,
}: {
  label: string;
  value: string | number;
  small?: boolean;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 15 : 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {hint && (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
