"use client";

import { useState, useTransition } from "react";
import { checkRefItems, type RefItem } from "@/reference/case-purposes";
import { saveRefListAction } from "./purposes-actions";
import type { EntryListKey } from "@/reference/entry-lists";

/** Liste paramétrable simple : types de crédit, catégories de délégation. */
export function RefListEditor({
  listKey,
  title,
  intro,
  initial,
  readOnly,
  withHelp = false,
}: {
  listKey: "CREDIT_TYPES" | "ENTITY_TIERS" | "COMMERCIAL_SEGMENTS" | EntryListKey;
  title: string;
  intro: string;
  initial: RefItem[];
  readOnly: boolean;
  withHelp?: boolean;
}) {
  const [list, setList] = useState<RefItem[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const issues = checkRefItems(list, title);
  const set = (i: number, patch: Partial<RefItem>) => setList((l) => l.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>{title}</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {intro}
        </p>
      </div>
      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {list.map((p, i) => (
          <div key={i} style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" style={{ width: 16 }} checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} />
              Actif
            </label>
            <input aria-label="Code" value={p.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} />
            <input aria-label="Libellé" value={p.labelFr} maxLength={200} onChange={(e) => set(i, { labelFr: e.target.value })} />
            {withHelp && <input aria-label="Critères d'attribution" value={p.helpFr ?? ""} maxLength={500} placeholder="Critères d'attribution" onChange={(e) => set(i, { helpFr: e.target.value || undefined })} />}
            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setList((l) => l.filter((_, k) => k !== i))}>
              Retirer
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setList((l) => [...l, { code: "", labelFr: "", active: true }])}>
            + Ajouter
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
                const r = await saveRefListAction(listKey, list);
                setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
              })
            }
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}
    </section>
  );
}
