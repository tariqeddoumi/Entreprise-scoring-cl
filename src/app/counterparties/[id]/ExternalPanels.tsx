"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  analyseReport,
  BUREAU_LABELS,
  BUREAU_SIGNALS,
  INCIDENT_KINDS,
  INCIDENT_LABELS,
  LINE_STATUS_LABELS,
  LINE_STATUSES,
  reportFreshness,
  SOURCE_LABELS,
  type Bureau,
  type CreditIncident,
  type CreditLine,
  type Finding,
  type ReportSource,
} from "@/reference/credit-report";
import { CUSTOMER_FIELD_LABELS, CUSTOMER_FIELDS, DATA_SOURCE_LABELS, type CoreBankingCustomer, type DataSource, type FieldChange } from "@/reference/core-banking";
import { LEGAL_EVENT_LABELS, LEGAL_SIGNALS, PROFILE_SOURCE_LABELS, type LegalProfile, type ProfileFinding } from "@/reference/legal-profile";
import type { ReportDraft, ReportStatus } from "@/lib/external-data";
import {
  extractCreditReportAction,
  extractLegalProfileAction,
  fetchCreditReportAction,
  saveCreditReportAction,
  saveLegalProfileAction,
  syncT24Action,
} from "../external-actions";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const amount = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf.format(v));
const LEVEL_COLOR = { INFO: "var(--muted)", ATTENTION: "var(--warn)", ALERTE: "var(--bad)" } as const;
const LEVEL_ICON = { INFO: "ℹ", ATTENTION: "▲", ALERTE: "✕" } as const;

function Findings({ items }: { items: Array<Finding | ProfileFinding> }) {
  if (!items.length) return null;
  return (
    <ul style={{ display: "grid", gap: 4, margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13 }}>
      {items.map((f, i) => (
        <li key={i} style={{ display: "flex", gap: 6 }}>
          <span aria-hidden="true" style={{ color: LEVEL_COLOR[f.level], fontWeight: 700 }}>
            {LEVEL_ICON[f.level]}
          </span>
          <span>
            <span className="sr-only">{f.level === "ALERTE" ? "Alerte : " : f.level === "ATTENTION" ? "Attention : " : ""}</span>
            {f.textFr}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Signals({ codes, labels }: { codes: string[]; labels: Record<string, string> }) {
  if (!codes.length) return null;
  return (
    <div style={{ fontSize: 13, padding: "8px 12px", borderLeft: "4px solid var(--bcp-orange)", background: "var(--surface-2)", borderRadius: 6 }}>
      <strong>Critères de classement BAM proposés à vérifier dans les dossiers :</strong> {codes.map((c) => labels[c] ?? c).join(" ; ")}. L&apos;analyste confirme,
      date et commente : rien n&apos;est coché automatiquement.
    </div>
  );
}

function Msg({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error)
    return (
      <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" style={{ color: "var(--good)", fontSize: 13 }}>
        {ok}
      </p>
    );
  return null;
}

// --- Référentiel T24 ------------------------------------------------------------------

export function T24Panel({
  counterpartyId,
  source,
  code,
  syncedAt,
  data,
  commercialSegment,
  segmentLabel,
  accountOfficer,
  modelSegment,
  t24Enabled,
  canEdit,
}: {
  counterpartyId: string;
  source: DataSource | null;
  code: string | null;
  syncedAt: string | null;
  data: (CoreBankingCustomer & { fetchedAt?: string }) | null;
  commercialSegment: string | null;
  segmentLabel: string | null;
  accountOfficer: string | null;
  modelSegment: string | null;
  t24Enabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState(code ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: string; error?: string; changes?: FieldChange[] } | null>(null);
  const run = () =>
    start(async () => {
      const r = await syncT24Action(counterpartyId, source === "T24" ? undefined : input);
      if (r.ok) {
        setResult({ ok: r.changes?.length ? `Fiche actualisée depuis T24 : ${r.changes.length} champ(s) modifié(s).` : "Fiche à jour : aucun écart avec T24.", changes: r.changes });
        router.refresh();
      } else setResult({ error: r.errorFr });
    });
  return (
    <section id="t24" className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 style={{ fontWeight: 600 }}>Référentiel T24</h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 999,
            background: source === "T24" ? "color-mix(in srgb, var(--good) 15%, transparent)" : "var(--warn-bg)",
            color: source === "T24" ? "var(--good)" : "var(--warn)",
          }}
        >
          {source ? DATA_SOURCE_LABELS[source] : "Non rattachée à T24"}
        </span>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, margin: 0, fontSize: 13 }}>
        <div>
          <dt className="muted">Code client T24</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{code ?? "—"}</dd>
        </div>
        <div>
          <dt className="muted">Segment commercial (banque)</dt>
          <dd style={{ margin: 0 }}>{segmentLabel ?? commercialSegment ?? "—"}</dd>
        </div>
        <div>
          <dt className="muted">Segment du modèle (calculé)</dt>
          <dd style={{ margin: 0 }}>{modelSegment ?? "—"}</dd>
        </div>
        <div>
          <dt className="muted">Gestionnaire</dt>
          <dd style={{ margin: 0 }}>{accountOfficer ?? "—"}</dd>
        </div>
        <div>
          <dt className="muted">Dernière synchronisation</dt>
          <dd style={{ margin: 0 }}>{syncedAt ? new Date(syncedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}</dd>
        </div>
      </dl>
      {data && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Données rapatriées de T24</summary>
          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table className="data" style={{ minWidth: 420 }}>
              <tbody>
                {CUSTOMER_FIELDS.filter((f) => data[f]).map((f) => (
                  <tr key={f}>
                    <th style={{ width: "40%" }}>{CUSTOMER_FIELD_LABELS[f]}</th>
                    <td>{data[f]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          {source !== "T24" && (
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Code client T24
              <input inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} style={{ maxWidth: 200 }} />
            </label>
          )}
          <button type="button" className="btn-primary" disabled={pending || !t24Enabled || (source !== "T24" && !input.trim())} onClick={run}>
            {pending ? "Interrogation de T24…" : source === "T24" ? "Actualiser depuis T24" : "Rattacher à T24 et rapatrier"}
          </button>
          {!t24Enabled && <span className="muted" style={{ fontSize: 12 }}>Rapatriement T24 non activé (paramétrage).</span>}
        </div>
      )}
      <Msg ok={result?.ok} error={result?.error} />
      {result?.changes && result.changes.length > 0 && (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 420 }}>
            <thead>
              <tr>
                <th>Champ</th>
                <th>Avant</th>
                <th>T24</th>
              </tr>
            </thead>
            <tbody>
              {result.changes.map((c) => (
                <tr key={c.field}>
                  <td>{c.labelFr}</td>
                  <td>{c.before ?? "—"}</td>
                  <td>{c.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// --- Rapport de solvabilité --------------------------------------------------------------

function FreshnessBanner({ reportDate, today, maxAgeDays }: { reportDate: string; today: string; maxAgeDays: number }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate))
    return (
      <div role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>
        Date de mise à jour du rapport inconnue : renseignez-la, elle fait foi pour son ancienneté.
      </div>
    );
  const f = reportFreshness(reportDate, today, maxAgeDays);
  return (
    <div
      role={f.stale ? "alert" : "status"}
      style={{
        fontSize: 13,
        padding: "8px 12px",
        borderRadius: 6,
        borderLeft: `6px solid ${f.stale ? "var(--bad)" : "var(--good)"}`,
        background: f.stale ? "var(--warn-bg)" : "var(--surface-2)",
        fontWeight: f.stale ? 600 : 400,
      }}
    >
      <span aria-hidden="true">{f.stale ? "✕ " : "✓ "}</span>
      Mise à jour le {reportDate}. {f.messageFr}
    </div>
  );
}

function ReportEditor({ draft, onChange, today, maxAgeDays }: { draft: ReportDraft; onChange: (d: ReportDraft) => void; today: string; maxAgeDays: number }) {
  const set = (patch: Partial<ReportDraft>) => onChange({ ...draft, ...patch });
  const setLine = (i: number, p: Partial<CreditLine>) => set({ data: { ...draft.data, lines: draft.data.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) } });
  const setInc = (i: number, p: Partial<CreditIncident>) => set({ data: { ...draft.data, incidents: draft.data.incidents.map((l, k) => (k === i ? { ...l, ...p } : l)) } });
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));
  const analysis = useMemo(() => analyseReport(draft.data), [draft.data]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <FreshnessBanner reportDate={draft.reportDate} today={today} maxAgeDays={maxAgeDays} />
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Date de mise à jour du rapport *
          <input type="date" max={today} value={draft.reportDate} onChange={(e) => set({ reportDate: e.target.value })} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Crédit bureau
          <select value={draft.bureau} onChange={(e) => set({ bureau: e.target.value as Bureau })}>
            {(Object.keys(BUREAU_LABELS) as Bureau[]).map((b) => (
              <option key={b} value={b}>
                {BUREAU_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Référence du rapport
          <input value={draft.reference} maxLength={80} onChange={(e) => set({ reference: e.target.value })} />
        </label>
      </div>
      <strong style={{ fontSize: 13 }}>Lignes de crédit déclarées ({draft.data.lines.length})</strong>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th>Établissement</th>
              <th>Chez nous</th>
              <th>Type</th>
              <th>Autorisé</th>
              <th>Encours</th>
              <th>Impayé</th>
              <th>Jours</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.data.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <input aria-label={`Ligne ${i + 1} : établissement`} value={l.institution} onChange={(e) => setLine(i, { institution: e.target.value })} />
                </td>
                <td>
                  <input type="checkbox" style={{ width: 16 }} aria-label={`Ligne ${i + 1} : chez la banque`} checked={l.ownBank} onChange={(e) => setLine(i, { ownBank: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={`Ligne ${i + 1} : type`} value={l.type} onChange={(e) => setLine(i, { type: e.target.value })} />
                </td>
                {(["authorized", "outstanding", "overdue", "overdueDays"] as const).map((k) => (
                  <td key={k}>
                    <input inputMode="decimal" style={{ maxWidth: 120 }} aria-label={`Ligne ${i + 1} : ${k}`} value={l[k] ?? ""} onChange={(e) => setLine(i, { [k]: num(e.target.value) })} />
                  </td>
                ))}
                <td>
                  <select aria-label={`Ligne ${i + 1} : statut`} value={l.status} onChange={(e) => setLine(i, { status: e.target.value as CreditLine["status"] })}>
                    {LINE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LINE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="btn-ghost" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => set({ data: { ...draft.data, lines: draft.data.lines.filter((_, k) => k !== i) } })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn-ghost"
        style={{ justifySelf: "start", fontSize: 12 }}
        onClick={() => set({ data: { ...draft.data, lines: [...draft.data.lines, { institution: "", ownBank: false, type: "", authorized: null, outstanding: null, overdue: null, overdueDays: null, status: "EN_COURS" }] } })}
      >
        + Ajouter une ligne
      </button>
      <strong style={{ fontSize: 13 }}>Incidents ({draft.data.incidents.length})</strong>
      {draft.data.incidents.length > 0 && (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Nature</th>
                <th>Établissement</th>
                <th>Montant</th>
                <th>Régularisé</th>
                <th>Libellé</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.data.incidents.map((x, i) => (
                <tr key={i}>
                  <td>
                    <input type="date" aria-label={`Incident ${i + 1} : date`} value={x.date} onChange={(e) => setInc(i, { date: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`Incident ${i + 1} : nature`} value={x.kind} onChange={(e) => setInc(i, { kind: e.target.value as CreditIncident["kind"] })}>
                      {INCIDENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {INCIDENT_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input aria-label={`Incident ${i + 1} : établissement`} value={x.institution} onChange={(e) => setInc(i, { institution: e.target.value })} />
                  </td>
                  <td>
                    <input inputMode="decimal" style={{ maxWidth: 120 }} aria-label={`Incident ${i + 1} : montant`} value={x.amount ?? ""} onChange={(e) => setInc(i, { amount: num(e.target.value) })} />
                  </td>
                  <td>
                    <input type="checkbox" style={{ width: 16 }} aria-label={`Incident ${i + 1} : régularisé`} checked={x.regularized} onChange={(e) => setInc(i, { regularized: e.target.checked })} />
                  </td>
                  <td>
                    <input aria-label={`Incident ${i + 1} : libellé`} value={x.labelFr} onChange={(e) => setInc(i, { labelFr: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="btn-ghost" aria-label={`Retirer l'incident ${i + 1}`} onClick={() => set({ data: { ...draft.data, incidents: draft.data.incidents.filter((_, k) => k !== i) } })}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        className="btn-ghost"
        style={{ justifySelf: "start", fontSize: 12 }}
        onClick={() => set({ data: { ...draft.data, incidents: [...draft.data.incidents, { date: "", kind: "IMPAYE", institution: "", amount: null, regularized: false, labelFr: "" }] } })}
      >
        + Ajouter un incident
      </button>
      <Findings items={analysis.findings} />
      <Signals codes={analysis.signals} labels={BUREAU_SIGNALS} />
    </div>
  );
}

export function CreditReportPanel({
  counterpartyId,
  caseId = null,
  report,
  apiEnabled,
  provider,
  maxAgeDays,
  today,
  canEdit,
  aiUsable,
}: {
  counterpartyId: string;
  caseId?: string | null;
  report: ReportStatus | null;
  apiEnabled: boolean;
  provider: Bureau;
  maxAgeDays: number;
  today: string;
  canEdit: boolean;
  aiUsable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const empty: ReportDraft = { bureau: provider, source: "SAISIE", reportDate: "", reference: "", data: { companyName: "", ice: "", currency: "MAD", lines: [], incidents: [], inquiries12m: null, score: "" } };
  return (
    <section id="solvabilite" className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Rapport de solvabilité (crédit bureau)</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Consultation obligatoire avant tout octroi (circulaire 1/G/2010). Le rapport se rafraîchit dans l&apos;outil du crédit bureau, puis se récupère ici
          par API ou en chargeant le PDF ou l&apos;image, lu par l&apos;IA et vérifié. Sa date de mise à jour fait foi : au-delà de {maxAgeDays} jours, il est
          signalé ancien.
        </p>
      </div>
      {report ? (
        <div style={{ display: "grid", gap: 8 }}>
          <FreshnessBanner reportDate={report.reportDate} today={today} maxAgeDays={maxAgeDays} />
          <p style={{ fontSize: 13 }}>
            {BUREAU_LABELS[report.bureau]} · {SOURCE_LABELS[report.source]}
            {report.reference ? ` · réf. ${report.reference}` : ""} · enregistré par {report.recordedBy}
            {report.documentName ? ` · pièce ${report.documentName}` : ""}
          </p>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
            <span>
              Encours total <strong>{amount(report.analysis.totals.outstanding)}</strong>
            </span>
            <span>
              chez la banque <strong>{amount(report.analysis.totals.ownOutstanding)}</strong>
            </span>
            <span>
              chez les confrères <strong>{amount(report.analysis.totals.othersOutstanding)}</strong>
            </span>
            <span>
              Impayés <strong>{amount(report.analysis.totals.overdue)}</strong>
            </span>
            <span>
              Incidents non régularisés <strong>{report.analysis.openIncidents}</strong>
            </span>
            <span>
              Établissements <strong>{report.analysis.totals.institutions}</strong>
            </span>
          </div>
          {report.data.lines.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>Lignes déclarées ({report.data.lines.length})</summary>
              <div className="table-scroll" style={{ marginTop: 6 }}>
                <table className="data" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th>Établissement</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Autorisé</th>
                      <th style={{ textAlign: "right" }}>Encours</th>
                      <th style={{ textAlign: "right" }}>Impayé</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.lines.map((l, i) => (
                      <tr key={i}>
                        <td>
                          {l.institution}
                          {l.ownBank ? " (banque)" : ""}
                        </td>
                        <td>{l.type}</td>
                        <td style={{ textAlign: "right" }}>{amount(l.authorized)}</td>
                        <td style={{ textAlign: "right" }}>{amount(l.outstanding)}</td>
                        <td style={{ textAlign: "right" }}>
                          {amount(l.overdue)}
                          {l.overdueDays ? ` (${l.overdueDays} j)` : ""}
                        </td>
                        <td>{LINE_STATUS_LABELS[l.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <Findings items={report.analysis.findings} />
          <Signals codes={report.analysis.signals} labels={BUREAU_SIGNALS} />
        </div>
      ) : (
        <p role="alert" style={{ fontSize: 13, color: "var(--warn)" }}>
          ▲ Aucun rapport de solvabilité enregistré pour ce client.
        </p>
      )}

      {canEdit && !draft && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          {apiEnabled && (
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setMsg(null);
                  const r = await fetchCreditReportAction(counterpartyId);
                  if (r.ok && r.draft) setDraft(r.draft);
                  else setMsg({ error: r.errorFr });
                })
              }
            >
              {pending ? "Récupération…" : `Récupérer le rapport (${BUREAU_LABELS[provider]})`}
            </button>
          )}
          {aiUsable && (
            <form
              action={(fd) =>
                start(async () => {
                  setMsg(null);
                  const r = await extractCreditReportAction(counterpartyId, fd);
                  if (r.ok && r.draft) {
                    setDraft(r.draft);
                    setMsg({ ok: r.okFr });
                  } else setMsg({ error: r.errorFr });
                })
              }
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <input type="file" name="file" aria-label="Rapport de solvabilité (PDF ou image)" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
              <button type="submit" className="btn-ghost" disabled={pending}>
                {pending ? "Lecture par l'IA…" : "Lire le rapport (PDF ou image)"}
              </button>
            </form>
          )}
          <button type="button" className="btn-ghost" onClick={() => setDraft(empty)}>
            Saisir manuellement
          </button>
        </div>
      )}
      {draft && (
        <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 10 }}>
          <strong style={{ fontSize: 13 }}>
            Rapport à vérifier · {SOURCE_LABELS[draft.source as ReportSource]}
            {draft.documentName ? ` · ${draft.documentName}` : ""}
          </strong>
          <ReportEditor draft={draft} onChange={setDraft} today={today} maxAgeDays={maxAgeDays} />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveCreditReportAction(counterpartyId, draft, caseId);
                  if (r.ok) {
                    setDraft(null);
                    setMsg({ ok: r.okFr });
                    router.refresh();
                  } else setMsg({ error: r.errorFr });
                })
              }
            >
              {pending ? "Enregistrement…" : "Enregistrer le rapport vérifié"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Abandonner
            </button>
          </div>
        </div>
      )}
      <Msg ok={msg?.ok} error={msg?.error} />
    </section>
  );
}

// --- Fiche juridique (InfoRisque) ---------------------------------------------------------

function ProfileView({ p }: { p: LegalProfile }) {
  const id = p.identity;
  const rows: Array<[string, string]> = (
    [
      ["Raison sociale", id.name],
      ["Forme juridique", id.legalForm],
      ["ICE", id.ice],
      ["Registre de commerce", id.rc],
      ["Identifiant fiscal", id.fiscalId],
      ["Capital social", id.capital !== null ? `${amount(id.capital)} MAD` : ""],
      ["Date de création", id.creationDate],
      ["Activité", id.activity],
      ["Adresse", [id.address, id.city].filter(Boolean).join(", ")],
      ["Effectif", id.headcount !== null ? String(id.headcount) : ""],
      ["Statut", id.status],
      ["Groupe", [p.group.name, p.group.parent && `maison mère ${p.group.parent}`].filter(Boolean).join(", ")],
      ["Score InfoRisque", [p.score.value, p.score.labelFr].filter(Boolean).join(" · ")],
      ["Comportement de paiement", p.paymentBehaviour],
    ] as Array<[string, string]>
  ).filter(([, v]) => v);
  const list = (title: string, items: Array<{ name: string; pct?: number | null; role?: string; since?: string }>) =>
    items.length ? (
      <div>
        <strong style={{ fontSize: 13 }}>{title}</strong>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
          {items.map((x, i) => (
            <li key={i}>
              {x.name}
              {x.role ? `, ${x.role}` : ""}
              {x.since ? ` (depuis ${x.since})` : ""}
              {x.pct !== null && x.pct !== undefined ? ` : ${x.pct} %` : ""}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 420 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th style={{ width: "35%" }}>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {list("Dirigeants", p.managers)}
        {list("Actionnaires", p.shareholders)}
        {list("Bénéficiaires effectifs", p.beneficialOwners)}
        {list("Filiales et participations", p.subsidiaries)}
      </div>
      {p.financials.length > 0 && (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Comptes déposés</th>
                <th style={{ textAlign: "right" }}>Chiffre d&apos;affaires</th>
                <th style={{ textAlign: "right" }}>Résultat net</th>
                <th style={{ textAlign: "right" }}>Capitaux propres</th>
                <th style={{ textAlign: "right" }}>Total bilan</th>
              </tr>
            </thead>
            <tbody>
              {p.financials.map((f) => (
                <tr key={f.year}>
                  <td>{f.year}</td>
                  <td style={{ textAlign: "right" }}>{amount(f.revenue)}</td>
                  <td style={{ textAlign: "right" }}>{amount(f.netIncome)}</td>
                  <td style={{ textAlign: "right" }}>{amount(f.equity)}</td>
                  <td style={{ textAlign: "right" }}>{amount(f.totalAssets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.legalEvents.length > 0 && (
        <div>
          <strong style={{ fontSize: 13 }}>Annonces légales</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {p.legalEvents.map((e, i) => (
              <li key={i}>
                {e.date || "date inconnue"} · {LEGAL_EVENT_LABELS[e.kind]}
                {e.labelFr ? ` : ${e.labelFr}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LegalProfilePanel({
  counterpartyId,
  profile,
  findings,
  signals,
  today,
  canEdit,
  aiUsable,
}: {
  counterpartyId: string;
  profile: LegalProfile | null;
  findings: ProfileFinding[];
  signals: string[];
  today: string;
  canEdit: boolean;
  aiUsable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<LegalProfile | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const setId = (k: keyof LegalProfile["identity"], v: string) =>
    draft && setDraft({ ...draft, identity: { ...draft.identity, [k]: k === "capital" || k === "headcount" ? (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", "."))) : v } });
  return (
    <section id="juridique" className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Fiche juridique (InfoRisque)</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Identité légale, dirigeants, actionnaires, bénéficiaires effectifs, groupe, comptes déposés au greffe et annonces légales, lus par l&apos;IA dans le
          rapport InfoRisque et vérifiés. Contrôles : identité contre la fiche, comptes déposés contre le bilan remis à la banque, événements légaux contre les
          critères BAM.
        </p>
      </div>
      {profile ? (
        <>
          <p style={{ fontSize: 13 }}>
            {PROFILE_SOURCE_LABELS[profile.source]} du {profile.reportDate || "—"}
            {profile.documentName ? ` · ${profile.documentName}` : ""}
            {profile.recordedBy ? ` · enregistré par ${profile.recordedBy}` : ""}
          </p>
          <Findings items={findings} />
          <Signals codes={signals} labels={LEGAL_SIGNALS} />
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>Détail de la fiche juridique</summary>
            <div style={{ marginTop: 8 }}>
              <ProfileView p={profile} />
            </div>
          </details>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          Aucune fiche juridique : chargez le rapport InfoRisque du client.
        </p>
      )}
      {canEdit && aiUsable && !draft && (
        <form
          action={(fd) =>
            start(async () => {
              setMsg(null);
              const r = await extractLegalProfileAction(counterpartyId, fd);
              if (r.ok && r.profile) {
                setDraft(r.profile);
                setMsg({ ok: r.okFr });
              } else setMsg({ error: r.errorFr });
            })
          }
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <input type="file" name="file" aria-label="Rapport InfoRisque (PDF ou image)" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
          <button type="submit" className="btn-ghost" disabled={pending}>
            {pending ? "Lecture par l'IA…" : "Lire le rapport InfoRisque"}
          </button>
        </form>
      )}
      {draft && (
        <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 10 }}>
          <strong style={{ fontSize: 13 }}>Fiche juridique à vérifier{draft.documentName ? ` · ${draft.documentName}` : ""}</strong>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Date du rapport *
              <input type="date" max={today} value={draft.reportDate} onChange={(e) => setDraft({ ...draft, reportDate: e.target.value })} />
            </label>
            {(["name", "legalForm", "ice", "rc", "fiscalId", "capital", "creationDate", "city", "status"] as const).map((k) => (
              <label key={k} style={{ display: "grid", gap: 4, fontSize: 12 }}>
                {
                  {
                    name: "Raison sociale",
                    legalForm: "Forme juridique",
                    ice: "ICE",
                    rc: "RC",
                    fiscalId: "Identifiant fiscal",
                    capital: "Capital social",
                    creationDate: "Date de création",
                    city: "Ville",
                    status: "Statut",
                  }[k]
                }
                <input type={k === "creationDate" ? "date" : "text"} value={draft.identity[k] ?? ""} onChange={(e) => setId(k, e.target.value)} />
              </label>
            ))}
          </div>
          <ProfileView p={draft} />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveLegalProfileAction(counterpartyId, draft);
                  if (r.ok) {
                    setDraft(null);
                    setMsg({ ok: r.okFr });
                    router.refresh();
                  } else setMsg({ error: r.errorFr });
                })
              }
            >
              {pending ? "Enregistrement…" : "Enregistrer la fiche vérifiée"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Abandonner
            </button>
          </div>
        </div>
      )}
      <Msg ok={msg?.ok} error={msg?.error} />
    </section>
  );
}
