"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtAmount, fmtInt, fmtMonth, fmtNum, fmtPct } from "./format";

/** Unité d'un graphique (une fonction ne traverse pas la frontière serveur / client). */
export type ChartUnit = "pct" | "grade" | "amount";
const FORMATS: Record<ChartUnit, (v: number | null) => string> = {
  pct: fmtPct,
  grade: (v) => fmtNum(v, 1),
  amount: (v) => fmtAmount(v),
};

/**
 * Graphiques de la surveillance : SVG sans bibliothèque. Traits fins, une seule
 * échelle par graphique, légende dès deux séries, libellés directs en bout de
 * ligne quand ils ne se chevauchent pas, info-bulle au survol et au clavier.
 * Chaque graphique est doublé d'un tableau (la valeur ne dépend jamais du survol).
 */

export interface Series {
  label: string;
  /** Variable CSS de la couleur (var(--viz-1)…). */
  color: string;
  values: Array<number | null>;
}

function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Échelle à graduations rondes de `min` à un maximum « propre » couvrant `v`. */
function niceScale(v: number, min = 0): { max: number; ticks: number[] } {
  const span = Math.max(v - min, 1e-9);
  const rough = span / 4;
  const p = Math.pow(10, Math.floor(Math.log10(rough)));
  const m = rough / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const n = Math.max(1, Math.ceil(span / step - 1e-9));
  return { max: min + n * step, ticks: Array.from({ length: n + 1 }, (_, i) => min + i * step) };
}

export function Legend({ items, shape }: { items: Array<{ label: string; color: string }>; shape: "line" | "rect" }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }} aria-hidden="true">
      {items.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={
              shape === "line"
                ? { width: 14, height: 2, borderRadius: 1, background: i.color, display: "inline-block" }
                : { width: 10, height: 10, borderRadius: 2, background: i.color, display: "inline-block" }
            }
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), width - 188);
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        left,
        top: Math.max(0, y),
        width: 180,
        pointerEvents: "none",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 8px",
        fontSize: 12,
        boxShadow: "0 2px 8px color-mix(in srgb, var(--bcp-brun) 14%, transparent)",
        zIndex: 2,
      }}
    >
      {children}
    </div>
  );
}

function TipRow({ color, label, value, shape = "line" }: { color: string; label: string; value: string; shape?: "line" | "rect" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
        <span style={shape === "line" ? { width: 10, height: 2, background: color, display: "inline-block" } : { width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
        {label}
      </span>
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{value}</strong>
    </div>
  );
}

/** Courbes d'évolution mensuelle, même unité pour toutes les séries. */
export function LineChart({
  dates,
  series,
  unit = "pct",
  height = 230,
  label,
  yFloor = 0,
}: {
  dates: string[];
  series: Series[];
  unit?: ChartUnit;
  height?: number;
  label: string;
  yFloor?: number;
}) {
  const format = FORMATS[unit];
  const [ref, width] = useWidth();
  const [idx, setIdx] = useState<number | null>(null);
  const narrow = width < 520;
  const m = { l: 44, r: narrow ? 12 : 128, t: 12, b: 26 };
  const pw = width - m.l - m.r;
  const ph = height - m.t - m.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const yMin = yFloor;
  const { max: yMax, ticks } = niceScale(Math.max(...all, yFloor + 1e-9), yMin);
  const x = (i: number) => m.l + (dates.length <= 1 ? pw / 2 : (i * pw) / (dates.length - 1));
  const y = (v: number) => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
  const every = Math.max(1, Math.ceil(dates.length / (narrow ? 4 : 8)));

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  // Libellés de fin : affichés seulement s'ils ne se chevauchent pas (la légende reste).
  const ends = series
    .map((s, k) => {
      let i = s.values.length - 1;
      while (i >= 0 && s.values[i] === null) i--;
      return i >= 0 ? { k, i, v: s.values[i]!, yy: y(s.values[i]!) } : null;
    })
    .filter((e): e is { k: number; i: number; v: number; yy: number } => e !== null)
    .sort((a, b) => a.yy - b.yy);
  const shown = new Set<number>();
  let lastY = -Infinity;
  for (const e of ends) {
    if (e.yy - lastY >= 15) {
      shown.add(e.k);
      lastY = e.yy;
    }
  }

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    const i = Math.round(((px - m.l) / (pw || 1)) * (dates.length - 1));
    setIdx(Math.min(dates.length - 1, Math.max(0, i)));
  };

  return (
    <div className="viz" style={{ display: "grid", gap: 6, minWidth: 0 }}>
      {series.length > 1 && <Legend items={series} shape="line" />}
      <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0 }}>
        <svg width={width} height={height} role="img" aria-label={label} style={{ display: "block", overflow: "visible" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + pw} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(t).replace(/,0(?=\D|$)/, "")}
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            (i % every === 0 && dates.length - 1 - i >= every) || i === dates.length - 1 ? (
              <text key={d} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {fmtMonth(d)}
              </text>
            ) : null
          )}
          {idx !== null && <line x1={x(idx)} x2={x(idx)} y1={m.t} y2={m.t + ph} stroke="var(--muted)" strokeWidth={1} />}
          {paths.map((d, k) => (
            <path key={k} d={d} fill="none" stroke={series[k].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {ends.map((e) => (
            <circle key={e.k} cx={x(e.i)} cy={e.yy} r={4} fill={series[e.k].color} stroke="var(--surface)" strokeWidth={2} />
          ))}
          {idx !== null &&
            series.map((s, k) =>
              s.values[idx] !== null ? <circle key={k} cx={x(idx)} cy={y(s.values[idx]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null
            )}
          {!narrow &&
            ends
              .filter((e) => shown.has(e.k))
              .map((e) => (
                <text key={e.k} x={x(e.i) + 8} y={e.yy + 4} fontSize={12} fill="var(--text)">
                  <tspan fontWeight={600}>{format(e.v)}</tspan>
                  {series.length > 1 ? ` ${series[e.k].label}` : ""}
                </text>
              ))}
          <rect
            x={m.l}
            y={m.t}
            width={pw}
            height={ph}
            fill="transparent"
            tabIndex={0}
            aria-label={`${label} : survol ou flèches pour lire les valeurs`}
            onPointerMove={(e) => pick(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect())}
            onPointerLeave={() => setIdx(null)}
            onBlur={() => setIdx(null)}
            onFocus={() => setIdx(dates.length - 1)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, (i ?? dates.length - 1) - 1));
              if (e.key === "ArrowRight") setIdx((i) => Math.min(dates.length - 1, (i ?? 0) + 1));
            }}
            style={{ outline: "none", cursor: "crosshair" }}
          />
        </svg>
        {idx !== null && (
          <Tooltip x={x(idx)} y={m.t} width={width}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{fmtMonth(dates[idx])}</div>
            {series.map((s) => (
              <TipRow key={s.label} color={s.color} label={s.label} value={format(s.values[idx])} />
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Colonnes groupées par classe de note (deux dates comparées). */
export function GroupedColumns({
  categories,
  series,
  unit = "pct",
  height = 230,
  label,
  counts,
}: {
  categories: string[];
  series: Series[];
  unit?: ChartUnit;
  height?: number;
  label: string;
  /** Effectifs par série et catégorie, repris dans l'info-bulle. */
  counts?: number[][];
}) {
  const format = FORMATS[unit];
  const [ref, width] = useWidth();
  const [idx, setIdx] = useState<number | null>(null);
  const m = { l: 44, r: 8, t: 16, b: 26 };
  const pw = width - m.l - m.r;
  const ph = height - m.t - m.b;
  const { max, ticks } = niceScale(Math.max(...series.flatMap((s) => s.values.map((v) => v ?? 0)), 1e-9));
  const band = pw / categories.length;
  const k = series.length;
  const bw = Math.max(3, Math.min(24, (band * 0.72 - 2 * (k - 1)) / k));
  const groupW = k * bw + 2 * (k - 1);
  const y = (v: number) => m.t + ph - (v / max) * ph;
  const bar = (x0: number, v: number) => {
    const h = (v / max) * ph;
    if (h <= 0) return "";
    const r = Math.min(4, h, bw / 2);
    const yt = m.t + ph - h;
    const yb = m.t + ph;
    return `M${x0},${yb}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${yb}Z`;
  };
  return (
    <div className="viz" style={{ display: "grid", gap: 6, minWidth: 0 }}>
      {series.length > 1 && <Legend items={series} shape="rect" />}
      <div ref={ref} style={{ position: "relative", width: "100%", minWidth: 0 }}>
        <svg width={width} height={height} role="img" aria-label={label} style={{ display: "block" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={m.l + pw} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {format(t).replace(/,0(?=\D|$)/, "")}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const gx = m.l + i * band + (band - groupW) / 2;
            return (
              <g key={c}>
                {idx === i && <rect x={m.l + i * band} y={m.t} width={band} height={ph} fill="var(--viz-grid)" opacity={0.6} />}
                {series.map((s, j) => (
                  <path key={j} d={bar(gx + j * (bw + 2), s.values[i] ?? 0)} fill={s.color} />
                ))}
                <text x={m.l + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {c}
                </text>
                <rect
                  x={m.l + i * band}
                  y={m.t}
                  width={band}
                  height={ph + m.b}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${c} : ${series.map((s) => `${s.label} ${format(s.values[i])}`).join(", ")}`}
                  onPointerEnter={() => setIdx(i)}
                  onPointerLeave={() => setIdx(null)}
                  onFocus={() => setIdx(i)}
                  onBlur={() => setIdx(null)}
                  style={{ outline: "none" }}
                />
              </g>
            );
          })}
        </svg>
        {idx !== null && (
          <Tooltip x={m.l + idx * band + band / 2} y={m.t} width={width}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Classe {categories[idx]}</div>
            {series.map((s) => (
              <TipRow key={s.label} color={s.color} label={s.label} value={format(s.values[idx])} shape="rect" />
            ))}
            {counts && <div className="muted">Clients : {counts.map((c) => fmtInt(c[idx])).join(" → ")}</div>}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Matrice de migration : ligne = note de départ, colonne = note d'arrivée.
 * Codage divergent : amélioration (sous la diagonale) en bleu, dégradation en
 * rouge, intensité selon la part de la ligne ; diagonale neutre. Les effectifs
 * sont écrits dans chaque case non vide : la couleur n'est jamais seule.
 */
export function MigrationHeatmap({
  labels,
  cells,
  exposure,
  withdrawn,
  fromLabel,
  toLabel,
}: {
  labels: string[];
  cells: number[][];
  exposure: number[][];
  withdrawn: number[];
  fromLabel: string;
  toLabel: string;
}) {
  const [tip, setTip] = useState<{ i: number; j: number; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rowTotals = useMemo(() => cells.map((r, i) => r.reduce((a, b) => a + b, 0) + withdrawn[i]), [cells, withdrawn]);
  const bg = (i: number, j: number) => {
    const n = cells[i][j];
    const tot = rowTotals[i];
    if (!n || !tot) return "transparent";
    const share = n / tot;
    if (i === j) return `color-mix(in srgb, var(--viz-same) ${Math.round(40 + 60 * share)}%, var(--surface))`;
    const pole = j > i ? "var(--viz-down)" : "var(--viz-up)";
    return `color-mix(in srgb, ${pole} ${Math.round(12 + 48 * share)}%, var(--surface))`;
  };
  const show = (i: number, j: number, el: HTMLElement) => {
    const box = boxRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (box) setTip({ i, j, x: r.left - box.left + r.width / 2, y: r.bottom - box.top + 4 });
  };
  const cellStyle = { textAlign: "center" as const, fontVariantNumeric: "tabular-nums" as const, padding: "6px 4px", minWidth: 34, border: "2px solid var(--surface)" };
  return (
    <div ref={boxRef} className="viz" style={{ position: "relative", display: "grid", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "color-mix(in srgb, var(--viz-up) 45%, var(--surface))" }} /> Amélioration (sous la diagonale)
        </span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--viz-same)" }} /> Stable (diagonale)
        </span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "color-mix(in srgb, var(--viz-down) 45%, var(--surface))" }} /> Dégradation (au-dessus)
        </span>
        <span className="muted">Intensité : part de la ligne.</span>
      </div>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 560, borderCollapse: "collapse" }} aria-label={`Matrice de migration du ${fromLabel} au ${toLabel}, en nombre de clients`}>
          <thead>
            <tr>
              <th scope="col" style={{ fontSize: 11 }}>
                Note au {fromLabel} ↓ / au {toLabel} →
              </th>
              {labels.map((l) => (
                <th key={l} scope="col" style={{ textAlign: "center" }}>
                  {l === "D" ? "Déf." : l}
                </th>
              ))}
              <th scope="col" style={{ textAlign: "center", fontSize: 11 }}>
                Sortie / non renouvelée
              </th>
              <th scope="col" style={{ textAlign: "center" }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) =>
              rowTotals[i] === 0 ? null : (
                <tr key={l}>
                  <th scope="row">{l === "D" ? "Défaut" : `Classe ${l}`}</th>
                  {labels.map((_, j) => (
                    <td
                      key={j}
                      tabIndex={cells[i][j] ? 0 : -1}
                      style={{ ...cellStyle, background: bg(i, j), fontWeight: i === j ? 400 : 600 }}
                      onPointerEnter={(e) => cells[i][j] && show(i, j, e.currentTarget)}
                      onPointerLeave={() => setTip(null)}
                      onFocus={(e) => show(i, j, e.currentTarget)}
                      onBlur={() => setTip(null)}
                    >
                      {cells[i][j] || ""}
                    </td>
                  ))}
                  <td style={{ ...cellStyle, color: "var(--muted)" }}>{withdrawn[i] || ""}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{rowTotals[i]}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {tip && (
        <Tooltip x={tip.x - 90} y={tip.y} width={boxRef.current?.clientWidth ?? 600}>
          <div style={{ fontWeight: 600 }}>
            {labels[tip.i] === "D" ? "Défaut" : `Classe ${labels[tip.i]}`} → {labels[tip.j] === "D" ? "défaut" : `classe ${labels[tip.j]}`}
          </div>
          <div>
            <strong>{fmtInt(cells[tip.i][tip.j])}</strong> client(s), {fmtPct((100 * cells[tip.i][tip.j]) / (rowTotals[tip.i] || 1))} de la ligne
          </div>
          <div className="muted">Exposition : {fmtAmount(exposure[tip.i][tip.j])}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Barre fine de part (tableaux de ventilation). */
export function ShareBar({ pct }: { pct: number | null }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <span className="viz" style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 110 }}>
      <span style={{ flex: "0 0 60px", height: 8, borderRadius: 4, background: "var(--viz-grid)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${v}%`, height: "100%", borderRadius: 4, background: "var(--viz-1)" }} />
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtPct(pct)}</span>
    </span>
  );
}

/** Mini-courbe de tendance d'une tuile (12 derniers points). */
export function Sparkline({ values, label }: { values: Array<number | null>; label: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return null;
  const w = 96;
  const h = 26;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => 2 + (i * (w - 6)) / Math.max(1, values.length - 1);
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg className="viz" width={w} height={h} role="img" aria-label={label} style={{ display: "block" }}>
      <path d={d} fill="none" stroke="var(--viz-past)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={3.5} fill="var(--viz-1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
