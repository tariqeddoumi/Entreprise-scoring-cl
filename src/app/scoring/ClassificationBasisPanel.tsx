import type { RatingInput } from "@/core/types";
import { FAMILY_LABELS, FAMILY_ORDER, type ClassFamily } from "@/reference/classification";

type Basis = NonNullable<RatingInput["classificationBasis"]>;

export function readClassificationBasis(inputSnapshot: string | null | undefined): Basis | null {
  if (!inputSnapshot) return null;
  try {
    const b = (JSON.parse(inputSnapshot) as { classificationBasis?: Basis }).classificationBasis;
    return b && Array.isArray(b.items) ? b : null;
  } catch {
    return null;
  }
}

/** Critères de classement BAM figés dans la notation : cochés, levés, décisions de comité, effet. */
export function ClassificationBasisPanel({ basis }: { basis: Basis }) {
  const fam = basis.family as ClassFamily | null;
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <h2 style={{ fontWeight: 600 }}>Critères de classement BAM à la date de la notation</h2>
      <p style={{ fontSize: 14 }}>
        <strong>{fam ? FAMILY_LABELS[fam] : "Aucun critère actif"}</strong>
        {basis.effect ? ` — ${/^DEF/.test(basis.effect) ? `note de défaut ${basis.effect}` : `note plafonnée à ${basis.effect}`}` : ""}
      </p>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>Critère</th>
              <th>Famille</th>
              <th>État</th>
              <th>Constat</th>
            </tr>
          </thead>
          <tbody>
            {FAMILY_ORDER.flatMap((f) =>
              basis.items
                .filter((i) => i.family === f)
                .map((i) => (
                  <tr key={i.code}>
                    <td>
                      <strong>{i.code}</strong> — {i.labelFr}
                      <div className="muted" style={{ fontSize: 11 }}>{i.article}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{FAMILY_LABELS[f]}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: i.state === "LEVE" ? "var(--good)" : "var(--bad)" }}>
                      {i.state === "LEVE" ? "Levé par le comité" : i.by === "BILAN" ? "Coché (bilan)" : "Coché"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {i.date ?? ""}
                      {i.comment ? ` · ${i.comment}` : ""}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
      {basis.lifts.length > 0 && (
        <ul style={{ fontSize: 12, paddingLeft: 18 }}>
          {basis.lifts.map((l, k) => (
            <li key={k}>
              Levée de {l.codes.join(", ")} — comité du {l.committeeDate}, PV {l.reference}, enregistrée par {l.recordedBy}
              {l.confirmedBy ? `, confirmée par ${l.confirmedBy}` : ""}.
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
