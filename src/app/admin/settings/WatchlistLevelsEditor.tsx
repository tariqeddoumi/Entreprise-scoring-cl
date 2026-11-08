"use client";

import { useState, useTransition } from "react";
import { checkWatchlistLevels, type WatchlistLevel } from "@/reference/classification";
import { saveWatchlistLevelsAction } from "./purposes-actions";

/** Niveaux de watch list : plafond de note, fréquence de revue, délai de renotation. */
export function WatchlistLevelsEditor({ initial, readOnly }: { initial: WatchlistLevel[]; readOnly: boolean }) {
  const [list, setList] = useState<WatchlistLevel[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkWatchlistLevels(list);
  const set = (i: number, patch: Partial<WatchlistLevel>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Niveaux de watch list</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Niveau décidé en comité. Effet : la note ne peut pas être meilleure que le plafond du niveau ; face aux critères BAM, le plafond le plus sévère
          s&apos;applique (cran supplémentaire en cas de cumul : Paramétrage › Comités). Une inscription ou un changement de niveau impose une renotation dans le
          délai indiqué et une revue périodique par la surveillance. Valeurs proposées, à arrêter en COPIL.
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {list.map((l, i) => (
          <div key={i} className="card" style={{ padding: 10, boxShadow: "none", display: "grid", gap: 6 }}>
            <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }}>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <input type="checkbox" style={{ width: 16 }} checked={l.active} onChange={(e) => set(i, { active: e.target.checked })} />
                Actif
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
                Code
                <input value={l.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} />
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
                Libellé
                <input value={l.labelFr} maxLength={120} onChange={(e) => set(i, { labelFr: e.target.value })} />
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
                Note plafonnée à
                <select value={l.cap} onChange={(e) => set(i, { cap: e.target.value })}>
                  {Array.from({ length: 10 }, (_, k) => String(k + 1)).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
                Revue tous les (jours)
                <input inputMode="numeric" value={l.reviewDays} onChange={(e) => set(i, { reviewDays: Number(e.target.value) || 0 })} />
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
                Renotation sous (jours)
                <input inputMode="numeric" value={l.renotationDays} onChange={(e) => set(i, { renotationDays: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <input aria-label="Critères d'inscription" placeholder="Critères d'inscription à ce niveau" value={l.helpFr ?? ""} maxLength={500} onChange={(e) => set(i, { helpFr: e.target.value || undefined })} />
          </div>
        ))}
        <div>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setList((x) => [...x, { code: `WL${x.length + 1}`, labelFr: "", cap: "9", reviewDays: 30, renotationDays: 30, active: true }])}>
            + Ajouter un niveau
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
                const r = await saveWatchlistLevelsAction(list);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer les niveaux"}
          </button>
        </div>
      )}
    </section>
  );
}
