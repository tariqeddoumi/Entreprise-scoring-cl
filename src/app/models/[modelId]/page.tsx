import { notFound } from "next/navigation";
import Link from "next/link";
import { getModel } from "@/models";
import type { Segment } from "@/core/types";

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}) {
  const { modelId } = await params;
  const model = getModel(modelId);
  if (!model) notFound();

  const segments = model.segments;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{model.modelId}</h1>
        <p className="muted">
          {model.labelFr} · version {model.version} · statut {model.status} · date d&apos;effet{" "}
          {model.effectiveFrom}
        </p>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {model.disclaimerFr}
        </p>
      </div>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Pondération des domaines</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Domaine</th>
              {segments.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.domains.map((d) => (
              <tr key={d.code}>
                <td>
                  {d.code} — {d.labelFr}
                </td>
                {segments.map((s) => (
                  <td key={s}>{fmtWeight(model.criteria, d.code, s)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              {segments.map((s) => (
                <td key={s}>
                  <strong>
                    {(
                      model.criteria.reduce((a, c) => a + (c.weightsBps[s] ?? 0), 0) / 100
                    ).toFixed(2)}{" "}
                    %
                  </strong>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Critères</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Libellé</th>
              <th>Type</th>
              {segments.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>Politique donnée</th>
            </tr>
          </thead>
          <tbody>
            {model.criteria.map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td>
                <td>{c.labelFr}</td>
                <td className="muted">{c.type === "QUANTITATIVE" ? "quantitatif" : "qualitatif"}</td>
                {segments.map((s) => (
                  <td key={s}>{((c.weightsBps[s] ?? 0) / 100).toFixed(2)} %</td>
                ))}
                <td className="muted">
                  {c.critical ? "critique / blocage" : c.missingPolicy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Échelle interne (master scale)</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Score</th>
              <th>Libellé</th>
              <th>Décision indicative</th>
            </tr>
          </thead>
          <tbody>
            {model.masterScale.map((b) => (
              <tr key={b.grade}>
                <td>{b.grade}</td>
                <td>
                  {b.minScore === null
                    ? `< ${b.maxScore}`
                    : b.maxScore === null
                      ? `≥ ${b.minScore}`
                      : `[${b.minScore} ; ${b.maxScore}[`}
                </td>
                <td>{b.labelFr}</td>
                <td className="muted">{b.indicativeDecisionFr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Caps structurels</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Situation</th>
              <th>Plafond</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {model.structuralCaps.map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td>
                <td>{c.labelFr}</td>
                <td>{c.maxGrade === "NO_GRADE" ? "aucun grade final" : `pas mieux que ${c.maxGrade}`}</td>
                <td className="muted">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Red flags</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Code</th>
              <th>Signal</th>
              <th>Niveau</th>
              <th>Source</th>
              <th>Traitement</th>
            </tr>
          </thead>
          <tbody>
            {model.redFlags.map((f) => (
              <tr key={f.code}>
                <td>{f.code}</td>
                <td>{f.labelFr}</td>
                <td>{f.level}</td>
                <td className="muted">{f.source}</td>
                <td className="muted">{f.treatmentFr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p>
        <Link href={`/scoring?model=${model.modelId}`} style={{ color: "var(--brand)" }}>
          Lancer une notation avec ce modèle →
        </Link>
      </p>
    </div>
  );
}

function fmtWeight(
  criteria: ReturnType<typeof getModel> extends undefined ? never : NonNullable<ReturnType<typeof getModel>>["criteria"],
  domainCode: string,
  segment: Segment
): string {
  const bps = criteria
    .filter((c) => c.domainCode === domainCode)
    .reduce((a, c) => a + (c.weightsBps[segment] ?? 0), 0);
  return `${(bps / 100).toFixed(2)} %`;
}
