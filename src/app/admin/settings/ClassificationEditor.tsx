"use client";

import { useState, useTransition } from "react";
import { checkClassification, DEFAULT_CLASSIFICATION, FAMILY_LABELS, FAMILY_ORDER, type ClassFamily, type ClassificationSettings } from "@/reference/classification";
import { saveClassificationAction } from "./purposes-actions";

const CAP_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "DEF1", "DEF2", "DEF3"];

/** Critères de classement BAM : catalogue, source, famille et effet de chaque famille sur la note. */
export function ClassificationEditor({ initial, readOnly, alertKeys }: { initial: ClassificationSettings; readOnly: boolean; alertKeys: string[] }) {
  const [v, setV] = useState<ClassificationSettings>(JSON.parse(JSON.stringify(initial)) as ClassificationSettings);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkClassification(v);
  const setC = (i: number, patch: Partial<ClassificationSettings["criteria"][number]>) =>
    setV((x) => ({ ...x, criteria: x.criteria.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Critères de classement BAM et effet sur la note</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Critères de la circulaire 1/W/2025 (et de la 19/G/2002) restitués dans chaque dossier. « Bilan » : coché automatiquement quand l&apos;alerte du
          format de bilan se déclenche ; « déclaratif » : coché par l&apos;analyste (une alerte peut le suggérer). Effet de la famille la plus sévère :
          classe plafond (la note ne peut pas être meilleure) ou note de défaut. Une levée décidée en comité neutralise le critère pour le dossier.
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {FAMILY_ORDER.map((f) => (
            <label key={f} style={{ fontSize: 12, display: "grid", gap: 4 }}>
              {FAMILY_LABELS[f]}
              <select value={v.caps[f]} onChange={(e) => setV((x) => ({ ...x, caps: { ...x.caps, [f]: e.target.value } }))}>
                {CAP_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {/^DEF/.test(o) ? `Défaut ${o}` : `Plafond ${o}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Actif</th>
                <th>Code</th>
                <th>Famille</th>
                <th>Critère (abrégé)</th>
                <th>Article</th>
                <th>Source</th>
                <th>Alerte du bilan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {v.criteria.map((c, i) => (
                <tr key={i}>
                  <td>
                    <input type="checkbox" style={{ width: 16 }} aria-label={`Critère ${c.code} actif`} checked={c.active} onChange={(e) => setC(i, { active: e.target.checked })} />
                  </td>
                  <td>
                    <input aria-label="Code" style={{ width: 70 }} value={c.code} onChange={(e) => setC(i, { code: e.target.value.toUpperCase() })} />
                  </td>
                  <td>
                    <select aria-label="Famille" value={c.family} onChange={(e) => setC(i, { family: e.target.value as ClassFamily })}>
                      {FAMILY_ORDER.map((f) => (
                        <option key={f} value={f}>
                          {FAMILY_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input aria-label="Libellé" value={c.labelFr} maxLength={200} onChange={(e) => setC(i, { labelFr: e.target.value })} />
                  </td>
                  <td>
                    <input aria-label="Article" style={{ width: 150 }} value={c.article} maxLength={80} onChange={(e) => setC(i, { article: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label="Source" value={c.source} onChange={(e) => setC(i, { source: e.target.value as "BILAN" | "DECLARE" })}>
                      <option value="DECLARE">Déclaratif</option>
                      <option value="BILAN">Bilan (automatique)</option>
                    </select>
                  </td>
                  <td>
                    <select aria-label="Alerte du bilan" value={c.alertKey ?? ""} onChange={(e) => setC(i, { alertKey: e.target.value || undefined })}>
                      <option value="">—</option>
                      {[...new Set([...alertKeys, ...(c.alertKey ? [c.alertKey] : [])])].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setV((x) => ({ ...x, criteria: x.criteria.filter((_, k) => k !== i) }))}>
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setV((x) => ({ ...x, criteria: [...x.criteria, { code: "", family: "SENSIBLE", labelFr: "", article: "", source: "DECLARE", active: true }] }))}>
            + Ajouter un critère
          </button>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => window.confirm("Rétablir les critères et plafonds embarqués ?") && setV(JSON.parse(JSON.stringify(DEFAULT_CLASSIFICATION)) as ClassificationSettings)}>
            Rétablir le paramétrage embarqué
          </button>
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
                const r = await saveClassificationAction(v);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer les critères"}
          </button>
        </div>
      )}
    </section>
  );
}
