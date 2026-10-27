"use client";

import { useActionState } from "react";
import { fxAction, type FxActionState } from "./actions";

interface RateRow {
  id: string;
  currency: string;
  rate: number;
  effectiveDate: string;
  source: string | null;
  createdBy: string;
}

export function FxAdmin({
  canWrite,
  suggestions,
  latest,
  history,
}: {
  canWrite: boolean;
  suggestions: readonly string[];
  latest: Array<{ currency: string; rate: number; effectiveDate: string }>;
  history: RateRow[];
}) {
  const [state, formAction, pending] = useActionState<FxActionState, FormData>(fxAction, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {state.errorFr && (
        <div role="alert" className="card" style={{ padding: 12, borderLeft: "4px solid var(--bad)" }}>
          {state.errorFr}
        </div>
      )}
      {state.okFr && (
        <div role="status" className="card" style={{ padding: 12, borderLeft: "4px solid var(--good)" }}>
          {state.okFr}
        </div>
      )}

      <section className="stat-grid">
        {latest.length === 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <span className="muted">Aucun cours publié : seuls les dossiers en devise de base peuvent être soumis.</span>
          </div>
        ) : (
          latest.map((r) => (
            <div key={r.currency} className="card" style={{ padding: 16 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                1 {r.currency}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{r.rate.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} MAD</div>
              <div className="muted" style={{ fontSize: 12 }}>au {r.effectiveDate}</div>
            </div>
          ))
        )}
      </section>

      {canWrite && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Publier un cours</h2>
          <form action={formAction} className="grid-fields" style={{ alignItems: "end" }}>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Devise
              </div>
              <input name="currency" required maxLength={3} list="fx-currencies" placeholder="XOF" />
              <datalist id="fx-currencies">
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Date d&apos;effet
              </div>
              <input type="date" name="effectiveDate" required defaultValue={today} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Cours (MAD pour 1 unité)
              </div>
              <input name="rate" required inputMode="decimal" placeholder="0,0165" />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Source
              </div>
              <input name="source" maxLength={120} placeholder="Bank Al-Maghrib, cours de référence" />
            </label>
            <div>
              <button
                type="submit"
                disabled={pending}
                style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600 }}
              >
                Publier
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Historique</h2>
        {history.length === 0 ? (
          <p className="muted">Aucun cours.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Devise</th>
                <th>Date d&apos;effet</th>
                <th>Cours (MAD)</th>
                <th>Source</th>
                <th>Saisi par</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{r.currency}</td>
                  <td className="nowrap">{r.effectiveDate}</td>
                  <td>{r.rate.toLocaleString("fr-FR", { maximumFractionDigits: 8 })}</td>
                  <td className="muted">{r.source ?? "—"}</td>
                  <td className="muted">{r.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
