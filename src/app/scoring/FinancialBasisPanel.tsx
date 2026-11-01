import type { FinancialBasis, ModelConfig } from "@/core/types";
import { KEY_POSTES, POSTE_BY_KEY, STATEMENT_MODEL_LABELS } from "@/financials/chart";
import { INDICATOR_BY_KEY } from "@/financials/compute";
import { formatAmount, formatIndicator } from "@/financials/format";
import { IndicatorTable } from "./FinancialsSection";

const CONTROL_COLORS = { OK: "var(--good)", ALERTE: "var(--warn)", KO: "var(--bad)" } as const;
const CONTROL_LABELS = { OK: "Conforme", ALERTE: "À vérifier", KO: "Bloquant" } as const;

/** Lecture tolérante de la base financière dans un instantané d'entrée. */
export function readFinancialBasis(inputSnapshot: string | null | undefined): FinancialBasis | null {
  if (!inputSnapshot) return null;
  try {
    const b = (JSON.parse(inputSnapshot) as { financialBasis?: FinancialBasis }).financialBasis;
    return b && Array.isArray(b.years) && b.years.length > 0 ? b : null;
  } catch {
    return null;
  }
}

/**
 * « Base financière de la notation » : le bilan, les ratios calculés et
 * retenus et les contrôles, tels qu'ils ont été figés à la soumission. Permet
 * de vérifier que la note repose sur le bon bilan remis par le client.
 */
export function FinancialBasisPanel({ basis, model }: { basis: FinancialBasis; model?: ModelConfig | null }) {
  const n = basis.years[0];
  const yearLabels = basis.years.map((y, i) => y.fiscalYear || ["N", "N−1", "N−2"][i]);
  const ko = basis.controls.filter((c) => c.status === "KO");
  const alerts = basis.controls.filter((c) => c.status === "ALERTE");
  const currency = basis.currency ?? "MAD";

  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 14, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Base financière de la notation</h2>
        <p style={{ fontSize: 13, marginTop: 4, overflowWrap: "anywhere" }}>
          Notation calculée sur le bilan de l&apos;exercice <strong>{n.fiscalYear || "N"}</strong>
          {n.closingDate ? <> clos le <strong>{n.closingDate}</strong></> : null} ·{" "}
          {STATEMENT_MODEL_LABELS[basis.statementModel]} · {basis.certified ? "comptes certifiés" : "comptes non certifiés"} ·{" "}
          {basis.source === "IA" ? "lu par l'IA et relu par l'analyste" : basis.source === "EXCEL" ? "gabarit Excel de la banque" : "saisi par l'analyste"}
          {basis.years.length > 1 ? ` · ${basis.years.length} exercices` : ""} · montants en {currency}.
        </p>
        {basis.document && (
          <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Pièce source : « {basis.document.name} » — empreinte SHA-256 <code style={{ fontSize: 11, wordBreak: "break-all" }}>{basis.document.sha256}</code>
          </p>
        )}
        <p style={{ fontSize: 12, marginTop: 4, color: ko.length ? "var(--bad)" : alerts.length ? "var(--warn)" : "var(--good)" }}>
          Contrôles : {ko.length ? `${ko.length} bloquant(s)` : "aucun bloquant"}
          {alerts.length ? ` · ${alerts.length} à vérifier` : ""}.
        </p>
      </div>

      <div>
        <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Postes clés du bilan et du CPC</h3>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="data" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Poste</th>
                {yearLabels.map((y, i) => (
                  <th key={i} style={{ textAlign: "right" }}>
                    {y}
                    {basis.years[i].closingDate ? <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{basis.years[i].closingDate}</div> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KEY_POSTES.map((k) => (
                <tr key={k}>
                  <td>{POSTE_BY_KEY.get(k)?.labelFr.replace(" (calculé)", "") ?? k}</td>
                  {basis.years.map((y, i) => (
                    <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatAmount(y.postes[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {basis.gridRatios.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Ratios de la grille : calculés et retenus</h3>
          <div className="table-scroll" style={{ overflowX: "auto" }}>
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Critère</th>
                  <th style={{ textAlign: "right" }}>Calculé</th>
                  <th style={{ textAlign: "right" }}>Retenu</th>
                  <th>Correction</th>
                </tr>
              </thead>
              <tbody>
                {basis.gridRatios.map((g) => {
                  const def = INDICATOR_BY_KEY.get(g.indicator);
                  const c = model?.criteria.find((x) => x.code === g.criterion);
                  const unit = def?.unit ?? "x";
                  const special = g.specialCase ? c?.specialCases?.find((x) => x.code === g.specialCase)?.labelFr ?? g.specialCase : null;
                  return (
                    <tr key={g.criterion}>
                      <td>
                        <strong>{g.criterion}</strong> — {c?.labelFr ?? def?.labelFr ?? g.indicator}
                        {g.noteFr && <div className="muted" style={{ fontSize: 11 }}>{g.noteFr}</div>}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatIndicator(g.computed, unit)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: g.overridden ? "var(--warn)" : undefined }}>
                        {special ? <span style={{ fontWeight: 400, fontSize: 12 }}>{special}</span> : formatIndicator(g.retained, unit)}
                      </td>
                      <td style={{ fontSize: 12 }}>{g.overridden ? <>Corrigé par l&apos;analyste — {g.reason}</> : <span className="muted">Valeur calculée</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {basis.controls.length > 0 && (
        <details style={{ minWidth: 0 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Contrôles du bilan ({basis.controls.length})</summary>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
            {basis.controls.map((c) => (
              <li key={c.key} style={{ fontSize: 12, display: "flex", gap: 8 }}>
                <span style={{ color: CONTROL_COLORS[c.status], fontWeight: 600, minWidth: 80 }}>{CONTROL_LABELS[c.status]}</span>
                <span>
                  <strong>{c.labelFr}</strong> — {c.detailFr}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details style={{ minWidth: 0 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Tous les indicateurs financiers</summary>
        <div style={{ marginTop: 8 }}>
          <IndicatorTable rows={basis.indicators} years={yearLabels} />
        </div>
      </details>

      <details style={{ minWidth: 0 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Bilan et CPC complets</summary>
        <div className="table-scroll" style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="data" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Poste</th>
                {yearLabels.map((y, i) => (
                  <th key={i} style={{ textAlign: "right" }}>{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...POSTE_BY_KEY.values()]
                .filter((p) => basis.years.some((y) => y.postes[p.key] !== undefined))
                .map((p) => (
                  <tr key={p.key}>
                    <td style={{ fontWeight: p.kind === "TOTAL" ? 600 : 400 }}>{p.labelFr}</td>
                    {basis.years.map((y, i) => (
                      <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: p.kind === "TOTAL" ? 600 : 400 }}>
                        {formatAmount(y.postes[p.key])}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
