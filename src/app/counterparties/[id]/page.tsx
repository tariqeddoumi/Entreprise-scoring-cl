import Link from "next/link";
import { notFound } from "next/navigation";
import { compareRuns } from "@/core/compare";
import type { RatingResult } from "@/core/types";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge } from "@/app/ui-helpers";

export const dynamic = "force-dynamic";

/**
 * Fiche contrepartie : identité, historique des notations et attribution de
 * l'écart entre les deux dernières exécutions.
 */
export default async function CounterpartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const { data, dbAvailable } = await safeQuery(
    async () => {
      const counterparty = await prisma.counterparty.findUnique({ where: { id } });
      if (!counterparty) return null;
      const runs = await prisma.ratingRun.findMany({
        where: { counterpartyId: id },
        orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
        take: 50,
      });
      return { counterparty, runs };
    },
    null
  );

  if (!dbAvailable) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="muted">Base non connectée : fiche indisponible.</span>
      </div>
    );
  }
  if (!data) notFound();

  const { counterparty, runs } = data;

  // Attribution de l'écart entre les deux dernières notations exploitables.
  const scored = runs.filter((r) => r.rawScore !== null);
  const comparison =
    scored.length >= 2
      ? compareRuns(
          JSON.parse(scored[1].resultSnapshot) as RatingResult,
          JSON.parse(scored[0].resultSnapshot) as RatingResult
        )
      : null;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/counterparties" style={{ color: "var(--brand)" }}>
            Contreparties
          </Link>{" "}
          › {counterparty.name}
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{counterparty.name}</h1>
        <p className="muted">
          {[
            counterparty.ice && `ICE ${counterparty.ice}`,
            counterparty.legalForm,
            counterparty.city,
            counterparty.sectorCode && `secteur ${counterparty.sectorCode}`,
            counterparty.segment && `segment ${counterparty.segment}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {comparison && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>
            Évolution depuis la notation précédente
          </h2>
          {!comparison.comparable ? (
            <p className="muted" style={{ fontSize: 13 }}>
              {comparison.incomparableReasonFr}
            </p>
          ) : (
            <>
              <p style={{ fontSize: 14, marginBottom: 12 }}>{comparison.summaryFr}</p>

              {comparison.criterionDeltas.length > 0 && (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Critère</th>
                      <th>Avant</th>
                      <th>Après</th>
                      <th>Nature</th>
                      <th>Effet sur le score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.criterionDeltas.slice(0, 12).map((d) => (
                      <tr key={d.code}>
                        <td>
                          {d.code} — {d.labelFr}
                        </td>
                        <td>{d.previousScore ?? "n/a"}</td>
                        <td>{d.currentScore ?? "n/a"}</td>
                        <td className="muted">{d.natureFr}</td>
                        <td
                          style={{
                            color: d.impact >= 0 ? "var(--good)" : "var(--bad)",
                            fontWeight: 600,
                          }}
                        >
                          {d.impact >= 0 ? "+" : ""}
                          {d.impact.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {[...comparison.capChangesFr, ...comparison.redFlagChangesFr].length > 0 && (
                <ul style={{ paddingLeft: 18, listStyle: "disc", marginTop: 12 }}>
                  {[...comparison.capChangesFr, ...comparison.redFlagChangesFr].map((c, i) => (
                    <li key={i} style={{ fontSize: 13, marginBottom: 3 }}>
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontWeight: 600 }}>Historique des notations</h2>
          <Link href="/scoring" style={{ color: "var(--brand)" }}>
            Nouvelle notation →
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="muted">Aucune notation enregistrée pour cette contrepartie.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date d&apos;arrêté</th>
                <th>Segment</th>
                <th>Score brut</th>
                <th>Grade moteur</th>
                <th>Grade final</th>
                <th>Résultat</th>
                <th>Demandeur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore !== null ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td><GradeBadge grade={r.engineGrade} /></td>
                  <td>
                    <GradeBadge grade={r.finalGrade} />
                    {r.finalGrade !== r.cappedGrade && r.finalGrade && (
                      <span className="muted" style={{ fontSize: 11 }}> (dérogé)</span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.outcome}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.requestedBy}</td>
                  <td>
                    <Link href={`/rating-runs/${r.id}`} style={{ color: "var(--brand)" }}>
                      détail
                    </Link>
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
