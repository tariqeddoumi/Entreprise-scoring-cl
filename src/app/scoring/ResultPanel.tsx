"use client";

import type { ModelConfig, RatingResult } from "@/core/types";

const OUTCOME_LABELS: Record<string, string> = {
  SCORED: "Notation produite",
  BLOCKED_RED_FLAG: "Notation arrêtée — red flag bloquant",
  BLOCKED_DATA: "Notation bloquée — données critiques",
  BLOCKED_SEGMENTATION: "Notation bloquée — segment indéterminable",
  DEFAULT_GRADE: "Grade défaut forcé",
  NO_GRADE_CONFIDENCE: "Aucun grade final — qualité insuffisante",
};

export function ResultPanel({
  result,
  model,
}: {
  result: RatingResult;
  model: ModelConfig;
}) {
  const gradeBand = model.masterScale.find((b) => b.grade === result.finalGrade);
  const accent =
    result.outcome === "SCORED"
      ? "var(--good)"
      : result.outcome === "DEFAULT_GRADE" || result.outcome.startsWith("BLOCKED")
        ? "var(--bad)"
        : "var(--warn)";

  return (
    <section
      className="card"
      style={{ padding: 20, borderTopWidth: 3, borderTopColor: accent }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        {OUTCOME_LABELS[result.outcome] ?? result.outcome}
      </h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        {result.explanationFr}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <Metric
          label="Score brut"
          value={result.rawScore !== null ? result.rawScore.toFixed(2) : "—"}
        />
        <Metric
          label="Segment"
          value={
            result.segment
              ? `${result.segment} (${result.segmentSource === "COMPUTED" ? "calculé" : result.segmentSource === "PROVIDED" ? "fourni" : "indéterminé"})`
              : "indéterminé"
          }
        />
        <Metric label="Grade moteur" value={result.engineGrade ?? "—"} />
        <Metric label="Grade après caps" value={result.cappedGrade ?? "—"} />
        <Metric
          label="Confiance"
          value={`${result.confidenceScore.toFixed(1)} (${result.confidenceLevelFr})`}
        />
        <Metric label="Statut PD" value={result.pdStatus} />
      </div>

      {gradeBand && (
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          <strong>{gradeBand.grade} — {gradeBand.labelFr}.</strong>{" "}
          Décision indicative : {gradeBand.indicativeDecisionFr}. Cette indication ne
          remplace pas le moteur de politique de crédit (limites, produit, garanties,
          délégation).
        </p>
      )}

      {result.blockingReasonsFr.length > 0 && (
        <Block title="Motifs de blocage" color="var(--bad)" items={result.blockingReasonsFr} />
      )}
      {result.appliedCaps.length > 0 && (
        <Block
          title="Caps appliqués"
          color="var(--warn)"
          items={result.appliedCaps.map(
            (c) => `${c.code} — ${c.labelFr} → pas mieux que ${c.maxGrade} [${c.source}]`
          )}
        />
      )}
      {result.triggeredRedFlags.length > 0 && (
        <Block
          title="Red flags"
          color="var(--bad)"
          items={result.triggeredRedFlags.map(
            (f) => `${f.code} [${f.level}] ${f.labelFr} — ${f.treatmentFr}`
          )}
        />
      )}
      {result.inconsistenciesFr.length > 0 && (
        <Block
          title="Incohérences entre signaux déclarés et données observées"
          color="var(--bad)"
          items={result.inconsistenciesFr}
        />
      )}
      {result.warningsFr.length > 0 && (
        <Block title="Avertissements" color="var(--warn)" items={result.warningsFr} />
      )}

      {(result.topStrengthsFr.length > 0 || result.topWeaknessesFr.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginTop: 16,
          }}
        >
          <div>
            <h3 style={{ fontWeight: 600, color: "var(--good)", marginBottom: 6 }}>
              Facteurs favorables déterminants
            </h3>
            {result.topStrengthsFr.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Aucun facteur nettement favorable.</p>
            ) : (
              <ul style={{ paddingLeft: 18, listStyle: "disc" }}>
                {result.topStrengthsFr.map((s, i) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 3 }}>{s}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 style={{ fontWeight: 600, color: "var(--bad)", marginBottom: 6 }}>
              Facteurs défavorables déterminants
            </h3>
            {result.topWeaknessesFr.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>Aucun facteur nettement défavorable.</p>
            ) : (
              <ul style={{ paddingLeft: 18, listStyle: "disc" }}>
                {result.topWeaknessesFr.map((s, i) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 3 }}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {result.domainResults.length > 0 && (
        <>
          <h3 style={{ fontWeight: 600, marginTop: 20, marginBottom: 8 }}>
            Scores par domaine
          </h3>
          <table className="data">
            <thead>
              <tr>
                <th>Domaine</th>
                <th>Score</th>
                <th>Poids</th>
                <th>Poids applicable</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {result.domainResults.map((d) => (
                <tr key={d.code}>
                  <td>
                    {d.code} — {d.labelFr}
                  </td>
                  <td>{d.score !== null ? d.score.toFixed(2) : "n/a"}</td>
                  <td>{(d.weightBps / 100).toFixed(2)} %</td>
                  <td>{(d.applicableWeightBps / 100).toFixed(2)} %</td>
                  <td>
                    {d.globalContribution !== null
                      ? d.globalContribution.toFixed(2)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontWeight: 600, marginTop: 20, marginBottom: 8 }}>
            Détail par critère
          </h3>
          <table className="data">
            <thead>
              <tr>
                <th>Critère</th>
                <th>Statut</th>
                <th>Valeur</th>
                <th>Score</th>
                <th>Poids</th>
                <th>Code</th>
                <th>Explication</th>
              </tr>
            </thead>
            <tbody>
              {result.domainResults.flatMap((d) =>
                d.criteria.map((c) => (
                  <tr key={c.code}>
                    <td>
                      {c.code} — {c.labelFr}
                    </td>
                    <td className="muted">{c.status}</td>
                    <td>
                      {c.inputValue !== undefined
                        ? c.inputValue
                        : c.selectedScore !== undefined
                          ? "—"
                          : "—"}
                    </td>
                    <td>{c.score !== null ? c.score : "n/a"}</td>
                    <td>{(c.weightBps / 100).toFixed(2)} %</td>
                    <td className="muted" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>
                      {c.reasonCode || "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {c.explanationFr}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}

      <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
        Modèle {result.modelId} v{result.modelVersion} · moteur v{result.engineVersion} ·
        date d&apos;arrêté {result.asOfDate} · calculé le {result.computedAt}.{" "}
        {result.pdStatus === "UNCALIBRATED" &&
          "Aucune PD n'est produite : le modèle n'est pas calibré."}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Block({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: string[];
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ fontWeight: 600, color, marginBottom: 6 }}>{title}</h3>
      <ul style={{ paddingLeft: 18, listStyle: "disc" }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 13, marginBottom: 3 }}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
