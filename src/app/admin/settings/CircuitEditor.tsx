"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_STEPS,
  PERMISSIONS,
  PROFILE_FAMILIES,
  STEP_KIND_LABELS,
  WORKFLOW_ROLE_LABELS,
  WORKFLOW_ROLES,
  type Permission,
  type ProfileFamily,
  type StepKind,
  type WorkflowCircuit,
  type WorkflowRole,
  type WorkflowStep,
} from "@/reference/workflow";

interface Item {
  code: string;
  labelFr: string;
}

function Checks({ items, value, onChange, disabled, label }: { items: Item[]; value: string[]; onChange: (v: string[]) => void; disabled: boolean; label: string }) {
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}
      </legend>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {items.map((t) => (
          <label key={t.code} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              disabled={disabled}
              checked={value.includes(t.code)}
              onChange={(e) => onChange(e.target.checked ? [...value, t.code] : value.filter((k) => k !== t.code))}
            />
            {t.labelFr}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
import { saveCircuitAction, type CircuitActionState } from "./circuit-actions";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/**
 * Circuit de validation : fonctions, étapes ordonnées, fonctions habilitées,
 * rôle minimal et seuil d'exposition. Le circuit s'applique aux dossiers soumis
 * après l'enregistrement ; un dossier en cours garde le sien.
 */
export function CircuitEditor({
  circuit,
  stored,
  readOnly,
  holders,
  creditTypes = [],
  tiers = [],
}: {
  circuit: WorkflowCircuit;
  stored: boolean;
  readOnly: boolean;
  holders: Record<string, number>;
  creditTypes?: Item[];
  tiers?: Item[];
}) {
  const router = useRouter();
  const [c, setC] = useState<WorkflowCircuit>(clone(circuit));
  const [result, setResult] = useState<CircuitActionState | null>(null);
  const [pending, start] = useTransition();
  const ro = readOnly;

  const setStep = (i: number, f: (s: WorkflowStep) => void) =>
    setC((prev) => {
      const next = clone(prev);
      f(next.steps[i]);
      return next;
    });
  const move = (i: number, d: -1 | 1) =>
    setC((prev) => {
      const next = clone(prev);
      const j = i + d;
      if (j < 0 || j >= next.steps.length) return prev;
      [next.steps[i], next.steps[j]] = [next.steps[j], next.steps[i]];
      return next;
    });

  function save() {
    setResult(null);
    start(async () => {
      const r = await saveCircuitAction(c);
      setResult(r);
      if (r.okFr) router.refresh();
    });
  }

  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 14 }} aria-label="Circuit de validation">
      <div>
        <h2 style={{ fontWeight: 600 }}>Circuit de validation</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {stored ? `Circuit paramétré (version ${circuit.version}).` : "Circuit par défaut du Groupe Banque Populaire."} Le profil de saisie
          soumet ; chaque étape est traitée par une personne différente, qui détient la fonction et le rôle de l&apos;étape et n&apos;a pas
          contribué au dossier. Un <strong>avis</strong> (directeur du centre d&apos;affaires) est favorable ou défavorable, bloquant ou non —
          bloquant, par exemple, pour les centres en délégation encadrée ou restreinte. La <strong>décision</strong> revient à la
          contre-étude : plusieurs niveaux peuvent être prévus selon le montant, la note et le type de crédit ; seul le plus élevé qui
          s&apos;applique décide, les niveaux inférieurs instruisent. Une donnée inconnue applique l&apos;étape. Un dossier en cours garde le
          circuit de sa soumission.
        </p>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ fontWeight: 600, fontSize: 14 }}>Étapes ({c.steps.length})</h3>
        <ol style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
          {c.steps.map((s, i) => (
            <li key={i} className="card" style={{ padding: 12, background: "var(--surface-2)", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ minWidth: 70 }}>
                  Étape {i + 1} · {STEP_KIND_LABELS[s.kind ?? "VALIDATION"]}
                </strong>
                {!ro && (
                  <>
                    <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter l'étape ${i + 1}`}>
                      ↑
                    </button>
                    <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "3px 9px" }} onClick={() => move(i, 1)} disabled={i === c.steps.length - 1} aria-label={`Descendre l'étape ${i + 1}`}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ fontSize: 12, padding: "3px 9px" }}
                      disabled={c.steps.length <= 1}
                      onClick={() => setC((prev) => ({ ...prev, steps: prev.steps.filter((_, k) => k !== i) }))}
                    >
                      Retirer
                    </button>
                  </>
                )}
              </div>
              <div className="grid-fields">
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Libellé</div>
                  <input value={s.labelFr} disabled={ro} maxLength={80} aria-label={`Libellé de l'étape ${i + 1}`} onChange={(e) => setStep(i, (x) => (x.labelFr = e.target.value))} />
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Code</div>
                  <input value={s.code} disabled={ro} maxLength={32} aria-label={`Code de l'étape ${i + 1}`} onChange={(e) => setStep(i, (x) => (x.code = e.target.value.toUpperCase()))} />
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Rôle minimal</div>
                  <select value={s.minRole} disabled={ro} aria-label={`Rôle minimal de l'étape ${i + 1}`} onChange={(e) => setStep(i, (x) => (x.minRole = e.target.value as WorkflowRole))}>
                    {WORKFLOW_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {WORKFLOW_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Nature</div>
                  <select
                    value={s.kind ?? "VALIDATION"}
                    disabled={ro}
                    aria-label={`Nature de l'étape ${i + 1}`}
                    onChange={(e) =>
                      setStep(i, (x) => {
                        x.kind = e.target.value as StepKind;
                        if (x.kind !== "AVIS") {
                          delete x.blocking;
                          delete x.blockingTiers;
                        } else x.blocking = x.blocking ?? false;
                      })
                    }
                  >
                    {(Object.keys(STEP_KIND_LABELS) as StepKind[]).map((k) => (
                      <option key={k} value={k}>
                        {STEP_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Condition : note égale ou moins bonne que</div>
                  <select
                    value={s.minGrade ?? ""}
                    disabled={ro}
                    aria-label={`Condition de note de l'étape ${i + 1}`}
                    onChange={(e) => setStep(i, (x) => (x.minGrade = e.target.value === "" ? null : Number(e.target.value)))}
                  >
                    <option value="">— (toute note)</option>
                    {Array.from({ length: 10 }, (_, k) => k + 1).map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                    <option value={11}>Défaut (DEF)</option>
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Conditions combinées</div>
                  <select value={s.conditionMode ?? "ANY"} disabled={ro} aria-label={`Combinaison des conditions de l'étape ${i + 1}`} onChange={(e) => setStep(i, (x) => (x.conditionMode = e.target.value as "ANY" | "ALL"))}>
                    <option value="ANY">L&apos;une suffit</option>
                    <option value="ALL">Toutes</option>
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Condition : exposition au-delà de (MAD, vide = sans condition)</div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    disabled={ro}
                    aria-label={`Seuil d'exposition de l'étape ${i + 1}`}
                    value={s.aboveExposure ?? ""}
                    onChange={(e) => setStep(i, (x) => (x.aboveExposure = e.target.value === "" ? null : Number(e.target.value)))}
                  />
                </label>
              </div>
              {creditTypes.length > 0 && (
                <Checks label="Condition : types de crédit (aucun coché : tous)" items={creditTypes} value={s.creditTypes ?? []} disabled={ro} onChange={(v) => setStep(i, (x) => (x.creditTypes = v))} />
              )}
              {tiers.length > 0 && (
                <Checks label="Condition : catégorie de délégation du centre (aucune cochée : toutes)" items={tiers} value={s.tiers ?? []} disabled={ro} onChange={(v) => setStep(i, (x) => (x.tiers = v))} />
              )}
              {s.kind === "AVIS" && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" style={{ width: "auto" }} disabled={ro} checked={!!s.blocking} onChange={(e) => setStep(i, (x) => (x.blocking = e.target.checked))} />
                    Avis bloquant pour tous les centres
                  </label>
                  {tiers.length > 0 && (
                    <Checks label="Avis bloquant pour les centres de catégorie" items={tiers} value={s.blockingTiers ?? []} disabled={ro} onChange={(v) => setStep(i, (x) => (x.blockingTiers = v))} />
                  )}
                </div>
              )}
              <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  Fonctions habilitées (aucune cochée : toute fonction, selon le rôle)
                </legend>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {c.functions.map((f) => (
                    <label key={f.code} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        disabled={ro}
                        checked={s.functions.includes(f.code)}
                        onChange={(e) =>
                          setStep(i, (x) => {
                            x.functions = e.target.checked ? [...x.functions, f.code] : x.functions.filter((k) => k !== f.code);
                          })
                        }
                      />
                      {f.labelFr}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          ))}
        </ol>
        {!ro && c.steps.length < MAX_STEPS && (
          <button
            type="button"
            className="btn-ghost"
            style={{ justifySelf: "start" }}
            onClick={() =>
              setC((prev) => ({ ...prev, steps: [...prev.steps, { code: `ETAPE_${prev.steps.length + 1}`, labelFr: "Nouvelle étape", functions: [], minRole: "RISK_MANAGER", aboveExposure: null, kind: "DECISION" }] }))
            }
          >
            + Ajouter une étape
          </button>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ fontWeight: 600, fontSize: 14 }}>Profils métier (fonctions) et droits</h3>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Profil</th>
                <th>Droits</th>
                <th>Peut soumettre</th>
                <th>Comptes actifs</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {c.functions.map((f, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={f.code}
                      disabled={ro || (holders[f.code] ?? 0) > 0}
                      maxLength={32}
                      aria-label={`Code de la fonction ${i + 1}`}
                      onChange={(e) =>
                        setC((prev) => {
                          const next = clone(prev);
                          const old = next.functions[i].code;
                          const code = e.target.value.toUpperCase();
                          next.functions[i].code = code;
                          next.steps.forEach((st) => (st.functions = st.functions.map((k) => (k === old ? code : k))));
                          next.submitFunctions = next.submitFunctions.map((k) => (k === old ? code : k));
                          return next;
                        })
                      }
                      style={{ width: 170 }}
                    />
                  </td>
                  <td>
                    <input
                      value={f.labelFr}
                      disabled={ro}
                      maxLength={80}
                      aria-label={`Libellé de la fonction ${i + 1}`}
                      onChange={(e) =>
                        setC((prev) => {
                          const next = clone(prev);
                          next.functions[i].labelFr = e.target.value;
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={f.profile ?? ""}
                      disabled={ro}
                      aria-label={`Profil de la fonction ${f.labelFr}`}
                      onChange={(e) =>
                        setC((prev) => {
                          const next = clone(prev);
                          if (e.target.value) next.functions[i].profile = e.target.value as ProfileFamily;
                          else delete next.functions[i].profile;
                          return next;
                        })
                      }
                    >
                      <option value="">—</option>
                      {(Object.keys(PROFILE_FAMILIES) as ProfileFamily[]).map((p) => (
                        <option key={p} value={p}>
                          {PROFILE_FAMILIES[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: 2 }}>
                      {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                        <label key={p} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }} title={PERMISSIONS[p]}>
                          <input
                            type="checkbox"
                            style={{ width: "auto" }}
                            disabled={ro}
                            checked={f.permissions?.includes(p) ?? false}
                            onChange={(e) =>
                              setC((prev) => {
                                const next = clone(prev);
                                const cur = next.functions[i].permissions ?? [];
                                next.functions[i].permissions = e.target.checked ? [...cur, p] : cur.filter((k) => k !== p);
                                return next;
                              })
                            }
                          />
                          {PERMISSIONS[p]}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      style={{ width: "auto" }}
                      disabled={ro}
                      aria-label={`${f.labelFr} peut soumettre`}
                      checked={c.submitFunctions.includes(f.code)}
                      onChange={(e) =>
                        setC((prev) => ({
                          ...prev,
                          submitFunctions: e.target.checked ? [...prev.submitFunctions, f.code] : prev.submitFunctions.filter((k) => k !== f.code),
                        }))
                      }
                    />
                  </td>
                  <td className="muted">{holders[f.code] ?? 0}</td>
                  <td>
                    {!ro && (
                      <button
                        type="button"
                        className="btn-danger"
                        style={{ fontSize: 12, padding: "3px 9px" }}
                        disabled={(holders[f.code] ?? 0) > 0}
                        title={(holders[f.code] ?? 0) > 0 ? "Fonction attribuée à des comptes actifs" : undefined}
                        onClick={() =>
                          setC((prev) => ({
                            ...prev,
                            functions: prev.functions.filter((_, k) => k !== i),
                            steps: prev.steps.map((st) => ({ ...st, functions: st.functions.filter((k) => k !== f.code) })),
                            submitFunctions: prev.submitFunctions.filter((k) => k !== f.code),
                          }))
                        }
                      >
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          « Peut soumettre » : aucune case cochée, toute personne habilitée à noter soumet. Un compte porte une seule fonction, donc un seul
          profil : le cumul saisie et contre-étude, ou saisie et surveillance, est impossible par construction. La fonction de chaque compte
          s&apos;attribue dans Administration › Utilisateurs.
        </p>
        {!ro && (
          <button
            type="button"
            className="btn-ghost"
            style={{ justifySelf: "start" }}
            onClick={() => setC((prev) => ({ ...prev, functions: [...prev.functions, { code: `FONCTION_${prev.functions.length + 1}`, labelFr: "Nouvelle fonction" }] }))}
          >
            + Ajouter une fonction
          </button>
        )}
      </div>

      {!ro && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn-primary" disabled={pending} onClick={save}>
            {pending ? "Contrôle et enregistrement…" : "Enregistrer le circuit"}
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => setC(clone(circuit))}>
            Annuler les modifications
          </button>
        </div>
      )}
      {result?.okFr && (
        <p role="status" style={{ color: "var(--good)", fontSize: 13 }}>
          {result.okFr}
        </p>
      )}
      {result?.errorFr && (
        <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {result.errorFr}
          {result.issues && (
            <ul style={{ paddingLeft: 18, listStyle: "disc", marginTop: 4 }}>
              {result.issues.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
