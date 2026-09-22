import type { LegacySnapshot } from "@/lib/snapshot-compat";
import { GradeBadge } from "@/app/ui-helpers";

/**
 * Affichage d'archive d'une notation produite par un moteur antérieur.
 *
 * Volontairement pauvre : il ne montre que ce que l'instantané contient
 * réellement. Reconstituer une couverture ou une classe de confiance qui
 * n'existaient pas à la date de la notation donnerait à une archive l'apparence
 * d'une notation courante — exactement ce qu'un contrôle a posteriori ne doit
 * pas pouvoir confondre.
 */
export function LegacyResultPanel({
  raw,
  reasonFr,
}: {
  raw: LegacySnapshot;
  reasonFr: string;
}) {
  return (
    <section
      className="card"
      style={{ padding: 20, borderTopWidth: 3, borderTopColor: "var(--warn)" }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        Notation archivée — moteur antérieur
      </h2>
      <p className="muted" style={{ marginBottom: 16 }}>{reasonFr}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Metric
          label="Score brut"
          value={
            typeof raw.rawScore === "number" ? raw.rawScore.toFixed(2) : "—"
          }
        />
        <Metric label="Segment" value={raw.segment ?? "—"} />
        <Metric label="Grade moteur" value={<GradeBadge grade={raw.engineGrade ?? null} size="lg" />} />
        <Metric label="Grade final" value={<GradeBadge grade={raw.finalGrade ?? null} size="lg" />} />
      </div>

      {raw.explanationFr && (
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>{raw.explanationFr}</p>
      )}

      {raw.appliedCaps && raw.appliedCaps.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            Caps appliqués à l&apos;époque
          </h3>
          <ul className="muted" style={{ fontSize: 13, paddingLeft: 18 }}>
            {raw.appliedCaps.map((c, i) => (
              <li key={c.code ?? i}>
                {c.code ? <strong>{c.code}</strong> : null} {c.labelFr ?? ""}
                {c.maxGrade ? ` → ${c.maxGrade}` : ""}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            La V3 a remplacé ces plafonds par quatre exceptions non compensatoires. Cette
            notation n&apos;est pas comparable à une notation courante sans table de
            correspondance validée.
          </p>
        </div>
      )}

      {raw.domainResults && raw.domainResults.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            Scores par domaine
          </h3>
          <table className="data">
            <thead>
              <tr>
                <th>Domaine</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {raw.domainResults.map((d, i) => (
                <tr key={d.code ?? i}>
                  <td>{d.code ? `${d.code} — ` : ""}{d.labelFr ?? "—"}</td>
                  <td>{typeof d.score === "number" ? d.score.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}
