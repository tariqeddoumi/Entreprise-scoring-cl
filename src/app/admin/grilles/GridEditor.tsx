"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Segment } from "@/core/types";
import type { CriterionParams, ModelParams, NewCriterionParams, Thresholds } from "@/reference/model-params";
import { deleteGridVersionAction, saveGridVersionAction } from "./actions";

export interface GridMeta {
  modelId: string;
  baseVersion: string;
  labelFr: string;
  segments: Segment[];
  domains: Array<{ code: string; labelFr: string }>;
  criteria: Array<{
    code: string;
    domainCode: string;
    type: "QUANTITATIVE" | "QUALITATIVE";
    unit: string;
    direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
    editableBins: boolean;
  }>;
  rules: Array<{ code: string; labelFr: string; criterion: string | null }>;
  reviews: Array<{ criterion: string; labelFr: string }>;
  grades: string[];
  concentrationCapBps: number;
}

interface Row {
  version: string;
  effectiveFrom: string;
  labelFr: string;
  noteFr: string;
  createdBy: string;
  state: string;
  params: ModelParams;
}

const STATE_LABELS: Record<string, string> = { EN_VIGUEUR: "En vigueur", A_VENIR: "À venir", REMPLACEE: "Remplacée" };
const ANCHOR_SCORES = [100, 75, 50, 25, 0];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const pct = (bps: number | undefined) => ((bps ?? 0) / 100).toFixed(2);
const toBps = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const num = (v: string) => Number(v.replace(",", "."));

function emptyNew(meta: GridMeta): NewCriterionParams {
  return {
    code: "",
    domainCode: meta.domains[0]?.code ?? "",
    type: "QUALITATIVE",
    labelFr: "",
    weightsBps: Object.fromEntries(meta.segments.map((s) => [s, 0])),
    critical: false,
    unavailableScore: 0,
    anchors: ["", "", "", "", ""],
    direction: "HIGHER_IS_BETTER",
    unit: "",
    thresholds: { ALL: [0, 0, 0, 0] },
  };
}

export function GridEditor({
  meta,
  readOnly,
  today,
  current,
  currentParams,
  versions,
}: {
  meta: GridMeta;
  readOnly: boolean;
  today: string;
  current: { version: string; effectiveFrom: string; labelFr: string } | null;
  currentParams: ModelParams;
  versions: Row[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ replacing?: string } | null>(null);
  const [p, setP] = useState<ModelParams>(clone(currentParams));
  const [id, setId] = useState({ version: "", effectiveFrom: today, labelFr: "", noteFr: "" });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<NewCriterionParams | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: string; error?: string; issues?: string[] } | null>(null);

  const removed = useMemo(() => new Set(p.removed), [p.removed]);
  const totals = useMemo(() => {
    const t: Record<string, number> = Object.fromEntries(meta.segments.map((s) => [s, 0]));
    for (const c of meta.criteria) {
      if (removed.has(c.code)) continue;
      for (const s of meta.segments) t[s] += p.criteria[c.code]?.weightsBps[s] ?? 0;
    }
    for (const a of p.added) for (const s of meta.segments) t[s] += a.weightsBps[s] ?? 0;
    return t;
  }, [p, meta, removed]);

  function startEdit(base: ModelParams, replacing?: Row) {
    setP(clone(base));
    const year = new Date().getFullYear();
    const n = versions.filter((v) => v.version.startsWith(`${meta.modelId}-P${year}.`)).length + 1;
    setId(
      replacing
        ? { version: replacing.version, effectiveFrom: replacing.effectiveFrom, labelFr: replacing.labelFr, noteFr: replacing.noteFr }
        : { version: `${meta.modelId}-P${year}.${n}`, effectiveFrom: today, labelFr: "", noteFr: "" }
    );
    setEditing({ replacing: replacing?.version });
    setResult(null);
  }

  const setCrit = (code: string, f: (c: CriterionParams) => void) =>
    setP((prev) => {
      const next = clone(prev);
      f(next.criteria[code]);
      return next;
    });

  function save() {
    setResult(null);
    start(async () => {
      const res = await saveGridVersionAction({
        version: { ...id, modelId: meta.modelId, baseVersion: meta.baseVersion, params: p },
        replacing: editing?.replacing,
      });
      if (res.errorFr) setResult({ error: res.errorFr, issues: res.issues });
      else {
        setResult({ ok: res.okFr });
        setEditing(null);
        router.refresh();
      }
    });
  }

  function remove(version: string) {
    if (!window.confirm(`Retirer la version ${version}, qui n'est pas encore en vigueur ?`)) return;
    start(async () => {
      const res = await deleteGridVersionAction(version);
      setResult(res.errorFr ? { error: res.errorFr } : { ok: res.okFr });
      router.refresh();
    });
  }

  const thresholdInputs = (code: string, c: CriterionParams, disabled: boolean) => (
    <div style={{ display: "grid", gap: 6 }}>
      {Object.entries(c.thresholds ?? {}).map(([seg, t]) => (
        <div key={seg} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12, minWidth: 56 }}>
            {seg === "ALL" ? "Tous" : seg}
          </span>
          {ANCHOR_SCORES.slice(0, 4).map((score, i) => (
            <label key={score} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
              {score}
              <input
                type="number"
                step="any"
                disabled={disabled}
                aria-label={`${code} — seuil ${score} — ${seg}`}
                value={(t as Thresholds)[i]}
                onChange={(e) =>
                  setCrit(code, (x) => {
                    (x.thresholds![seg as Segment | "ALL"] as Thresholds)[i] = num(e.target.value);
                  })
                }
                style={{ width: 84 }}
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );

  const anchorInputs = (code: string, anchors: string[], onChange: (i: number, v: string) => void, disabled: boolean) => (
    <div style={{ display: "grid", gap: 6 }}>
      {anchors.map((a, i) => (
        <label key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 6, alignItems: "center", fontSize: 12 }}>
          <strong>{ANCHOR_SCORES[i]}</strong>
          <input value={a} disabled={disabled} aria-label={`${code} — repère ${ANCHOR_SCORES[i]}`} onChange={(e) => onChange(i, e.target.value)} />
        </label>
      ))}
    </div>
  );

  const view = editing ? p : currentParams;
  const ro = readOnly || !editing;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 6 }}>
          {meta.modelId} — {current ? `paramètres ${current.version}` : `grille embarquée ${meta.baseVersion}`}
        </h2>
        <p className="muted" style={{ fontSize: 13 }}>
          {meta.labelFr}.{" "}
          {current
            ? `Version en vigueur depuis le ${current.effectiveFrom} : ${current.labelFr}.`
            : "Aucune version de paramètres : la grille embarquée s'applique."}{" "}
          Plafond de concentration d&apos;un critère : {pct(meta.concentrationCapBps)} %.
        </p>
        {versions.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Date d&apos;effet</th>
                  <th>État</th>
                  <th>Libellé et motif</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.version}>
                    <td className="nowrap">
                      <strong>{v.version}</strong>
                    </td>
                    <td className="nowrap">{v.effectiveFrom}</td>
                    <td>{STATE_LABELS[v.state] ?? v.state}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {v.labelFr}
                      {v.noteFr ? ` — ${v.noteFr}` : ""}
                      {v.createdBy ? ` (${v.createdBy})` : ""}
                    </td>
                    <td className="nowrap">
                      {!readOnly && v.state === "A_VENIR" && (
                        <>
                          <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => startEdit(v.params, v)}>
                            Modifier
                          </button>{" "}
                          <button type="button" className="btn-danger" style={{ fontSize: 12 }} disabled={pending} onClick={() => remove(v.version)}>
                            Retirer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly && !editing && (
          <button type="button" className="btn-primary" style={{ marginTop: 12 }} onClick={() => startEdit(currentParams)}>
            + Nouvelle version des paramètres
          </button>
        )}
        {readOnly && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Lecture seule : seul un administrateur du groupe publie une version de paramètres.
          </p>
        )}
        {result?.ok && (
          <p role="status" style={{ color: "var(--good)", fontSize: 13, marginTop: 8 }}>
            {result.ok}
          </p>
        )}
      </section>

      {editing && (
        <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <h2 style={{ fontWeight: 600 }}>{editing.replacing ? `Modifier la version à venir ${editing.replacing}` : "Nouvelle version des paramètres"}</h2>
          <div className="grid-fields">
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Identifiant de version *</div>
              <input value={id.version} maxLength={48} onChange={(e) => setId({ ...id, version: e.target.value })} disabled={!!editing.replacing} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Date d&apos;effet * (aujourd&apos;hui au plus tôt)</div>
              <input type="date" min={today} value={id.effectiveFrom} onChange={(e) => setId({ ...id, effectiveFrom: e.target.value })} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Libellé *</div>
              <input value={id.labelFr} maxLength={120} onChange={(e) => setId({ ...id, labelFr: e.target.value })} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Motif (comité, référence)</div>
              <input value={id.noteFr} maxLength={300} onChange={(e) => setId({ ...id, noteFr: e.target.value })} />
            </label>
          </div>
        </section>
      )}

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }} aria-label="Critères">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ fontWeight: 600 }}>Critères et poids</h2>
          {meta.segments.map((s) => (
            <span
              key={s}
              role="status"
              style={{ fontSize: 13, fontWeight: 700, color: totals[s] === 10000 ? "var(--good)" : "var(--bad)" }}
            >
              {s} : {pct(totals[s])} %
            </span>
          ))}
          <span className="muted" style={{ fontSize: 12 }}>
            Somme exigée : 100,00 % par segment.
          </span>
        </div>
        {meta.domains.map((d) => {
          const crits = meta.criteria.filter((c) => c.domainCode === d.code);
          const added = view.added.filter((a) => a.domainCode === d.code);
          const dom = Object.fromEntries(
            meta.segments.map((s) => [
              s,
              crits.filter((c) => !view.removed.includes(c.code)).reduce((acc, c) => acc + (view.criteria[c.code]?.weightsBps[s] ?? 0), 0) +
                added.reduce((acc, a) => acc + (a.weightsBps[s] ?? 0), 0),
            ])
          );
          return (
            <details key={d.code} open={!!open[d.code]} onToggle={(e) => setOpen({ ...open, [d.code]: (e.target as HTMLDetailsElement).open })}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0" }}>
                {d.code} — {d.labelFr}{" "}
                <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
                  ({meta.segments.map((s) => `${s} ${pct(dom[s])} %`).join(" · ")})
                </span>
              </summary>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Libellé</th>
                      <th>Critique</th>
                      <th>Si absente</th>
                      {meta.segments.map((s) => (
                        <th key={s}>Poids {s} (%)</th>
                      ))}
                      <th>Barème ou repères</th>
                      <th>Retirer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crits.map((c) => {
                      const cp = view.criteria[c.code];
                      if (!cp) return null;
                      const off = view.removed.includes(c.code);
                      return (
                        <tr key={c.code} style={off ? { opacity: 0.5 } : undefined}>
                          <td className="nowrap">
                            <strong>{c.code}</strong>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {c.type === "QUANTITATIVE" ? `ratio${c.unit ? ` (${c.unit})` : ""}` : "qualitatif"}
                            </div>
                          </td>
                          <td style={{ minWidth: 220 }}>
                            <input value={cp.labelFr} disabled={ro || off} aria-label={`${c.code} — libellé`} onChange={(e) => setCrit(c.code, (x) => (x.labelFr = e.target.value))} />
                          </td>
                          <td>
                            <input type="checkbox" checked={cp.critical} disabled={ro || off} aria-label={`${c.code} — critique`} onChange={(e) => setCrit(c.code, (x) => (x.critical = e.target.checked))} style={{ width: "auto" }} />
                          </td>
                          <td>
                            <select
                              value={cp.unavailableScore}
                              disabled={ro || off || cp.critical}
                              aria-label={`${c.code} — score si absente`}
                              onChange={(e) => setCrit(c.code, (x) => (x.unavailableScore = Number(e.target.value) as CriterionParams["unavailableScore"]))}
                              style={{ width: 70 }}
                            >
                              {[0, 25, 50].map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </td>
                          {meta.segments.map((s) => (
                            <td key={s}>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                disabled={ro || off}
                                aria-label={`${c.code} — poids ${s}`}
                                value={pct(cp.weightsBps[s])}
                                onChange={(e) => setCrit(c.code, (x) => (x.weightsBps[s] = toBps(e.target.value)))}
                                style={{ width: 80 }}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ fontSize: 12 }}
                              onClick={() => setOpen({ ...open, [`b:${c.code}`]: !open[`b:${c.code}`] })}
                              aria-expanded={!!open[`b:${c.code}`]}
                            >
                              {c.type === "QUANTITATIVE" ? (c.editableBins ? "Seuils" : "Barème") : "Repères"}
                            </button>
                            {open[`b:${c.code}`] && (
                              <div style={{ marginTop: 8, minWidth: 360 }}>
                                {c.type === "QUANTITATIVE" ? (
                                  c.editableBins ? (
                                    <>
                                      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
                                        {c.direction === "HIGHER_IS_BETTER"
                                          ? "Plus haut = meilleur : score 100 à partir du premier seuil, puis 75, 50, 25 ; 0 en dessous du dernier."
                                          : "Plus bas = meilleur : score 100 jusqu'au premier seuil, puis 75, 50, 25 ; 0 au-delà du dernier."}
                                      </div>
                                      {thresholdInputs(c.code, cp, ro || off)}
                                    </>
                                  ) : (
                                    <span className="muted" style={{ fontSize: 12 }}>Barème non standard : modifiable par une nouvelle version de la grille.</span>
                                  )
                                ) : cp.anchors ? (
                                  anchorInputs(c.code, cp.anchors, (i, v) => setCrit(c.code, (x) => (x.anchors![i] = v)), ro || off)
                                ) : (
                                  <span className="muted" style={{ fontSize: 12 }}>Repères non standard.</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={off}
                              disabled={ro}
                              aria-label={`${c.code} — retirer`}
                              onChange={(e) =>
                                setP((prev) => ({
                                  ...prev,
                                  removed: e.target.checked ? [...prev.removed, c.code] : prev.removed.filter((x) => x !== c.code),
                                }))
                              }
                              style={{ width: "auto" }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {added.map((a) => (
                      <tr key={`new:${a.code}`}>
                        <td className="nowrap">
                          <strong>{a.code}</strong>
                          <div style={{ fontSize: 11, color: "var(--brand)" }}>ajouté</div>
                        </td>
                        <td>{a.labelFr}</td>
                        <td>{a.critical ? "oui" : "non"}</td>
                        <td>{a.critical ? "—" : a.unavailableScore}</td>
                        {meta.segments.map((s) => (
                          <td key={s}>{pct(a.weightsBps[s])}</td>
                        ))}
                        <td className="muted" style={{ fontSize: 12 }}>
                          {a.type === "QUALITATIVE" ? "5 repères" : `seuils ${Object.values(a.thresholds ?? {})[0]?.join(" / ")}`}
                        </td>
                        <td>
                          {!ro && (
                            <button
                              type="button"
                              className="btn-danger"
                              style={{ fontSize: 12 }}
                              onClick={() => setP((prev) => ({ ...prev, added: prev.added.filter((x) => x.code !== a.code) }))}
                            >
                              Supprimer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}

        {!ro && !adding && (
          <button type="button" className="btn-ghost" style={{ justifySelf: "start" }} onClick={() => setAdding(emptyNew(meta))}>
            + Ajouter un critère
          </button>
        )}
        {!ro && adding && (
          <div className="card" style={{ padding: 12, display: "grid", gap: 10, background: "var(--surface-2)" }}>
            <strong>Nouveau critère</strong>
            <div className="grid-fields">
              <label>
                <div className="muted" style={{ fontSize: 12 }}>Domaine</div>
                <select value={adding.domainCode} onChange={(e) => setAdding({ ...adding, domainCode: e.target.value })}>
                  {meta.domains.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.labelFr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12 }}>Code (ex. {meta.domains[0]?.code}.9)</div>
                <input value={adding.code} onChange={(e) => setAdding({ ...adding, code: e.target.value.toUpperCase() })} />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12 }}>Type</div>
                <select value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value as NewCriterionParams["type"] })}>
                  <option value="QUALITATIVE">Qualitatif (5 repères)</option>
                  <option value="QUANTITATIVE">Ratio (barème à 5 paliers)</option>
                </select>
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12 }}>Libellé</div>
                <input value={adding.labelFr} onChange={(e) => setAdding({ ...adding, labelFr: e.target.value })} />
              </label>
              {meta.segments.map((s) => (
                <label key={s}>
                  <div className="muted" style={{ fontSize: 12 }}>Poids {s} (%)</div>
                  <input type="number" step="0.01" min={0} value={pct(adding.weightsBps[s])} onChange={(e) => setAdding({ ...adding, weightsBps: { ...adding.weightsBps, [s]: toBps(e.target.value) } })} />
                </label>
              ))}
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={adding.critical} onChange={(e) => setAdding({ ...adding, critical: e.target.checked })} style={{ width: "auto" }} />
                Donnée critique
              </label>
            </div>
            {adding.type === "QUALITATIVE" ? (
              anchorInputs("Nouveau", adding.anchors ?? ["", "", "", "", ""], (i, v) => {
                const anchors = [...(adding.anchors ?? ["", "", "", "", ""])] as NewCriterionParams["anchors"];
                anchors![i] = v;
                setAdding({ ...adding, anchors });
              }, false)
            ) : (
              <div className="grid-fields">
                <label>
                  <div className="muted" style={{ fontSize: 12 }}>Sens</div>
                  <select value={adding.direction} onChange={(e) => setAdding({ ...adding, direction: e.target.value as NewCriterionParams["direction"] })}>
                    <option value="HIGHER_IS_BETTER">Plus haut = meilleur</option>
                    <option value="LOWER_IS_BETTER">Plus bas = meilleur</option>
                  </select>
                </label>
                <label>
                  <div className="muted" style={{ fontSize: 12 }}>Unité</div>
                  <input value={adding.unit ?? ""} onChange={(e) => setAdding({ ...adding, unit: e.target.value })} />
                </label>
                {ANCHOR_SCORES.slice(0, 4).map((score, i) => (
                  <label key={score}>
                    <div className="muted" style={{ fontSize: 12 }}>Seuil {score}</div>
                    <input
                      type="number"
                      step="any"
                      value={adding.thresholds?.ALL?.[i] ?? 0}
                      onChange={(e) => {
                        const t = [...(adding.thresholds?.ALL ?? [0, 0, 0, 0])] as Thresholds;
                        t[i] = num(e.target.value);
                        setAdding({ ...adding, thresholds: { ALL: t } });
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setP((prev) => ({ ...prev, added: [...prev.added.filter((x) => x.code !== adding.code), adding] }));
                  setOpen({ ...open, [adding.domainCode]: true });
                  setAdding(null);
                }}
                disabled={!adding.code || !adding.labelFr}
              >
                Ajouter à la version
              </button>
              <button type="button" className="btn-ghost" onClick={() => setAdding(null)}>
                Annuler
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Pensez à réduire d&apos;autant le poids d&apos;autres critères : la somme doit rester à 100 % par segment.
            </span>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ fontWeight: 600 }}>Exceptions et revues obligatoires</h2>
        {meta.rules.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Cette grille n&apos;a pas d&apos;exception non compensatoire.</p>}
        {meta.rules.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Exception</th>
                  <th>Classe plafond</th>
                  <th>Seuil de déclenchement</th>
                </tr>
              </thead>
              <tbody>
                {meta.rules.map((r) => {
                  const v = view.rules[r.code];
                  return (
                    <tr key={r.code}>
                      <td>
                        <strong>{r.code}</strong> — {r.labelFr}
                      </td>
                      <td>
                        <select
                          value={v?.maxGrade}
                          disabled={ro}
                          aria-label={`${r.code} — classe plafond`}
                          onChange={(e) => setP((prev) => ({ ...prev, rules: { ...prev.rules, [r.code]: { ...prev.rules[r.code], maxGrade: e.target.value } } }))}
                          style={{ width: 150 }}
                        >
                          {meta.grades.map((g) => (
                            <option key={g} value={g}>
                              au mieux {g}
                            </option>
                          ))}
                          <option value="NO_GRADE">aucune classe</option>
                        </select>
                      </td>
                      <td>
                        {r.criterion ? (
                          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                            {r.criterion} &lt;
                            <input
                              type="number"
                              step="any"
                              disabled={ro}
                              aria-label={`${r.code} — seuil`}
                              value={v?.threshold ?? ""}
                              onChange={(e) => setP((prev) => ({ ...prev, rules: { ...prev.rules, [r.code]: { ...prev.rules[r.code], threshold: num(e.target.value) } } }))}
                              style={{ width: 90 }}
                            />
                          </label>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>déclarée par l&apos;analyste</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {meta.reviews.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Revue obligatoire</th>
                  <th>Déclenchée sous</th>
                </tr>
              </thead>
              <tbody>
                {meta.reviews
                  .filter((r) => !view.removed.includes(r.criterion))
                  .map((r) => (
                    <tr key={r.criterion}>
                      <td>
                        <strong>{r.criterion}</strong> — {r.labelFr}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          disabled={ro}
                          aria-label={`${r.criterion} — seuil de revue`}
                          value={view.reviews[r.criterion] ?? ""}
                          onChange={(e) => setP((prev) => ({ ...prev, reviews: { ...prev.reviews, [r.criterion]: num(e.target.value) } }))}
                          style={{ width: 90 }}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ fontWeight: 600 }}>Couverture, confiance et support groupe</h2>
        <div className="grid-fields">
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Couverture observée minimale — globale (%)</div>
            <input type="number" step="1" min={0} max={100} disabled={ro} value={view.coverage.minGlobalObservedBps / 100} onChange={(e) => setP((prev) => ({ ...prev, coverage: { ...prev.coverage, minGlobalObservedBps: toBps(e.target.value) } }))} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Couverture observée minimale — par domaine (%)</div>
            <input type="number" step="1" min={0} max={100} disabled={ro} value={view.coverage.minDomainObservedBps / 100} onChange={(e) => setP((prev) => ({ ...prev, coverage: { ...prev.coverage, minDomainObservedBps: toBps(e.target.value) } }))} />
          </label>
          {(["completeness", "freshness", "reliability", "provenance"] as const).map((k) => (
            <label key={k}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Confiance — poids {{ completeness: "complétude", freshness: "fraîcheur", reliability: "fiabilité", provenance: "provenance" }[k]} (%)
              </div>
              <input type="number" step="1" min={0} max={100} disabled={ro} value={view.confidence.weights[k]} onChange={(e) => setP((prev) => ({ ...prev, confidence: { ...prev.confidence, weights: { ...prev.confidence.weights, [k]: Number(e.target.value) } } }))} />
            </label>
          ))}
          {(["A", "B", "C"] as const).map((k) => (
            <label key={k}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Classe de confiance {k} — score minimal</div>
              <input type="number" step="1" min={1} max={100} disabled={ro} value={view.confidence.classes[k]} onChange={(e) => setP((prev) => ({ ...prev, confidence: { ...prev.confidence, classes: { ...prev.confidence.classes, [k]: Number(e.target.value) } } }))} />
            </label>
          ))}
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Support groupe — crans maximum</div>
            <select disabled={ro} value={view.groupSupportMaxNotches} onChange={(e) => setP((prev) => ({ ...prev, groupSupportMaxNotches: Number(e.target.value) }))}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {editing && (
        <div className="card action-bar">
          <button type="button" className="btn-primary" disabled={pending} onClick={save}>
            {pending ? "Contrôle et enregistrement…" : "Enregistrer la version"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
            Annuler
          </button>
          {result?.error && (
            <div role="alert" style={{ color: "var(--bad)", fontSize: 13, flexBasis: "100%" }}>
              {result.error}
              {result.issues && (
                <ul style={{ paddingLeft: 18, listStyle: "disc", marginTop: 4 }}>
                  {result.issues.slice(0, 12).map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
