"use client";

import type { ReactNode } from "react";
import type { ModelConfig, RatingResult } from "@/core/types";
import { GradeBadge, OutcomeLabel } from "../ui-helpers";

const PURPOSE_LABELS: Record<string, string> = {
  PRODUCTION_RATING: "Notation de production",
  PILOT_SHADOW: "Pilote en mode fantôme",
  SIMULATION_ONLY: "Simulation — bac à sable",
};

export function ResultPanel({
  result,
  model,
}: {
  result: RatingResult;
  model: ModelConfig;
}) {
  const gradeBand = model.gradeScale.bands.find((b) => b.grade === result.finalGrade);
  const accent =
    result.ratingStatus === "RATED"
      ? "var(--good)"
      : result.ratingStatus === "DEFAULTED"
        ? "var(--bad)"
        : "var(--warn)";

  return (
    <section
      className="card"
      style={{ padding: 20, borderTopWidth: 3, borderTopColor: accent }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          <OutcomeLabel outcome={result.ratingStatus} />
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print"
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 12px",
            color: "var(--text)",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          Imprimer / PDF
        </button>
      </div>
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
        <Metric label="Grade moteur" value={<GradeBadge grade={result.engineGrade} size="lg" />} />
        <Metric
          label="Grade autonome"
          value={<GradeBadge grade={result.standaloneGrade} size="lg" />}
        />
        {result.groupSupport?.granted && (
          <Metric
            label="Grade après support groupe"
            value={<GradeBadge grade={result.finalGrade} size="lg" />}
          />
        )}
        <Metric
          label="Classe de confiance"
          value={`${result.confidence.classCode} — ${result.confidence.score.toFixed(1)}`}
        />
        <Metric
          label="Couverture observée"
          value={`${(result.coverage.globalObservedBps / 100).toFixed(1)} %`}
        />
        <Metric
          label="PD 12 mois"
          value={
            result.pd12m !== null
              ? `${(result.pd12m * 100).toFixed(2)} %`
              : `non exposée (${result.pdStatus})`
          }
        />
      </div>

      {gradeBand && (
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          <strong>{gradeBand.grade} — {gradeBand.labelFr}</strong>, sur l&apos;échelle{" "}
          {result.gradeScaleId} propre à ce modèle. Cette échelle mesure un risque, elle
          ne porte aucune décision : l&apos;octroi, la limite, le prix et les garanties
          relèvent du moteur de décision, qui n&apos;est pas implémenté ici. Les grades ne
          sont pas comparables à ceux d&apos;un autre modèle sans correspondance validée.
        </p>
      )}

      {result.pdStatus === "CALIBRATED_SYNTHETIC" && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 6,
            border: "1px solid var(--warn)",
            background: "color-mix(in srgb, var(--warn) 8%, transparent)",
          }}
        >
          <strong style={{ color: "var(--warn)" }}>
            Probabilité de défaut issue d&apos;une calibration sur données simulées.
          </strong>{" "}
          <span style={{ fontSize: 13 }}>
            Elle atteste que la chaîne de calibration fonctionne et que
            l&apos;échelle ordonne le risque ; elle n&apos;établit pas le niveau
            réel des probabilités. À n&apos;utiliser ni pour une provision
            IFRS&nbsp;9, ni pour une exigence en fonds propres, ni pour une
            décision d&apos;octroi. Calibration {result.calibrationId}.
          </span>
        </div>
      )}

      {result.blockingReasonsFr.length > 0 && (
        <Block title="Motifs de blocage" color="var(--bad)" items={result.blockingReasonsFr} />
      )}
      {result.appliedRules.length > 0 && (
        <Block
          title="Exceptions non compensatoires appliquées"
          color="var(--warn)"
          items={result.appliedRules.map(
            (c) =>
              `${c.code} — ${c.labelFr} → pas mieux que ${c.maxGrade} [${c.source}${c.centralCriterion ? `, contribution centrale ${c.centralCriterion}` : ""}]`
          )}
        />
      )}
      {result.groupSupport && (
        <Block
          title="Support groupe"
          color={result.groupSupport.granted ? "var(--good)" : "var(--muted)"}
          items={[
            result.groupSupport.rationaleFr,
            ...result.groupSupport.missingConditionsFr.map((c) => `Condition manquante : ${c}`),
          ]}
        />
      )}
      <Block
        title={`Droits d'usage — ${PURPOSE_LABELS[result.usageRights.purpose] ?? result.usageRights.purpose}`}
        color="var(--brand)"
        items={[
          ...result.usageRights.permittedUsesFr.map((u) => `Autorisé : ${u}`),
          ...result.usageRights.restrictionsFr.map((r) => `Interdit / réserve : ${r}`),
        ]}
      />
      <Block
        title="Statuts des cinq moteurs"
        color="var(--muted)"
        items={[
          `Notation : ${result.ratingStatus}`,
          `Conformité : ${result.complianceStatus}`,
          `Décision de crédit : ${result.decisionStatus} (moteur distinct, non implémenté)`,
          `Classification réglementaire : ${result.regulatoryClassStatus} (moteur distinct, non implémenté)`,
          `IFRS 9 : ${result.ifrs9Status} (moteur distinct, non implémenté)`,
        ]}
      />
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
                <th>Poids observé</th>
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
                  <td>{(d.observedWeightBps / 100).toFixed(2)} %</td>
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
        {result.pdStatus === "UNCALIBRATED"
          ? "Aucune PD n'est produite : le modèle n'est pas calibré."
          : `statut PD ${result.pdStatus}${result.calibrationId ? ` · calibration ${result.calibrationId}` : ""}.`}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
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
