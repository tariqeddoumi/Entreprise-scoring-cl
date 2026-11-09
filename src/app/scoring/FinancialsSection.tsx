"use client";

import { useMemo, useState } from "react";
import type { ModelConfig } from "@/core/types";
import { SECTION_LABELS, STATEMENT_MODEL_LABELS, type PosteSection, type StatementModel } from "@/financials/chart";
import {
  editYearValue,
  MIN_VALUE_CORRECTION_REASON,
  emptyYear,
  hasFinancials,
  yearHasData,
  INDICATOR_BY_KEY,
  INDICATOR_GROUP_LABELS,
  indicatorCatalog,
  MAX_FISCAL_YEARS,
  type FinancialsDraft,
  type FinancialYearDraft,
  type IndicatorMeta,
} from "@/financials/compute";
import { DEFAULT_FORMAT, formatPostes, type FormatPoste, type StatementFormat } from "@/financials/statement-format";
import { FinancialAnalysisPanel } from "./FinancialAnalysisPanel";
import { draftFinancials, type CaseDraft } from "@/lib/case-input";
import { formatAmount, formatIndicator } from "@/financials/format";
import { extractFinancialsAction, importFinancialsAction } from "@/app/cases/actions";

/** Pièce du dossier proposée à la lecture du bilan. */
export interface BalanceSheetDocument {
  id: string;
  fileName: string;
  mimeType: string;
}

interface Props {
  model: ModelConfig;
  draft: CaseDraft;
  onChange?: (next: CaseDraft) => void;
  readOnly?: boolean;
  currency: string;
  /** Dossier : lecture par l'OCR intelligent et import du gabarit Excel. Absent en simulation. */
  caseId?: string;
  documents?: BalanceSheetDocument[];
  aiUsable?: boolean;
  /** Format de bilan en vigueur (postes à charger, analyse). */
  format?: StatementFormat;
}

const YEAR_LABELS = ["N", "N−1", "N−2"];
const LOW_CONFIDENCE = 80;

const CONTROL_COLORS = { OK: "var(--good)", ALERTE: "var(--warn)", KO: "var(--bad)" } as const;
const CONTROL_LABELS = { OK: "Conforme", ALERTE: "À vérifier", KO: "Bloquant" } as const;

/**
 * Bilan et CPC du dossier : chargement (IA, gabarit Excel, saisie), contrôles,
 * ratios de la grille calculés et corrigeables avec motif, indicateurs.
 */
export function FinancialsSection({ model, draft, onChange, readOnly = false, currency, caseId, documents = [], aiUsable = false, format = DEFAULT_FORMAT }: Props) {
  const f = draft.financials;
  const fin = useMemo(() => draftFinancials(draft, model, format), [draft, model, format]);
  const metas = useMemo(() => indicatorCatalog(format), [format]);
  const [busy, setBusy] = useState<null | "ai" | "excel">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; summary?: string } | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const editable = !readOnly && !!onChange;
  const filled = hasFinancials(f);

  const setF = (patch: Partial<FinancialsDraft>) => onChange?.({ ...draft, financials: { ...f, ...patch } });
  const setYear = (i: number, patch: Partial<FinancialYearDraft>) =>
    setF({ years: f.years.map((y, k) => (k === i ? { ...y, ...patch } : y)) });
  const setValue = (i: number, key: string, value: string) => setF({ years: f.years.map((y, k) => (k === i ? editYearValue(y, key, value) : y)) });
  const setReason = (i: number, key: string, reason: string) =>
    setF({
      years: f.years.map((y, k) => (k === i && y.corrections?.[key] ? { ...y, corrections: { ...y.corrections, [key]: { ...y.corrections[key], reason } } } : y)),
    });

  function load(r: { statementModel: StatementModel | ""; certified: boolean; years: FinancialYearDraft[]; document: FinancialsDraft["document"] }, source: "IA" | "EXCEL") {
    if (filled && !window.confirm("Remplacer le bilan déjà saisi par celui qui vient d'être lu ? Les corrections de ratios sont conservées.")) return;
    setF({
      statementModel: r.statementModel || f.statementModel,
      certified: r.certified,
      years: r.years.slice(0, MAX_FISCAL_YEARS),
      document: r.document,
      source,
    });
  }

  async function readWithAi() {
    if (!caseId) return;
    setBusy("ai");
    setMessage(null);
    try {
      const r = await extractFinancialsAction(caseId, [...selectedDocs]);
      setMessage({ ok: r.ok, text: r.ok ? (r.okFr ?? "") : (r.errorFr ?? "Échec."), summary: r.financials?.summary });
      if (r.ok && r.financials) load(r.financials, "IA");
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur inattendue." });
    } finally {
      setBusy(null);
    }
  }

  async function importExcel(fd: FormData) {
    setBusy("excel");
    setMessage(null);
    try {
      const r = await importFinancialsAction(fd);
      setMessage({ ok: r.ok, text: r.ok ? (r.okFr ?? "") : (r.errorFr ?? "Échec.") });
      if (r.ok && r.financials) load(r.financials, "EXCEL");
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur inattendue." });
    } finally {
      setBusy(null);
    }
  }

  const years = f.years;
  const sections = useMemo(() => {
    const out: Array<{ section: PosteSection; postes: FormatPoste[] }> = [];
    for (const p of formatPostes(format)) {
      const last = out[out.length - 1];
      if (last && last.section === p.section) last.postes.push(p);
      else out.push({ section: p.section, postes: [p] });
    }
    return out;
  }, [format]);
  const readableDocs = documents.filter((d) => /pdf|image|sheet|text|csv/.test(d.mimeType));
  const ko = fin.controls.filter((c) => c.status === "KO").length;
  const alerts = fin.controls.filter((c) => c.status === "ALERTE").length;

  return (
    <section id="bilan" className="card" style={{ padding: 16, display: "grid", gap: 14, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Bilan et compte de produits et charges</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Chargez le bilan (lecture par l&apos;OCR intelligent d&apos;un PDF, d&apos;une photo ou d&apos;un Excel ; gabarit Excel de la banque ; ou saisie).
          Les ratios de la grille sont calculés par l&apos;outil selon les définitions CGNC, jamais par l&apos;OCR intelligent ; vous pouvez corriger un
          ratio avec un motif. Exercices N et N−1 exigés, N−2 facultatif. Montants en {currency}.
        </p>
      </div>

      {draft.reprise && draft.reprise.exercise === "SUIVANT" && !yearHasData(years[0]) && (
        <div role="note" style={{ fontSize: 13, borderLeft: "4px solid var(--bcp-orange)", background: "var(--surface-2)", padding: "8px 10px", borderRadius: 4 }}>
          <strong>Bilan {draft.reprise.toLoad ?? years[0]?.fiscalYear ?? "N"} à charger.</strong> Les exercices {draft.reprise.carriedYears.join(" et ")} sont repris
          de la dernière note validée en N−1{draft.reprise.carriedYears.length > 1 ? " et N−2" : ""} : seul le nouvel exercice N est à charger
          (lecture du PDF, gabarit Excel ou saisie dans la colonne « Exercice N »).
        </div>
      )}
      {draft.reprise && draft.reprise.exercise === "CONSERVE" && filled && (
        <p className="muted" style={{ fontSize: 12 }}>
          Bilan repris de la dernière note validée (même exercice) : rien à recharger, vérifiez seulement qu&apos;il est toujours le dernier arrêté.
        </p>
      )}

      {editable && caseId && (
        <div className="balance-tools" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div className="card" style={{ padding: 12, display: "grid", gap: 8, boxShadow: "none" }}>
            <strong style={{ fontSize: 13 }}>Lire le bilan avec l&apos;OCR intelligent</strong>
            {!aiUsable ? (
              <span className="muted" style={{ fontSize: 12 }}>OCR intelligent désactivé ou non configuré : utilisez le gabarit Excel ou la saisie.</span>
            ) : readableDocs.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>Ajoutez d&apos;abord le bilan aux pièces du dossier (PDF, photo ou Excel).</span>
            ) : (
              <>
                {readableDocs.map((d) => (
                  <label key={d.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      style={{ width: 14 }}
                      checked={selectedDocs.has(d.id)}
                      onChange={(e) =>
                        setSelectedDocs((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(d.id);
                          else n.delete(d.id);
                          return n;
                        })
                      }
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.fileName}>{d.fileName}</span>
                  </label>
                ))}
                <button type="button" className="btn-primary" onClick={readWithAi} disabled={busy !== null || selectedDocs.size === 0}>
                  {busy === "ai" ? "Lecture en cours (jusqu'à 2 minutes)…" : "Lire le bilan"}
                </button>
              </>
            )}
          </div>
          <form
            className="card"
            style={{ padding: 12, display: "grid", gap: 8, boxShadow: "none" }}
            action={importExcel}
          >
            <strong style={{ fontSize: 13 }}>Gabarit Excel de la banque</strong>
            {/* Téléchargement d'un fichier, pas une navigation : un lien natif est voulu. */}
            <a href="/cases/gabarit-bilan" download style={{ color: "var(--brand)", fontSize: 12 }}>
              Télécharger le gabarit vierge
            </a>
            <input type="hidden" name="caseId" value={caseId} />
            <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Gabarit Excel rempli" />
            <button type="submit" className="btn-ghost" disabled={busy !== null}>
              {busy === "excel" ? "Import…" : "Importer le gabarit rempli"}
            </button>
          </form>
        </div>
      )}
      {message && (
        <div role={message.ok ? "status" : "alert"} style={{ fontSize: 12, color: message.ok ? "var(--text)" : "var(--bad)" }}>
          {message.text}
          {message.summary && <p className="muted" style={{ marginTop: 4 }}>{message.summary}</p>}
        </div>
      )}

      {filled && (
        <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 8, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <h3 style={{ fontWeight: 600, fontSize: 14 }}>Analyse du bilan</h3>
          <FinancialAnalysisPanel
            analysis={fin.analysis}
            indicators={fin.indicators}
            years={years.map((y, i) => y.fiscalYear || YEAR_LABELS[i])}
            metas={metas}
            model={model}
            formatVersion={fin.formatVersion}
          />
        </div>
      )}

      <fieldset disabled={!editable} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ fontSize: 12, display: "grid", gap: 4, minWidth: 240 }}>
            Modèle des états de synthèse
            <select value={f.statementModel} onChange={(e) => setF({ statementModel: e.target.value as StatementModel | "" })}>
              <option value="">— à préciser —</option>
              {(Object.keys(STATEMENT_MODEL_LABELS) as StatementModel[]).map((m) => (
                <option key={m} value={m}>{STATEMENT_MODEL_LABELS[m]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" style={{ width: 16 }} checked={f.certified} onChange={(e) => setF({ certified: e.target.checked })} />
            Comptes certifiés par un commissaire aux comptes
          </label>
          <span className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
            Origine : {f.source === "IA" ? "lecture par l'OCR intelligent" : f.source === "EXCEL" ? "gabarit Excel" : filled ? "saisie" : "—"}
            {f.document ? ` · pièce « ${f.document.name} » (empreinte ${f.document.sha256.slice(0, 12)}…)` : ""}
          </span>
        </div>

        <details open={!filled || editable} style={{ minWidth: 0 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            Postes du bilan et du CPC{filled ? ` — exercices ${years.map((y, i) => y.fiscalYear || YEAR_LABELS[i]).join(", ")}` : ""}
          </summary>
        <div className="table-scroll" style={{ overflowX: "auto" }}>
          <table className="data balance-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Poste</th>
                {years.map((_, i) => (
                  <th key={i} style={{ textAlign: "right" }}>
                    Exercice {YEAR_LABELS[i]}
                    {editable && i === years.length - 1 && i >= 2 && (
                      <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "1px 6px", marginLeft: 6 }} onClick={() => setF({ years: years.slice(0, -1) })}>
                        Retirer
                      </button>
                    )}
                  </th>
                ))}
                {editable && years.length < MAX_FISCAL_YEARS && (
                  <th>
                    <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setF({ years: [...years, emptyYear()] })}>
                      + Exercice N−2
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Exercice (année)</td>
                {years.map((y, i) => (
                  <td key={i}>
                    <input aria-label={`Exercice ${YEAR_LABELS[i]} (année)`} value={y.fiscalYear} placeholder="ex. 2025" onChange={(e) => setYear(i, { fiscalYear: e.target.value })} />
                  </td>
                ))}
              </tr>
              <tr>
                <td>Date de clôture</td>
                {years.map((y, i) => (
                  <td key={i}>
                    <input type="date" aria-label={`Date de clôture ${YEAR_LABELS[i]}`} value={y.closingDate} onChange={(e) => setYear(i, { closingDate: e.target.value })} />
                  </td>
                ))}
              </tr>
              {sections.map(({ section, postes }) => (
                <SectionRows
                  key={section}
                  label={SECTION_LABELS[section]}
                  postes={postes}
                  years={years}
                  computed={fin.years}
                  editable={editable}
                  onValue={setValue}
                  onReason={setReason}
                />
              ))}
            </tbody>
          </table>
        </div>
        </details>
        {years.some((y) => y.lineage && Object.keys(y.lineage).length) && (
          <p className="muted" style={{ fontSize: 11 }}>
            Valeurs lues par l&apos;OCR intelligent : survolez une cellule pour voir sa source. Les cellules surlignées ont une confiance inférieure à {LOW_CONFIDENCE} % : à vérifier en priorité.
          </p>
        )}
      </fieldset>

      {fin.controls.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
            Contrôles {ko > 0 ? <span style={{ color: "var(--bad)" }}>· {ko} bloquant(s)</span> : null}
            {alerts > 0 ? <span style={{ color: "var(--warn)" }}> · {alerts} à vérifier</span> : null}
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {fin.controls.map((c) => (
              <li key={c.key} style={{ fontSize: 12, display: "flex", gap: 8 }}>
                <span style={{ color: CONTROL_COLORS[c.status], fontWeight: 600, minWidth: 80 }}>{CONTROL_LABELS[c.status]}</span>
                <span>
                  <strong>{c.labelFr}</strong> — {c.detailFr}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {fin.gridRatios.length > 0 && (
        <div>
          <h3 style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Ratios de la grille</h3>
          <div className="table-scroll" style={{ overflowX: "auto" }}>
            <table className="data" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Critère</th>
                  <th style={{ textAlign: "right" }}>Calculé</th>
                  <th style={{ textAlign: "right" }}>Retenu</th>
                  <th>Correction et motif</th>
                </tr>
              </thead>
              <tbody>
                {fin.gridRatios.map((g) => {
                  const c = model.criteria.find((x) => x.code === g.criterion);
                  const def = INDICATOR_BY_KEY.get(g.indicator);
                  const unit = def?.unit ?? "x";
                  const ov = f.overrides[g.criterion] ?? { value: "", reason: "" };
                  const setOv = (patch: Partial<{ value: string; reason: string }>) => {
                    const next = { ...ov, ...patch };
                    const overrides = { ...f.overrides };
                    if (!next.value.trim() && !next.reason.trim()) delete overrides[g.criterion];
                    else overrides[g.criterion] = next;
                    setF({ overrides });
                  };
                  const special = g.specialCase ? c?.specialCases?.find((x) => x.code === g.specialCase)?.labelFr ?? g.specialCase : null;
                  return (
                    <tr key={g.criterion}>
                      <td>
                        <strong>{g.criterion}</strong> — {c?.labelFr ?? def?.labelFr}
                        <div className="muted" style={{ fontSize: 11 }}>{def?.formulaFr}</div>
                        {g.noteFr && <div style={{ fontSize: 11, color: "var(--warn)" }}>{g.noteFr}</div>}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatIndicator(g.computed, unit)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: g.overridden ? "var(--warn)" : undefined }}>
                        {special ? <span style={{ fontWeight: 400, fontSize: 12 }}>{special}</span> : formatIndicator(g.retained, unit)}
                        {g.overridden && <div style={{ fontSize: 11, fontWeight: 400 }}>corrigé</div>}
                      </td>
                      <td>
                        {editable ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <input
                              aria-label={`Valeur corrigée — ${g.criterion}`}
                              inputMode="decimal"
                              placeholder="Valeur corrigée (vide : valeur calculée)"
                              value={ov.value}
                              onChange={(e) => setOv({ value: e.target.value })}
                            />
                            <input
                              aria-label={`Motif de la correction — ${g.criterion}`}
                              placeholder="Motif obligatoire (ex. crédit-bail réintégré, compte courant bloqué)"
                              value={ov.reason}
                              maxLength={500}
                              onChange={(e) => setOv({ reason: e.target.value })}
                            />
                          </div>
                        ) : g.overridden ? (
                          <span style={{ fontSize: 12 }}>{g.reason}</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </section>
  );
}

function SectionRows({
  label,
  postes,
  years,
  computed,
  editable,
  onValue,
  onReason,
}: {
  label: string;
  postes: FormatPoste[];
  years: FinancialYearDraft[];
  computed: Array<Record<string, number | undefined>>;
  editable: boolean;
  onValue: (i: number, key: string, value: string) => void;
  onReason?: (i: number, key: string, reason: string) => void;
}) {
  return (
    <>
      <tr>
        <th colSpan={years.length + 1} style={{ background: "var(--surface-2)", textAlign: "left" }}>{label}</th>
      </tr>
      {postes.map((p) => (
        <tr key={p.key}>
          <td style={{ fontWeight: p.kind === "TOTAL" ? 600 : 400, paddingLeft: p.kind === "DETAIL" || p.optionalDetail ? 24 : undefined }} title={p.hintFr}>
            {p.labelFr}
            {p.kind === "TOTAL" && p.input ? <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · à saisir tel qu&apos;au bilan</span> : null}
            {p.optionalDetail ? <span className="muted" style={{ fontSize: 11 }}> · détail facultatif</span> : null}
            {p.extra ? <span className="muted" style={{ fontSize: 11 }}> · poste de la banque</span> : null}
          </td>
          {years.map((y, i) => {
            if (!p.input) {
              return (
                <td key={i} style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                  {formatAmount(computed[i]?.[p.key])}
                </td>
              );
            }
            if (p.onlyN && i > 0) return <td key={i} />;
            const lin = y.lineage?.[p.key];
            const low = lin !== undefined && lin.confidence < LOW_CONFIDENCE;
            const cor = y.corrections?.[p.key];
            const noReason = !!cor && cor.reason.trim().length < MIN_VALUE_CORRECTION_REASON;
            return (
              <td key={i} title={lin ? `Lu par l'OCR intelligent — ${lin.source} (confiance ${lin.confidence} %)` : cor ? `Valeur lue : ${cor.read || "vide"}` : undefined}>
                {editable ? (
                  <input
                    aria-label={`${p.labelFr} — exercice ${YEAR_LABELS[i]}`}
                    inputMode="decimal"
                    value={y.values[p.key] ?? ""}
                    onChange={(e) => onValue(i, p.key, e.target.value)}
                    style={{ textAlign: "right", background: low ? "var(--warn-bg)" : undefined }}
                  />
                ) : (
                  <span style={{ display: "block", textAlign: "right" }}>{formatAmount(computed[i]?.[p.key])}</span>
                )}
                {cor && (
                  <div style={{ fontSize: 11, marginTop: 2, display: "grid", gap: 2 }}>
                    <span style={{ color: "var(--bcp-orange)" }}>corrigé · lu {cor.read || "vide"}</span>
                    {editable && onReason ? (
                      <input
                        aria-label={`Motif de la correction — ${p.labelFr}, exercice ${YEAR_LABELS[i]}`}
                        placeholder="Motif de la correction"
                        value={cor.reason}
                        onChange={(e) => onReason(i, p.key, e.target.value)}
                        style={{ fontSize: 11, padding: "2px 4px", borderColor: noReason ? "var(--bad)" : undefined }}
                      />
                    ) : (
                      cor.reason && <span className="muted">{cor.reason}</span>
                    )}
                  </div>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

export function IndicatorTable({
  rows,
  years,
  metas = indicatorCatalog(),
}: {
  rows: Array<{ key: string; values: Array<number | null>; notes?: Array<string | undefined> }>;
  years: string[];
  metas?: IndicatorMeta[];
}) {
  const groups = Object.keys(INDICATOR_GROUP_LABELS) as Array<keyof typeof INDICATOR_GROUP_LABELS>;
  return (
    <div className="table-scroll" style={{ overflowX: "auto" }}>
      <table className="data" style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th>Indicateur</th>
            {years.map((y, i) => (
              <th key={i} style={{ textAlign: "right" }}>{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const inGroup = metas
              .filter((d) => d.group === g)
              .map((d) => ({ d, r: rows.find((r) => r.key === d.key) }))
              .filter((x): x is { d: IndicatorMeta; r: (typeof rows)[number] } => !!x.r);
            if (inGroup.length === 0) return null;
            return [
              <tr key={g}>
                <th colSpan={years.length + 1} style={{ textAlign: "left", background: "var(--surface-2)" }}>{INDICATOR_GROUP_LABELS[g]}</th>
              </tr>,
              ...inGroup.map(({ d, r }) => (
                <tr key={d.key}>
                  <td title={d.formulaFr}>{d.labelFr}</td>
                  {years.map((_, i) => (
                    <td key={i} style={{ textAlign: "right", whiteSpace: "nowrap" }} title={r.notes?.[i]}>
                      {formatIndicator(r.values[i] ?? null, d.unit)}
                    </td>
                  ))}
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
