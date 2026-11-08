"use client";

import { useState, useTransition } from "react";
import { checkFacilityTypes, NATURE_LABELS, TERM_LABELS, type FacilityType } from "@/reference/facilities";
import { saveFacilityTypesAction } from "./purposes-actions";

/** Types de lignes d'engagement : nature (bilan ou signature) et durée. */
export function FacilityTypesEditor({ initial, readOnly }: { initial: FacilityType[]; readOnly: boolean }) {
  const [list, setList] = useState<FacilityType[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkFacilityTypes(list);
  const set = (i: number, p: Partial<FacilityType>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Types de lignes d&apos;engagement</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Types des lignes rapatriées de T24 ou saisies. La nature (bilan ou signature) règle la pondération dans l&apos;engagement global ; la durée
          sépare court terme et moyen et long terme. Les codes produit de T24 se traduisent en ces types par la correspondance T24_FACILITY_FIELD_MAP.
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Actif</th>
                <th>Code</th>
                <th>Libellé</th>
                <th>Nature</th>
                <th>Durée</th>
              </tr>
            </thead>
            <tbody>
              {list.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input type="checkbox" style={{ width: 16 }} aria-label={`${t.code} actif`} checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} />
                  </td>
                  <td>
                    <input aria-label={`Code ${i + 1}`} value={t.code} style={{ maxWidth: 180 }} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} />
                  </td>
                  <td>
                    <input aria-label={`Libellé ${t.code}`} value={t.labelFr} maxLength={120} onChange={(e) => set(i, { labelFr: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Nature ${t.code}`} value={t.nature} onChange={(e) => set(i, { nature: e.target.value as FacilityType["nature"] })}>
                      {(Object.keys(NATURE_LABELS) as FacilityType["nature"][]).map((n) => (
                        <option key={n} value={n}>
                          {NATURE_LABELS[n]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Durée ${t.code}`} value={t.term} onChange={(e) => set(i, { term: e.target.value as FacilityType["term"] })}>
                      {(Object.keys(TERM_LABELS) as FacilityType["term"][]).map((n) => (
                        <option key={n} value={n}>
                          {TERM_LABELS[n]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost" style={{ justifySelf: "start", fontSize: 12 }} onClick={() => setList((l) => [...l, { code: "", labelFr: "", nature: "BILAN", term: "CT", active: true }])}>
          + Ajouter un type
        </button>
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
                const r = await saveFacilityTypesAction(list);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer les types"}
          </button>
        </div>
      )}
    </section>
  );
}
