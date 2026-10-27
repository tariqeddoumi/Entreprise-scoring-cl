"use client";

import { useActionState } from "react";
import type { SettingDef } from "@/lib/settings";
import { settingsAction, type SettingsActionState } from "./actions";

export function SettingsForm({
  defs,
  values,
  readOnly,
}: {
  defs: SettingDef[];
  values: Record<string, string>;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(settingsAction, {});
  const groups = [...new Set(defs.map((d) => d.group))];

  return (
    <form action={formAction} style={{ display: "grid", gap: 18 }}>
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
      {readOnly && (
        <p className="muted">Consultation seule : la modification est réservée à un administrateur du groupe.</p>
      )}
      {groups.map((g) => (
        <section key={g} className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 12 }}>{g}</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {defs
              .filter((d) => d.group === g)
              .map((d) => (
                <label key={d.key} style={{ display: "grid", gap: 4, maxWidth: 720 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{d.labelFr}</span>
                  {d.kind === "boolean" ? (
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name={d.key}
                        defaultChecked={values[d.key] === "true"}
                        disabled={readOnly}
                        style={{ width: 16 }}
                      />
                      <span style={{ fontSize: 13 }}>Activé</span>
                    </span>
                  ) : d.kind === "enum" ? (
                    <select name={d.key} defaultValue={values[d.key]} disabled={readOnly} style={{ maxWidth: 360 }}>
                      {d.options?.map((o) => (
                        <option key={o} value={o}>
                          {d.optionLabels?.[o] ?? o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name={d.key}
                      defaultValue={values[d.key]}
                      disabled={readOnly}
                      inputMode={d.kind === "integer" ? "numeric" : undefined}
                      style={{ maxWidth: 360 }}
                    />
                  )}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {d.helpFr}
                  </span>
                </label>
              ))}
          </div>
        </section>
      ))}
      {!readOnly && (
        <div>
          <button
            type="submit"
            disabled={pending}
            style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 600 }}
          >
            Enregistrer le paramétrage
          </button>
        </div>
      )}
    </form>
  );
}
