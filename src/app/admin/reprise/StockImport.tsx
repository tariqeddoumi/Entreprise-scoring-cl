"use client";

import { useState, useTransition } from "react";
import { STOCK_SHEETS, type StockSheet } from "@/reference/stock-import";
import { stockImportAction, type StockActionState } from "./actions";

/** Contrôle à blanc puis import confirmé du classeur de reprise. */
export function StockImport() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<StockActionState | null>(null);
  const [pending, start] = useTransition();
  const run = (mode: "controle" | "import") =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      setState(await stockImportAction(fd));
    });
  const r = state?.report;
  const total = r ? Object.values(r.sheets).reduce((a, s) => a + (s?.created ?? 0), 0) : 0;
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 12, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="file"
          aria-label="Classeur de reprise du stock"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setState(null);
          }}
        />
        <button type="button" className="btn-primary" disabled={!file || pending} onClick={() => run("controle")}>
          {pending ? "Traitement…" : "Contrôler (à blanc)"}
        </button>
        {r?.dryRun && total > 0 && (
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Importer ${total} élément(s) ? Les lignes rejetées sont ignorées ; rien d'existant n'est modifié.`)) run("import");
            }}
          >
            Importer
          </button>
        )}
      </div>
      {state?.errorFr && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {state.errorFr}
        </p>
      )}
      {r && (
        <div style={{ display: "grid", gap: 10 }}>
          <p role="status" style={{ fontSize: 14, fontWeight: 600, color: r.dryRun ? "var(--text)" : "var(--good)" }}>
            {r.dryRun ? "Contrôle à blanc : rien n'a été écrit." : "✓ Import réalisé et journalisé."}
          </p>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Feuille</th>
                  <th style={{ textAlign: "right" }}>{r.dryRun ? "À créer" : "Créés"}</th>
                  <th style={{ textAlign: "right" }}>Déjà présents (conservés)</th>
                  <th style={{ textAlign: "right" }}>Rejetés</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(r.sheets) as StockSheet[]).map((k) => (
                  <tr key={k}>
                    <td>{STOCK_SHEETS[k]}</td>
                    <td style={{ textAlign: "right" }}>{r.sheets[k]!.created}</td>
                    <td style={{ textAlign: "right" }}>{r.sheets[k]!.skipped}</td>
                    <td style={{ textAlign: "right" }}>{r.sheets[k]!.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.errors.length > 0 && (
            <details open={r.errors.length <= 20}>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Lignes rejetées ({r.errors.length})</summary>
              <div className="table-scroll" style={{ marginTop: 6 }}>
                <table className="data" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Feuille</th>
                      <th>Ligne</th>
                      <th>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.errors.slice(0, 500).map((e, i) => (
                      <tr key={i}>
                        <td>{STOCK_SHEETS[e.sheet]}</td>
                        <td>{e.line || "—"}</td>
                        <td style={{ fontSize: 12 }}>{e.messageFr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {Object.values(r.sheets).some((s) => s?.notesFr.length) && (
            <ul style={{ fontSize: 12, margin: 0 }}>
              {Object.values(r.sheets)
                .flatMap((s) => s?.notesFr ?? [])
                .slice(0, 50)
                .map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
