import Link from "next/link";
import { notFound } from "next/navigation";
import type { RatingResult } from "@/core/types";
import { getModel } from "@/models";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { ResultPanel } from "@/app/scoring/ResultPanel";

export const dynamic = "force-dynamic";

/**
 * Consultation d'une notation enregistrée.
 *
 * Le résultat affiché provient de l'instantané persisté, jamais d'un
 * recalcul : c'est ce qui rend une décision historique opposable, même si le
 * modèle a évolué depuis.
 */
export default async function RatingRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const { data: run, dbAvailable } = await safeQuery(
    () =>
      prisma.ratingRun.findUnique({
        where: { id },
        include: {
          counterparty: { select: { id: true, name: true, ice: true, segment: true } },
          overrides: { orderBy: { createdAt: "desc" } },
        },
      }),
    null
  );

  if (!dbAvailable) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="muted">
          Base non connectée : la consultation d&apos;une notation enregistrée est
          indisponible.
        </span>
      </div>
    );
  }
  if (!run) notFound();

  const model = getModel(run.modelId);
  const result = JSON.parse(run.resultSnapshot) as RatingResult;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/counterparties" style={{ color: "var(--brand)" }}>
            Contreparties
          </Link>{" "}
          ›{" "}
          <Link
            href={`/counterparties/${run.counterparty.id}`}
            style={{ color: "var(--brand)" }}
          >
            {run.counterparty.name}
          </Link>{" "}
          › notation du {run.asOfDate}
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          {run.counterparty.name}
        </h1>
        <p className="muted">
          Notation arrêtée au {run.asOfDate} · modèle {run.modelId} v{run.modelVersion} ·
          moteur v{run.engineVersion} · demandée par {run.requestedBy} le{" "}
          {run.createdAt.toISOString().slice(0, 16).replace("T", " ")}
        </p>
      </div>

      {run.overrides.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Dérogations</h2>
          <table className="data">
            <thead>
              <tr>
                <th>Statut</th>
                <th>De</th>
                <th>Vers</th>
                <th>Motif</th>
                <th>Demandeur</th>
                <th>Valideur</th>
                <th>Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {run.overrides.map((o) => (
                <tr key={o.id}>
                  <td>{o.status}</td>
                  <td>{o.fromGrade}</td>
                  <td>{o.toGrade}</td>
                  <td className="muted">{o.reasonCode}</td>
                  <td className="muted">{o.requestedBy}</td>
                  <td className="muted">{o.decidedBy ?? "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{o.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {run.finalGrade !== run.cappedGrade && (
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Le grade final ({run.finalGrade}) diffère du grade moteur après caps (
              {run.cappedGrade}) : une dérogation approuvée s&apos;applique. Le résultat
              moteur ci-dessous reste celui d&apos;origine, jamais réécrit.
            </p>
          )}
        </section>
      )}

      {model ? (
        <ResultPanel result={result} model={model} />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted">
            La version de modèle {run.modelId} n&apos;est plus chargée par
            l&apos;application : le résultat persisté reste consultable via l&apos;API.
          </span>
        </div>
      )}
    </div>
  );
}
