import Link from "next/link";
import { notFound } from "next/navigation";
import { compareRuns } from "@/core/compare";
import { readResultSnapshot } from "@/lib/snapshot-compat";
import { isOfficialRun } from "@/lib/cases";
import { CaseStatusBadge } from "@/app/cases/CaseStatusBadge";
import { safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge, OutcomeLabel } from "@/app/ui-helpers";

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

  const { data, dbAvailable } = await safeQuery(async (db) => {
      const counterparty = await db.counterparty.findUnique({
        where: { id },
        include: { economicGroup: { select: { id: true, code: true, name: true } } },
      });
      if (!counterparty) return null;
      // Historique sans les instantanés, qui pèsent plusieurs dizaines de
      // kilo-octets par run : seuls les deux derniers runs notés sont relus,
      // pour l'attribution d'écart.
      const runs = await db.ratingRun.findMany({
        where: { counterpartyId: id },
        orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          asOfDate: true,
          segment: true,
          outcome: true,
          rawScore: true,
          engineGrade: true,
          cappedGrade: true,
          finalGrade: true,
          requestedBy: true,
          origin: true,
          ratingCase: { select: { id: true, status: true } },
        },
      });
      // L'évolution se mesure entre notations qui font foi.
      const lastScoredIds = runs
        .filter((r) => r.rawScore !== null && isOfficialRun(r))
        .slice(0, 2)
        .map((r) => r.id);
      const snapshots = await db.ratingRun.findMany({
        where: { id: { in: lastScoredIds } },
        select: { id: true, resultSnapshot: true },
      });
      const snapshotById = new Map(snapshots.map((r) => [r.id, r.resultSnapshot]));
      const [entity, cases] = await Promise.all([
        db.entity.findUnique({ where: { id: counterparty.entityId }, select: { name: true, code: true } }),
        db.ratingCase.findMany({
          where: { counterpartyId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, status: true, asOfDate: true, createdBy: true, submittedBy: true, decidedBy: true, updatedAt: true },
        }),
      ]);
      return { counterparty, runs, snapshotById, entity, cases };
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

  const { counterparty, runs, snapshotById, entity, cases } = data;

  // Attribution de l'écart entre les deux dernières notations exploitables.
  // Deux instantanés ne se comparent que s'ils ont la même forme : un
  // instantané de moteur antérieur ne porte ni exceptions ni couverture, et le
  // comparer reviendrait à attribuer un écart à des champs absents.
  const scored = runs.filter((r) => r.rawScore !== null && isOfficialRun(r));
  const snapshotOf = (runId: string) => snapshotById.get(runId) ?? "";
  const previousRead = scored.length >= 2 ? readResultSnapshot(snapshotOf(scored[1].id)) : null;
  const currentRead = scored.length >= 2 ? readResultSnapshot(snapshotOf(scored[0].id)) : null;
  const comparison =
    previousRead?.kind === "V3" && currentRead?.kind === "V3"
      ? compareRuns(previousRead.result, currentRead.result)
      : null;
  const comparisonSkippedFr =
    scored.length >= 2 && comparison === null
      ? "Comparaison indisponible : l'une des deux notations provient d'un moteur antérieur et n'a pas la même structure."
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
            entity && `${entity.name} (${entity.code})`,
            counterparty.country && `pays ${counterparty.country}`,
            `devise ${counterparty.currency}`,
            counterparty.ice && `ICE ${counterparty.ice}`,
            counterparty.legalForm,
            counterparty.city,
            counterparty.sectorCode && `secteur ${counterparty.sectorCode}`,
            counterparty.segment && `segment ${counterparty.segment}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Groupe d&apos;affaires :{" "}
          {counterparty.economicGroup ? (
            <Link href={`/groups/${counterparty.economicGroup.id}`} style={{ color: "var(--brand)" }}>
              {counterparty.economicGroup.code} — {counterparty.economicGroup.name}
            </Link>
          ) : (
            <>
              aucun ·{" "}
              <Link href="/groups" style={{ color: "var(--brand)" }}>
                rattacher à un groupe
              </Link>
            </>
          )}
        </p>
      </div>

      {comparisonSkippedFr && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>
            Évolution depuis la notation précédente
          </h2>
          <p className="muted" style={{ fontSize: 13 }}>{comparisonSkippedFr}</p>
        </section>
      )}

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

      {cases.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Dossiers de notation</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Arrêté</th>
                <th>Statut</th>
                <th>Ouvert par</th>
                <th>Soumis par</th>
                <th>Décidé par</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/cases/${c.id}`} style={{ color: "var(--brand)" }}>
                      {c.asOfDate}
                    </Link>
                  </td>
                  <td>
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td className="muted">{c.createdBy}</td>
                  <td className="muted">{c.submittedBy ?? "—"}</td>
                  <td className="muted">{c.decidedBy ?? "—"}</td>
                  <td className="muted nowrap">{c.updatedAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th>
                  <span className="sr-only">Lien</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore !== null ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td><GradeBadge grade={r.engineGrade} /></td>
                  <td>
                    <GradeBadge grade={r.finalGrade} />
                    {r.finalGrade !== r.cappedGrade && r.finalGrade && (
                      <span className="muted" style={{ fontSize: 11 }}> (dérogé)</span>
                    )}
                    {r.ratingCase && r.ratingCase.status !== "VALIDATED" && (
                      <span className="muted" style={{ fontSize: 11 }}>
                        {" "}
                        {r.ratingCase.status === "REJECTED" ? "(rejetée)" : "(proposée, non validée)"}
                      </span>
                    )}
                    {r.origin === "BATCH" && (
                      <span className="muted" style={{ fontSize: 11 }} title="Notation de surveillance d'un lot : ne fait pas foi">
                        {" "}
                        (renotation par lot)
                      </span>
                    )}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    <OutcomeLabel outcome={r.outcome} />
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.requestedBy}</td>
                  <td>
                    <Link
                      href={`/rating-runs/${r.id}`}
                      style={{ color: "var(--brand)" }}
                      aria-label={`Détail de la notation du ${r.asOfDate}`}
                    >
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
