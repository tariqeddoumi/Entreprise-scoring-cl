import Link from "next/link";
import { notFound } from "next/navigation";
import { getModel } from "@/models";
import { safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { ResultPanel } from "@/app/scoring/ResultPanel";
import { CodeLabel, GradeBadge, OVERRIDE_REASON_LABELS } from "@/app/ui-helpers";

const OVERRIDE_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente de décision",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
};
import { readResultSnapshot } from "@/lib/snapshot-compat";
import { LegacyResultPanel } from "./LegacyResultPanel";
import { OverrideDecision, OverrideRequestForm } from "./OverridePanels";
import { hasRole } from "@/lib/auth";
import { isOfficialRun } from "@/lib/cases";
import { settingInt } from "@/lib/settings";
import { CaseStatusBadge } from "@/app/cases/CaseStatusBadge";

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
  const identity = await requireSession();
  const { id } = await params;

  const { data: run, dbAvailable } = await safeQuery((db) =>
      db.ratingRun.findUnique({
        where: { id },
        include: {
          counterparty: { select: { id: true, name: true, ice: true, segment: true } },
          overrides: { orderBy: { createdAt: "desc" } },
          ratingCase: { select: { id: true, status: true, decidedBy: true } },
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
  // L'instantané persisté peut provenir d'un moteur antérieur : sa forme n'est
  // pas garantie, il est donc reconnu avant d'être passé aux composants V3.
  const snapshot = readResultSnapshot(run.resultSnapshot);
  const official = isOfficialRun(run);
  const maxNotches = await settingInt("OVERRIDE_MAX_NOTCHES");
  const canRequestOverride =
    official &&
    hasRole(identity.role, "ANALYST") &&
    !!run.cappedGrade &&
    !run.cappedGrade.startsWith("DEF") &&
    !run.overrides.some((o) => o.status === "PENDING") &&
    !!model;
  const performingGrades = model ? model.gradeScale.bands.map((b) => b.grade).filter((g) => !g.startsWith("DEF")) : [];
  const canDecideOverride = hasRole(identity.role, "RISK_MANAGER");

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

      {run.ratingCase && (
        <div
          className="card"
          role="status"
          style={{
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            borderLeft: `4px solid ${official ? "var(--good)" : run.ratingCase.status === "REJECTED" ? "var(--bad)" : "var(--warn)"}`,
          }}
        >
          <CaseStatusBadge status={run.ratingCase.status} />
          <span style={{ fontSize: 13 }}>
            {official
              ? `Notation validée${run.ratingCase.decidedBy ? ` par ${run.ratingCase.decidedBy}` : ""} : c'est la note de la contrepartie.`
              : run.ratingCase.status === "REJECTED"
                ? "Notation rejetée : elle ne fait pas foi."
                : "Notation proposée, en attente de validation : elle ne fait pas encore foi."}
          </span>
          <Link href={`/cases/${run.ratingCase.id}`} style={{ color: "var(--brand)", fontSize: 13 }}>
            Ouvrir le dossier →
          </Link>
        </div>
      )}

      {canRequestOverride && model && (
        <OverrideRequestForm runId={run.id} grades={performingGrades} currentGrade={run.cappedGrade!} maxNotches={maxNotches} />
      )}

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
                  <td title={o.status}>{OVERRIDE_STATUS_LABELS[o.status] ?? o.status}</td>
                  <td><GradeBadge grade={o.fromGrade} /></td>
                  <td><GradeBadge grade={o.toGrade} /></td>
                  <td className="muted">
                    <CodeLabel code={o.reasonCode} labels={OVERRIDE_REASON_LABELS} />
                  </td>
                  <td className="muted">{o.requestedBy}</td>
                  <td className="muted">{o.decidedBy ?? "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {o.comment}
                    {o.status === "PENDING" && canDecideOverride && o.requestedBy !== identity.name && (
                      <div style={{ marginTop: 6 }}>
                        <OverrideDecision overrideId={o.id} runId={run.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {run.finalGrade !== run.cappedGrade && (
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Le grade final ({run.finalGrade}) diffère du grade produit par le moteur
              ({run.cappedGrade}) : une dérogation approuvée s&apos;applique. Le résultat
              moteur ci-dessous reste celui d&apos;origine, jamais réécrit.
            </p>
          )}
        </section>
      )}

      {snapshot.kind === "UNREADABLE" ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted">{snapshot.reasonFr}</span>
        </div>
      ) : snapshot.kind === "LEGACY" ? (
        <LegacyResultPanel raw={snapshot.raw} reasonFr={snapshot.reasonFr} />
      ) : model ? (
        <ResultPanel result={snapshot.result} model={model} />
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
