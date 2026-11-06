"use client";

import { useState, useTransition } from "react";
import { checkSurveillance, KRI_CATALOG, type SurveillanceSettings } from "@/reference/portfolio";
import { saveSurveillanceAction } from "./purposes-actions";

const UNIT = { PCT: "%", GRADE: "classe", DAYS: "jours", COUNT: "clients" } as const;

/** Seuils orange / rouge des indicateurs de surveillance et paramètres de calcul. */
export function SurveillanceEditor({ initial, readOnly }: { initial: SurveillanceSettings; readOnly: boolean }) {
  const [v, setV] = useState<SurveillanceSettings>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkSurveillance(v);
  const setT = (code: string, patch: Partial<{ amber: number; red: number }>) => setV((x) => ({ ...x, thresholds: { ...x.thresholds, [code]: { ...x.thresholds[code], ...patch } } }));
  const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Surveillance du portefeuille</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Seuils d&apos;alerte des indicateurs (feu orange, feu rouge), première classe de risque élevé, horizon de migration par défaut et ampleur d&apos;une
          dégradation forte. Valeurs proposées, à arrêter en COPIL.
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Risque élevé à partir de la classe
            <select value={v.highRiskFrom} onChange={(e) => setV({ ...v, highRiskFrom: Number(e.target.value) })}>
              {Array.from({ length: 9 }, (_, k) => k + 2).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Horizon de migration par défaut
            <select value={v.horizonMonths} onChange={(e) => setV({ ...v, horizonMonths: Number(e.target.value) })}>
              {[3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} mois
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
            Dégradation forte (crans)
            <select value={v.strongDowngradeNotches} onChange={(e) => setV({ ...v, strongDowngradeNotches: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>Indicateur</th>
                <th>Sens</th>
                <th>Seuil orange</th>
                <th>Seuil rouge</th>
              </tr>
            </thead>
            <tbody>
              {KRI_CATALOG.map((k) => (
                <tr key={k.code}>
                  <td>
                    {k.labelFr} <span className="muted" style={{ fontSize: 11 }}>({UNIT[k.unit]})</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{k.direction === "UP_IS_WORSE" ? "plus haut = pire" : "plus bas = pire"}</td>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`${k.labelFr} : seuil orange`}
                      style={{ maxWidth: 110 }}
                      value={Number.isFinite(v.thresholds[k.code]?.amber) ? v.thresholds[k.code].amber : ""}
                      onChange={(e) => setT(k.code, { amber: num(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      aria-label={`${k.labelFr} : seuil rouge`}
                      style={{ maxWidth: 110 }}
                      value={Number.isFinite(v.thresholds[k.code]?.red) ? v.thresholds[k.code].red : ""}
                      onChange={(e) => setT(k.code, { red: num(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      {issues.length > 0 && <div style={{ color: "var(--bad)", fontSize: 12 }}>{issues.join(" ")}</div>}
      {msg && (
        <div role={msg.error ? "alert" : "status"} style={{ color: msg.error ? "var(--bad)" : "var(--good)", fontSize: 13 }}>
          {msg.error ?? msg.ok}
        </div>
      )}
      {!readOnly && (
        <div>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || issues.length > 0}
            onClick={() =>
              start(async () => {
                const r = await saveSurveillanceAction(v);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer les seuils"}
          </button>
        </div>
      )}
    </section>
  );
}
