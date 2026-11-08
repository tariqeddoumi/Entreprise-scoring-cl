"use client";

import { useState } from "react";
import type { ModelConfig } from "@/core/types";
import { LEVEL_LABELS, SITUATION_LABELS, TREND_LABELS, type Level, type Situation, type Trend } from "@/financials/analysis";
import { INDICATOR_GROUP_LABELS, type IndicatorMeta } from "@/financials/compute";
import { formatIndicator } from "@/financials/format";

/** Forme commune à l'analyse en direct et à celle figée dans la notation. */
export interface AnalysisView {
  situation: Situation | null;
  motifsFr: string[];
  alerts: Array<{ key: string; labelFr: string; severity: "CRITIQUE" | "ALERTE"; referenceFr?: string; status: "DECLENCHEE" | "NON" | "NON_EVALUABLE" }>;
  appraisals: Array<{ key: string; levels: Array<Level | null>; trend: Trend | null; change: number | null; grid?: string }>;
}

const LEVEL_COLORS: Record<Level, string> = { BON: "var(--good)", MOYEN: "var(--warn)", MAUVAIS: "var(--bcp-orange)", CRITIQUE: "var(--bad)" };
const SITUATION_COLORS: Record<Situation, string> = { SAINE: "var(--good)", A_SURVEILLER: "var(--warn)", DEGRADEE: "var(--bcp-orange)", CRITIQUE: "var(--bad)" };
const TREND_MARKS: Record<Trend, string> = { AMELIORATION: "▲", STABLE: "▬", DEGRADATION: "▼" };
const TREND_COLORS: Record<Trend, string> = { AMELIORATION: "var(--good)", STABLE: "var(--muted)", DEGRADATION: "var(--bad)" };
const YEAR_LABELS = ["N", "N−1", "N−2"];

function LevelBadge({ level }: { level: Level | null | undefined }) {
  if (!level) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        color: "#fff",
        background: LEVEL_COLORS[level],
        whiteSpace: "nowrap",
      }}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

function TrendCell({ trend, change }: { trend: Trend | null; change: number | null }) {
  if (!trend) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  return (
    <span style={{ color: TREND_COLORS[trend], whiteSpace: "nowrap", fontSize: 12 }} title={TREND_LABELS[trend]}>
      <span aria-hidden>{TREND_MARKS[trend]}</span> {TREND_LABELS[trend]}
      {change !== null ? ` (${change > 0 ? "+" : ""}${change.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)` : ""}
    </span>
  );
}

/**
 * Analyse du bilan dès son chargement : situation d'ensemble, alertes, puis
 * ratios de la grille et autres indicateurs avec leur évolution et leur
 * appréciation. Information pour l'analyste et le valideur : la note n'en
 * dépend pas.
 */
export function FinancialAnalysisPanel({
  analysis,
  indicators,
  years,
  metas,
  model,
  formatVersion,
}: {
  analysis: AnalysisView;
  indicators: Array<{ key: string; values: Array<number | null>; notes?: Array<string | undefined> }>;
  years: string[];
  metas: IndicatorMeta[];
  model?: ModelConfig | null;
  formatVersion?: string;
}) {
  const [focus, setFocus] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const meta = new Map(metas.map((m) => [m.key, m]));
  const values = new Map(indicators.map((r) => [r.key, r]));
  const on = analysis.alerts.filter((a) => a.status === "DECLENCHEE").sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITIQUE" ? -1 : 1));
  const off = analysis.alerts.filter((a) => a.status !== "DECLENCHEE");
  const attention = (a: AnalysisView["appraisals"][number]) => a.levels[0] === "MAUVAIS" || a.levels[0] === "CRITIQUE" || a.trend === "DEGRADATION";
  const grid = analysis.appraisals.filter((a) => a.grid);
  const others = analysis.appraisals.filter((a) => !a.grid && (!focus || attention(a)));
  const n = Math.max(1, Math.min(3, years.length));

  const row = (a: AnalysisView["appraisals"][number], label: string) => {
    const m = meta.get(a.key);
    const r = values.get(a.key);
    return (
      <tr key={a.key}>
        <td title={m?.formulaFr}>
          {label}
          {m?.custom ? <span className="muted" style={{ fontSize: 11 }}> · indicateur du format</span> : null}
        </td>
        {Array.from({ length: n }, (_, i) => (
          <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap", color: a.levels[i] ? LEVEL_COLORS[a.levels[i]!] : undefined }} title={r?.notes?.[i]}>
            {formatIndicator(r?.values[i] ?? null, m?.unit ?? "x")}
          </td>
        ))}
        <td>
          <TrendCell trend={a.trend} change={a.change} />
        </td>
        <td>
          <LevelBadge level={a.levels[0]} />
        </td>
      </tr>
    );
  };

  const head = (
    <thead>
      <tr>
        <th>Indicateur</th>
        {Array.from({ length: n }, (_, i) => (
          <th key={i} style={{ textAlign: "right" }}>
            {years[i] || YEAR_LABELS[i]}
          </th>
        ))}
        <th>Évolution sur un an</th>
        <th>Appréciation (N)</th>
      </tr>
    </thead>
  );

  return (
    <div id="analyse-bilan" style={{ display: "grid", gap: 12, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div
        style={{
          borderLeft: `6px solid ${analysis.situation ? SITUATION_COLORS[analysis.situation] : "var(--border)"}`,
          background: "var(--surface-2)",
          padding: "10px 12px",
          borderRadius: 6,
        }}
      >
        <strong style={{ fontSize: 15, color: analysis.situation ? SITUATION_COLORS[analysis.situation] : undefined }}>
          {analysis.situation ? SITUATION_LABELS[analysis.situation] : "Analyse disponible dès que l'exercice N est chargé"}
        </strong>
        {analysis.motifsFr.length > 0 && <div style={{ fontSize: 13, marginTop: 2 }}>{analysis.motifsFr.join(" · ")}</div>}
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Lecture du bilan seul, avant la notation : information pour l&apos;analyste et le valideur, sans effet sur la note
          {formatVersion ? ` · format ${formatVersion}` : ""}.
        </div>
      </div>

      {analysis.alerts.length > 0 && (
        <div>
          <h4 style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            Alertes {on.length ? `· ${on.length} déclenchée(s)` : "· aucune déclenchée"}
          </h4>
          {on.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
              {on.map((a) => (
                <li key={a.key} style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ color: "#fff", background: a.severity === "CRITIQUE" ? "var(--bad)" : "var(--warn)", fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                    {a.severity === "CRITIQUE" ? "Critique" : "Alerte"}
                  </span>
                  <span>
                    <strong>{a.labelFr}</strong>
                    {a.referenceFr ? <span className="muted" style={{ fontSize: 12 }}> — {a.referenceFr}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {off.length > 0 && (
            <details style={{ fontSize: 12, marginTop: 4 }}>
              <summary style={{ cursor: "pointer" }}>
                {off.filter((a) => a.status === "NON").length} non déclenchée(s), {off.filter((a) => a.status === "NON_EVALUABLE").length} non évaluable(s)
              </summary>
              <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                {off.map((a) => (
                  <li key={a.key}>
                    {a.labelFr} — <span className="muted">{a.status === "NON" ? "non déclenchée" : "non évaluable (donnée ou exercice manquant)"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {grid.length > 0 && (
        <div>
          <h4 style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Ratios de la grille de notation</h4>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 640 }}>
              {head}
              <tbody>
                {grid.map((a) => {
                  const c = model?.criteria.find((x) => x.code === a.grid);
                  return row(a, `${a.grid} — ${c?.labelFr ?? meta.get(a.key)?.labelFr ?? a.key}`);
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analysis.appraisals.some((a) => !a.grid) && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <h4 style={{ fontWeight: 600, fontSize: 13 }}>Autres indicateurs et leur évolution</h4>
            <div style={{ display: "flex", gap: 6 }}>
              {showOthers && (
                <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} aria-pressed={focus} onClick={() => setFocus((x) => !x)}>
                  {focus ? "Tous les indicateurs" : "Points d'attention seulement"}
                </button>
              )}
              <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} aria-expanded={showOthers} onClick={() => setShowOthers((x) => !x)}>
                {showOthers ? "Masquer" : `Afficher (${analysis.appraisals.filter((a) => !a.grid).length}, dont ${analysis.appraisals.filter((a) => !a.grid && attention(a)).length} point(s) d'attention)`}
              </button>
            </div>
          </div>
          {showOthers && (
            <div className="table-scroll">
              <table className="data" style={{ minWidth: 640 }}>
                {head}
                <tbody>
                  {(Object.keys(INDICATOR_GROUP_LABELS) as Array<keyof typeof INDICATOR_GROUP_LABELS>).map((g) => {
                    const rows = others.filter((a) => (meta.get(a.key)?.group ?? "AGREGATS") === g);
                    if (!rows.length) return null;
                    return [
                      <tr key={g}>
                        <th colSpan={n + 3} style={{ textAlign: "left", background: "var(--surface-2)" }}>
                          {INDICATOR_GROUP_LABELS[g]}
                        </th>
                      </tr>,
                      ...rows.map((a) => row(a, meta.get(a.key)?.labelFr ?? a.key)),
                    ];
                  })}
                  {others.length === 0 && (
                    <tr>
                      <td colSpan={n + 3} className="muted">
                        Aucun point d&apos;attention hors ratios de la grille.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
