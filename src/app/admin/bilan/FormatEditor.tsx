"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { POSTES, SECTION_LABELS, type PosteSection } from "@/financials/chart";
import { INDICATOR_GROUP_LABELS, presetNeeds, type IndicatorMeta } from "@/financials/compute";
import { FormulaError, parseFormula } from "@/financials/formula";
import {
  checkFormat,
  DEFAULT_ALERTS,
  FORMULA_VARIABLES,
  formatPostes,
  POSTE_MODE_LABELS,
  posteMode,
  PRESET_LABELS,
  presetPostes,
  type AlertRule,
  type Appreciation,
  type CustomIndicator,
  type FormatPreset,
  type PosteMode,
  type StatementFormat,
} from "@/financials/statement-format";
import { deleteFormatVersionAction, saveFormatVersionAction } from "./actions";

type Row = StatementFormat & { state: string };
type Tab = "postes" | "indicateurs" | "alertes" | "synthese";

const STATE_LABELS: Record<string, string> = { EN_VIGUEUR: "En vigueur", A_VENIR: "À venir", REMPLACEE: "Remplacée" };
const SECTIONS = Object.keys(SECTION_LABELS) as PosteSection[];
const UNITS = ["MAD", "%", "x", "j"] as const;
const GROUPS = Object.keys(INDICATOR_GROUP_LABELS) as Array<keyof typeof INDICATOR_GROUP_LABELS>;

function nextVersionId(versions: Row[]): string {
  const year = new Date().getFullYear();
  const n = versions.filter((v) => v.version.startsWith(`FORMAT-BILAN-${year}.`)).length + 1;
  return `FORMAT-BILAN-${year}.${n}`;
}

const num = (s: string): number | undefined => {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

function formulaError(src: string): string | null {
  if (!src.trim()) return "Formule vide.";
  try {
    parseFormula(src);
    return null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : "Formule illisible.";
  }
}

function summary(f: StatementFormat) {
  const postes = formatPostes(f);
  return {
    inputs: postes.filter((p) => p.input).length,
    saisis: postes.filter((p) => p.input && p.kind === "TOTAL").length,
    extra: f.extraPostes.length,
    custom: f.customIndicators.length,
    alerts: f.alerts.filter((a) => a.active).length,
  };
}

export function FormatEditor({
  readOnly,
  today,
  versions,
  current,
  catalog,
  gridUses,
  gridDeps,
  modelIds,
}: {
  readOnly: boolean;
  today: string;
  versions: Row[];
  current: StatementFormat;
  catalog: IndicatorMeta[];
  gridUses: Record<string, string[]>;
  gridDeps: Record<string, string[]>;
  modelIds: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ draft: StatementFormat; replacing?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("postes");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warnings?: string[] } | null>(null);
  const s = summary(current);

  function edit(base: StatementFormat, replacing?: string) {
    const copy = JSON.parse(JSON.stringify(base)) as StatementFormat;
    delete copy.createdBy;
    delete copy.createdAt;
    if (!replacing) {
      copy.version = nextVersionId(versions);
      copy.effectiveFrom = today;
    }
    setEditing({ draft: copy, replacing });
    setMsg(null);
    setTab("postes");
  }

  function remove(version: string) {
    if (!window.confirm(`Retirer la version ${version}, qui n'est pas encore en vigueur ?`)) return;
    start(async () => {
      const r = await deleteFormatVersionAction(version);
      setMsg(r.errorFr ? { error: r.errorFr } : { ok: r.okFr });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Format en vigueur — {current.version}</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          {current.labelFr} · depuis le {current.effectiveFrom}
          {current.noteFr ? ` · ${current.noteFr}` : ""}
        </p>
        <ul style={{ fontSize: 13, marginTop: 8, paddingLeft: 18, display: "grid", gap: 2 }}>
          <li>
            {s.inputs} poste(s) à charger sur {POSTES.length} au plan de la banque, dont {s.saisis} total(aux) saisi(s) directement
            {s.extra ? ` et ${s.extra} poste(s) propre(s) à la banque` : ""}.
          </li>
          <li>
            {catalog.length + s.custom} indicateurs calculés{s.custom ? `, dont ${s.custom} défini(s) par formule` : ""} ; {s.alerts} alerte(s)
            active(s).
          </li>
        </ul>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Versions</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date d&apos;effet</th>
                <th>État</th>
                <th>Libellé</th>
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
                  <td>{STATE_LABELS[v.state]}</td>
                  <td>
                    {v.labelFr}
                    {v.createdBy ? <div className="muted" style={{ fontSize: 11 }}>par {v.createdBy}</div> : null}
                  </td>
                  <td className="nowrap" style={{ textAlign: "right" }}>
                    {!readOnly && (
                      <>
                        <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => edit(v)}>
                          Nouvelle version à partir de celle-ci
                        </button>
                        {v.state === "A_VENIR" && (
                          <>
                            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => edit(v, v.version)}>
                              Modifier
                            </button>
                            <button type="button" className="btn-danger" style={{ fontSize: 12 }} disabled={pending} onClick={() => remove(v.version)}>
                              Retirer
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {readOnly && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Lecture seule : le format relève de l&apos;administrateur du groupe.</p>}
      </section>

      {msg && !editing && (
        <div role={msg.error ? "alert" : "status"} style={{ color: msg.error ? "var(--bad)" : "var(--good)", fontSize: 13 }}>
          {msg.error ?? msg.ok}
        </div>
      )}

      {editing && (
        <Editor
          key={editing.replacing ?? editing.draft.version}
          initial={editing.draft}
          replacing={editing.replacing}
          catalog={catalog}
          gridUses={gridUses}
          gridDeps={gridDeps}
          modelIds={modelIds}
          tab={tab}
          setTab={setTab}
          onCancel={() => setEditing(null)}
          onSaved={(r) => {
            setMsg(r);
            if (r.ok) {
              setEditing(null);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function Editor({
  initial,
  replacing,
  catalog,
  gridUses,
  gridDeps,
  modelIds,
  tab,
  setTab,
  onCancel,
  onSaved,
}: {
  initial: StatementFormat;
  replacing?: string;
  catalog: IndicatorMeta[];
  gridUses: Record<string, string[]>;
  gridDeps: Record<string, string[]>;
  modelIds: string[];
  tab: Tab;
  setTab: (t: Tab) => void;
  onCancel: () => void;
  onSaved: (r: { ok?: string; error?: string; warnings?: string[] }) => void;
}) {
  const [d, setD] = useState<StatementFormat>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<StatementFormat>) => setD((x) => ({ ...x, ...patch }));
  const builtIn = catalog.map((c) => c.key);
  const check = useMemo(() => checkFormat(d, builtIn, new Map(Object.entries(gridDeps))), [d, builtIn, gridDeps]);

  // Poste → ratios de la grille qui le lisent.
  const usedBy = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [indicator, deps] of Object.entries(gridDeps)) {
      for (const k of deps) m.set(k, [...(m.get(k) ?? []), ...(gridUses[indicator] ?? [])]);
    }
    return m;
  }, [gridDeps, gridUses]);

  function applyPreset(p: FormatPreset) {
    set({ postes: presetPostes(p, presetNeeds(d, modelIds)) });
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await saveFormatVersionAction(JSON.stringify(d), replacing);
      if (r.errorFr) setError(r.errorFr);
      onSaved({ ok: r.okFr, error: r.errorFr, warnings: r.warnings });
    });
  }

  const metas: IndicatorMeta[] = [
    ...catalog,
    ...d.customIndicators.map((c) => ({ key: c.key, labelFr: c.labelFr || c.key, unit: c.unit, group: c.group, formulaFr: c.formula, custom: true })),
  ];
  const setAp = (key: string, patch: Partial<Appreciation>) => {
    const prev = d.appreciations[key] ?? { sens: "HAUSSE" as const };
    const next = { ...prev, ...patch };
    (Object.keys(next) as Array<keyof Appreciation>).forEach((k) => next[k] === undefined && delete next[k]);
    set({ appreciations: { ...d.appreciations, [key]: next } });
  };
  const setCustom = (i: number, patch: Partial<CustomIndicator>) => set({ customIndicators: d.customIndicators.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const setAlert = (i: number, patch: Partial<AlertRule>) => set({ alerts: d.alerts.map((a, k) => (k === i ? { ...a, ...patch } : a)) });

  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 14, minWidth: 0 }}>
      <h2 style={{ fontWeight: 600 }}>{replacing ? `Modifier la version ${replacing}` : "Nouvelle version du format"}</h2>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
          Identifiant de version
          <input value={d.version} disabled={!!replacing} onChange={(e) => set({ version: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, display: "grid", gap: 4 }}>
          Date d&apos;effet
          <input type="date" value={d.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, display: "grid", gap: 4, gridColumn: "1 / -1" }}>
          Libellé
          <input value={d.labelFr} maxLength={200} onChange={(e) => set({ labelFr: e.target.value })} />
        </label>
        <label style={{ fontSize: 12, display: "grid", gap: 4, gridColumn: "1 / -1" }}>
          Motif du changement
          <input value={d.noteFr ?? ""} maxLength={500} placeholder="ex. passage au bilan agrégé pour les TPE, décision du comité du …" onChange={(e) => set({ noteFr: e.target.value || undefined })} />
        </label>
      </div>

      <nav className="tabs" aria-label="Parties du format">
        {(
          [
            ["postes", "Postes à charger"],
            ["indicateurs", "Indicateurs et appréciation"],
            ["alertes", "Alertes"],
            ["synthese", "Synthèse"],
          ] as Array<[Tab, string]>
        ).map(([k, l]) => (
          <button key={k} type="button" className="btn-ghost" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </nav>

      {tab === "postes" && (
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Partir d&apos;un préréglage</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(PRESET_LABELS) as FormatPreset[]).map((p) => (
                <button key={p} type="button" className="btn-ghost" style={{ fontSize: 12, textAlign: "left" }} onClick={() => applyPreset(p)}>
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              « Non chargé » : le poste n&apos;est plus demandé (saisie, gabarit Excel, lecture du bilan). « Saisi directement » : le total
              se saisit tel qu&apos;il figure sur le bilan ; son détail devient facultatif. Les préréglages gardent toujours les postes des
              ratios de la grille et des alertes actives.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Mode</th>
                  <th>Utilisé par la grille</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((sec) => [
                  <tr key={sec}>
                    <th colSpan={3} style={{ textAlign: "left", background: "var(--surface-2)" }}>
                      {SECTION_LABELS[sec]}
                    </th>
                  </tr>,
                  ...POSTES.filter((p) => p.section === sec).map((p) => {
                    const mode = posteMode(d, p.key);
                    const options: PosteMode[] = p.kind === "TOTAL" ? ["CALCULE", "SAISI", "MASQUE"] : ["CHARGE", "MASQUE"];
                    const uses = usedBy.get(p.key) ?? [];
                    return (
                      <tr key={p.key} style={{ opacity: mode === "MASQUE" ? 0.55 : 1 }}>
                        <td style={{ fontWeight: p.kind === "TOTAL" ? 600 : 400, paddingLeft: p.kind === "DETAIL" ? 24 : undefined }} title={p.hintFr}>
                          {p.labelFr}
                          <div className="muted" style={{ fontSize: 11 }}>{p.key}</div>
                        </td>
                        <td>
                          <select
                            aria-label={`Mode — ${p.labelFr}`}
                            value={mode}
                            onChange={(e) => {
                              const postes = { ...d.postes };
                              const v = e.target.value as PosteMode;
                              if (v === "CHARGE" || v === "CALCULE") delete postes[p.key];
                              else postes[p.key] = v;
                              set({ postes });
                            }}
                          >
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {POSTE_MODE_LABELS[o]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ fontSize: 11 }}>{uses.length ? [...new Set(uses)].join(", ") : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  }),
                ])}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Postes propres à la banque</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              Postes supplémentaires à charger (ex. effectif, carnet de commandes, dettes fiscales échues). Ils s&apos;utilisent dans les
              indicateurs et les alertes par leur code.
            </p>
            {d.extraPostes.map((x, i) => (
              <div key={i} style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
                <input aria-label="Code du poste" value={x.key} placeholder="CODE" onChange={(e) => set({ extraPostes: d.extraPostes.map((y, k) => (k === i ? { ...y, key: e.target.value.toUpperCase() } : y)) })} />
                <input aria-label="Libellé du poste" value={x.labelFr} placeholder="Libellé" onChange={(e) => set({ extraPostes: d.extraPostes.map((y, k) => (k === i ? { ...y, labelFr: e.target.value } : y)) })} />
                <select aria-label="Section" value={x.section} onChange={(e) => set({ extraPostes: d.extraPostes.map((y, k) => (k === i ? { ...y, section: e.target.value as PosteSection } : y)) })}>
                  {SECTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {SECTION_LABELS[sec]}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" style={{ width: 14 }} checked={!!x.onlyN} onChange={(e) => set({ extraPostes: d.extraPostes.map((y, k) => (k === i ? { ...y, onlyN: e.target.checked || undefined } : y)) })} />
                  N seulement
                </label>
                <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ extraPostes: d.extraPostes.filter((_, k) => k !== i) })}>
                  Retirer
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ extraPostes: [...d.extraPostes, { key: "", labelFr: "", section: "COMPL", onlyN: true }] })}>
                + Ajouter un poste
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "indicateurs" && (
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Sens : « Hausse » si une valeur plus élevée est meilleure. Seuils : à partir du seuil « bon » l&apos;indicateur est jugé bon ; au-delà
            du seuil « mauvais », mauvais ; au-delà du seuil « critique », critique ; entre les deux, à surveiller. Variation : évolution
            relative sur un an (en %) au-delà de laquelle l&apos;indicateur est en amélioration ou en dégradation. Les ratios de la grille
            restent toujours affichés.
          </p>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Indicateur</th>
                  <th>Affiché</th>
                  <th>Sens</th>
                  <th style={{ textAlign: "right" }}>Bon</th>
                  <th style={{ textAlign: "right" }}>Mauvais</th>
                  <th style={{ textAlign: "right" }}>Critique</th>
                  <th style={{ textAlign: "right" }}>Variation %</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => {
                  const rows = metas.filter((m) => m.group === g);
                  if (!rows.length) return null;
                  return [
                    <tr key={g}>
                      <th colSpan={7} style={{ textAlign: "left", background: "var(--surface-2)" }}>
                        {INDICATOR_GROUP_LABELS[g]}
                      </th>
                    </tr>,
                    ...rows.map((m) => {
                      const ap = d.appreciations[m.key];
                      const grid = gridUses[m.key];
                      const hidden = d.hiddenIndicators.includes(m.key);
                      const field = (k: "bon" | "mauvais" | "critique" | "variation") => (
                        <input
                          aria-label={`${k} — ${m.labelFr}`}
                          inputMode="decimal"
                          style={{ width: 80, textAlign: "right" }}
                          value={ap?.[k] ?? ""}
                          onChange={(e) => setAp(m.key, { [k]: num(e.target.value) })}
                        />
                      );
                      return (
                        <tr key={m.key}>
                          <td title={m.formulaFr}>
                            {m.labelFr} <span className="muted" style={{ fontSize: 11 }}>({m.unit})</span>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {m.key}
                              {grid ? ` · grille : ${grid.join(", ")}` : ""}
                            </div>
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              style={{ width: 16 }}
                              aria-label={`Afficher ${m.labelFr}`}
                              checked={!hidden || !!grid}
                              disabled={!!grid}
                              onChange={(e) => set({ hiddenIndicators: e.target.checked ? d.hiddenIndicators.filter((k) => k !== m.key) : [...d.hiddenIndicators, m.key] })}
                            />
                          </td>
                          <td>
                            <select aria-label={`Sens — ${m.labelFr}`} value={ap?.sens ?? ""} onChange={(e) => (e.target.value ? setAp(m.key, { sens: e.target.value as Appreciation["sens"] }) : set({ appreciations: Object.fromEntries(Object.entries(d.appreciations).filter(([k]) => k !== m.key)) }))}>
                              <option value="">Non apprécié</option>
                              <option value="HAUSSE">Hausse = mieux</option>
                              <option value="BAISSE">Baisse = mieux</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right" }}>{ap ? field("bon") : null}</td>
                          <td style={{ textAlign: "right" }}>{ap ? field("mauvais") : null}</td>
                          <td style={{ textAlign: "right" }}>{ap ? field("critique") : null}</td>
                          <td style={{ textAlign: "right" }}>{ap ? field("variation") : null}</td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Indicateurs définis par formule</strong>
            <FormulaHelp />
            {d.customIndicators.map((c, i) => {
              const err = formulaError(c.formula);
              return (
                <div key={i} className="card" style={{ padding: 10, boxShadow: "none", display: "grid", gap: 6 }}>
                  <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
                    <input aria-label="Code de l'indicateur" value={c.key} placeholder="CODE" onChange={(e) => setCustom(i, { key: e.target.value.toUpperCase() })} />
                    <input aria-label="Libellé de l'indicateur" value={c.labelFr} placeholder="Libellé" onChange={(e) => setCustom(i, { labelFr: e.target.value })} />
                    <select aria-label="Unité" value={c.unit} onChange={(e) => setCustom(i, { unit: e.target.value as CustomIndicator["unit"] })}>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <select aria-label="Famille" value={c.group} onChange={(e) => setCustom(i, { group: e.target.value as CustomIndicator["group"] })}>
                      {GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {INDICATOR_GROUP_LABELS[g]}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ customIndicators: d.customIndicators.filter((_, k) => k !== i) })}>
                      Retirer
                    </button>
                  </div>
                  <input aria-label="Formule" value={c.formula} placeholder="ex. STOCKS / TOTAL_ACTIF * 100" onChange={(e) => setCustom(i, { formula: e.target.value })} style={{ fontFamily: "monospace" }} />
                  {err && <span style={{ fontSize: 12, color: "var(--bad)" }}>{err}</span>}
                </div>
              );
            })}
            <div>
              <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ customIndicators: [...d.customIndicators, { key: "", labelFr: "", unit: "%", group: "STRUCTURE", formula: "" }] })}>
                + Ajouter un indicateur
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "alertes" && (
        <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            Alertes évaluées dès le chargement du bilan, sur l&apos;exercice N. Elles informent l&apos;analyste et le valideur ; elles ne
            changent pas la note. « Critique » : critère réglementaire ou situation grave ; « Alerte » : signal à analyser.
          </p>
          <FormulaHelp />
          {d.alerts.map((a, i) => {
            const err = formulaError(a.condition);
            return (
              <div key={i} className="card" style={{ padding: 10, boxShadow: "none", display: "grid", gap: 6, opacity: a.active ? 1 : 0.6 }}>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
                  <input type="checkbox" style={{ width: 16 }} aria-label="Alerte active" checked={a.active} onChange={(e) => setAlert(i, { active: e.target.checked })} />
                  <input aria-label="Code de l'alerte" value={a.key} onChange={(e) => setAlert(i, { key: e.target.value.toUpperCase() })} />
                  <input aria-label="Libellé de l'alerte" value={a.labelFr} onChange={(e) => setAlert(i, { labelFr: e.target.value })} />
                  <select aria-label="Gravité" value={a.severity} onChange={(e) => setAlert(i, { severity: e.target.value as AlertRule["severity"] })}>
                    <option value="CRITIQUE">Critique</option>
                    <option value="ALERTE">Alerte</option>
                  </select>
                  <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ alerts: d.alerts.filter((_, k) => k !== i) })}>
                    Retirer
                  </button>
                </div>
                <input aria-label="Condition" value={a.condition} onChange={(e) => setAlert(i, { condition: e.target.value })} style={{ fontFamily: "monospace" }} />
                <input aria-label="Référence" value={a.referenceFr ?? ""} placeholder="Référence (circulaire, politique de crédit…)" onChange={(e) => setAlert(i, { referenceFr: e.target.value || undefined })} />
                {err && <span style={{ fontSize: 12, color: "var(--bad)" }}>{err}</span>}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => set({ alerts: [...d.alerts, { key: `ALERTE_${d.alerts.length + 1}`, labelFr: "", condition: "", severity: "ALERTE", active: true }] })}>
              + Ajouter une alerte
            </button>
            <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => window.confirm("Remplacer les alertes par celles du format embarqué ?") && set({ alerts: DEFAULT_ALERTS })}>
              Rétablir les alertes embarquées
            </button>
          </div>
        </div>
      )}

      {tab === "synthese" && (
        <div style={{ display: "grid", gap: 10 }}>
          <p className="muted" style={{ fontSize: 12 }}>
            La situation financière d&apos;ensemble est déterminée dans cet ordre : critique, dégradée, à surveiller, sinon saine. Chaque
            seuil est un nombre minimal (alertes déclenchées, indicateurs de l&apos;exercice N dans la zone indiquée, indicateurs en
            dégradation sur un an).
          </p>
          {(
            [
              ["critique", "Critique", [["alertesCritiques", "alertes critiques"], ["indicateursCritiques", "indicateurs critiques"]]],
              ["degradee", "Dégradée", [["alertes", "alertes (toutes gravités)"], ["indicateursCritiques", "indicateurs critiques"], ["indicateursMauvais", "indicateurs mauvais"]]],
              ["surveiller", "À surveiller", [["alertes", "alertes (toutes gravités)"], ["indicateursMauvais", "indicateurs mauvais"], ["degradations", "indicateurs en dégradation"]]],
            ] as const
          ).map(([level, label, fields]) => (
            <fieldset key={level} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
              <legend style={{ fontWeight: 600, fontSize: 13 }}>{label} dès que l&apos;un des seuils est atteint</legend>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {fields.map(([k, l]) => (
                  <label key={k} style={{ fontSize: 12, display: "grid", gap: 4 }}>
                    {l}
                    <input
                      inputMode="numeric"
                      style={{ width: 80 }}
                      value={(d.synthesis[level] as Record<string, number>)[k] ?? ""}
                      onChange={(e) => set({ synthesis: { ...d.synthesis, [level]: { ...d.synthesis[level], [k]: Number(e.target.value) || 0 } } })}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {(check.errors.length > 0 || check.warnings.length > 0) && (
        <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
          {check.errors.map((e) => (
            <div key={e} style={{ color: "var(--bad)" }}>
              Bloquant — {e}
            </div>
          ))}
          {check.warnings.map((w) => (
            <div key={w} style={{ color: "var(--warn)" }}>
              À noter — {w}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn-primary" disabled={pending || check.errors.length > 0} onClick={save}>
          {pending ? "Enregistrement…" : "Enregistrer la version"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </section>
  );
}

function FormulaHelp() {
  return (
    <details style={{ fontSize: 12 }}>
      <summary style={{ cursor: "pointer" }}>Écrire une formule</summary>
      <ul style={{ paddingLeft: 18, marginTop: 4, display: "grid", gap: 2 }}>
        <li>Codes des postes (ex. CAPITAUX_PROPRES, STOCKS) et des indicateurs (ex. GEARING, DSCR), nombres avec un point décimal.</li>
        <li>Opérateurs + − * / et parenthèses ; comparaisons &lt; &lt;= &gt; &gt;= = &lt;&gt; ; ET, OU, NON.</li>
        <li>PREC(x) : valeur de l&apos;exercice précédent ; PREC(x; 2) : deux exercices avant ; EVOL(x) : variation sur un an en %.</li>
        <li>ABS(x), MIN(a; b), MAX(a; b).</li>
        {Object.entries(FORMULA_VARIABLES).map(([k, v]) => (
          <li key={k}>
            {k} : {v}
          </li>
        ))}
        <li>Exemple d&apos;alerte : <code>EVOL(CHIFFRE_AFFAIRES) &lt;= -50</code> ; exemple d&apos;indicateur : <code>STOCKS / TOTAL_ACTIF * 100</code>.</li>
      </ul>
    </details>
  );
}
