"use client";

import { useState, useTransition } from "react";
import { checkPurposes, type CasePurpose } from "@/reference/case-purposes";
import { savePurposesAction } from "./purposes-actions";

/** Motifs d'ouverture des dossiers (renouvellement annuel, investissement…). */
export function PurposesEditor({ initial, readOnly, creditTypes = [] }: { initial: CasePurpose[]; readOnly: boolean; creditTypes?: Array<{ code: string; labelFr: string }> }) {
  const [list, setList] = useState<CasePurpose[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkPurposes(list);
  const set = (i: number, patch: Partial<CasePurpose>) => setList((l) => l.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Motifs des dossiers</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Motif choisi à l&apos;ouverture de chaque dossier et consigné sur celui-ci (suivi et reporting). L&apos;exercice proposé par défaut
          peut être « suivant » (ex. renouvellement annuel : passage au dernier exercice clos) ou « conserver ». Un motif déjà utilisé se
          désactive au lieu d&apos;être supprimé.
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {list.map((p, i) => (
          <div key={i} style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
            <input type="checkbox" aria-label={`Motif actif — ${p.code}`} style={{ width: 16 }} checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} />
            <input aria-label="Code du motif" value={p.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} />
            <input aria-label="Libellé du motif" value={p.labelFr} maxLength={200} onChange={(e) => set(i, { labelFr: e.target.value })} />
            <select aria-label="Exercice proposé" value={p.defaultExercise ?? ""} onChange={(e) => set(i, { defaultExercise: (e.target.value || undefined) as CasePurpose["defaultExercise"] })}>
              <option value="">Exercice selon la date</option>
              <option value="SUIVANT">Exercice suivant si clos</option>
              <option value="CONSERVE">Conserver l&apos;exercice</option>
            </select>
            <select aria-label="Type de crédit proposé" value={p.defaultCreditType ?? ""} onChange={(e) => set(i, { defaultCreditType: e.target.value || undefined })}>
              <option value="">Type de crédit au choix</option>
              {creditTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.labelFr}
                </option>
              ))}
            </select>
            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setList((l) => l.filter((_, k) => k !== i))}>
              Retirer
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setList((l) => [...l, { code: "", labelFr: "", active: true }])}>
            + Ajouter un motif
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
                const r = await savePurposesAction(list);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer les motifs"}
          </button>
        </div>
      )}
    </section>
  );
}
