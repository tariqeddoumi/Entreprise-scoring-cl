"use client";

import { useActionState, useState } from "react";
import { cancelDecisionAction, confirmDecisionAction, recordLiftAction, recordWatchlistAction, type CommitteeActionResult } from "./actions";

const INIT: CommitteeActionResult = { ok: false };
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  EFFECTIVE: { label: "En vigueur", color: "var(--good)" },
  EN_ATTENTE: { label: "En attente de confirmation", color: "var(--warn)" },
  ANNULEE: { label: "Annulée", color: "var(--muted)" },
};

function Feedback({ state }: { state: CommitteeActionResult }) {
  if (state.errorFr) return <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>{state.errorFr}</div>;
  if (state.okFr) return <div role="status" style={{ color: "var(--good)", fontSize: 13 }}>{state.okFr}</div>;
  return null;
}

export interface DecisionRow {
  id: string;
  kind: string;
  level?: string | null;
  codes?: string[];
  effectiveDate: string;
  committeeDate: string;
  reference: string;
  motif: string;
  status: string;
  recordedBy: string;
  confirmedBy: string | null;
  cancelReason: string | null;
}

function DecisionActions({ d, canConfirm, canCancel, caseId, counterpartyId }: { d: DecisionRow; canConfirm: boolean; canCancel: boolean; caseId?: string; counterpartyId?: string }) {
  const [cs, confirm, confirming] = useActionState(confirmDecisionAction, INIT);
  const [xs, cancel, cancelling] = useActionState(cancelDecisionAction, INIT);
  if (d.status === "ANNULEE") return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {d.status === "EN_ATTENTE" && canConfirm && (
        <form action={confirm}>
          <input type="hidden" name="decisionId" value={d.id} />
          {caseId && <input type="hidden" name="caseId" value={caseId} />}
          {counterpartyId && <input type="hidden" name="counterpartyId" value={counterpartyId} />}
          <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "3px 10px" }} disabled={confirming}>
            Confirmer
          </button>
        </form>
      )}
      {canCancel && (
        <form
          action={cancel}
          onSubmit={(e) => {
            const r = window.prompt("Motif de l'annulation (10 caractères au moins) :");
            if (!r) return e.preventDefault();
            (e.currentTarget.elements.namedItem("reason") as HTMLInputElement).value = r;
          }}
        >
          <input type="hidden" name="decisionId" value={d.id} />
          <input type="hidden" name="reason" value="" />
          {caseId && <input type="hidden" name="caseId" value={caseId} />}
          {counterpartyId && <input type="hidden" name="counterpartyId" value={counterpartyId} />}
          <button type="submit" className="btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} disabled={cancelling}>
            Annuler la décision
          </button>
        </form>
      )}
      <Feedback state={cs} />
      <Feedback state={xs} />
    </div>
  );
}

function DecisionList({ rows, canConfirm, canCancel, caseId, counterpartyId, wl }: { rows: DecisionRow[]; canConfirm: boolean; canCancel: boolean; caseId?: string; counterpartyId?: string; wl?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {rows.map((d) => {
        const st = STATUS_LABELS[d.status] ?? { label: d.status, color: "var(--muted)" };
        return (
          <li key={d.id} className="card" style={{ padding: 10, boxShadow: "none", display: "grid", gap: 4, opacity: d.status === "ANNULEE" ? 0.6 : 1 }}>
            <div style={{ fontSize: 13 }}>
              <strong>
                {wl ? (d.kind === "WL_ENTREE" ? `Watch list ${d.level ?? ""} à compter du ${d.effectiveDate}` : `Sortie de watch list le ${d.effectiveDate}`) : `Levée : ${(d.codes ?? []).join(", ")}`}
              </strong>{" "}
              <span style={{ color: st.color, fontWeight: 600 }}>· {st.label}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Comité du {d.committeeDate} · PV {d.reference} · enregistrée par {d.recordedBy}
              {d.confirmedBy ? ` · confirmée par ${d.confirmedBy}` : ""}
              {d.cancelReason ? ` · annulée : ${d.cancelReason}` : ""}
            </div>
            <div style={{ fontSize: 12 }}>{d.motif}</div>
            <DecisionActions d={d} canConfirm={canConfirm} canCancel={canCancel} caseId={caseId} counterpartyId={counterpartyId} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Levée de critères de classement sur décision de comité, sur le dossier :
 * décisions enregistrées, rappel des levées des dossiers précédents (expirées
 * au renouvellement), formulaire pour un profil habilité.
 */
export function LiftPanel({
  caseId,
  today,
  activeCriteria,
  decisions,
  previous,
  canRecord,
  canConfirm,
  holdersFr,
  open,
  doubleValidation,
}: {
  caseId: string;
  today: string;
  activeCriteria: Array<{ code: string; labelFr: string }>;
  decisions: DecisionRow[];
  previous: Array<DecisionRow & { caseAsOf: string | null }>;
  canRecord: boolean;
  canConfirm: boolean;
  holdersFr: string;
  open: boolean;
  doubleValidation: boolean;
}) {
  const [state, action, pending] = useActionState(recordLiftAction, INIT);
  if (!decisions.length && !previous.length && !(open && activeCriteria.length > 0)) return null;
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <h2 style={{ fontWeight: 600 }}>Levée de critères par le comité</h2>
      {previous.length > 0 && (
        <div role="note" style={{ fontSize: 13, borderLeft: "4px solid var(--bcp-orange)", background: "var(--surface-2)", padding: "8px 10px", borderRadius: 4 }}>
          <strong>Rappel :</strong> lors de la note précédente, le comité avait levé{" "}
          {previous.map((p) => `${(p.codes ?? []).join(", ")} (comité du ${p.committeeDate}, PV ${p.reference})`).join(" ; ")}. Ces levées ont expiré avec le
          renouvellement : si les critères sont toujours remplis, ils s&apos;appliquent de nouveau et sont à réexaminer.
        </div>
      )}
      <Feedback state={state} />
      <DecisionList rows={decisions} canConfirm={canConfirm} canCancel={canRecord} caseId={caseId} />
      {open && activeCriteria.length > 0 && (
        canRecord ? (
          <form action={action} style={{ display: "grid", gap: 8 }}>
            <input type="hidden" name="caseId" value={caseId} />
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Critères levés par le comité</legend>
              <div style={{ display: "grid", gap: 4 }}>
                {activeCriteria.map((c) => (
                  <label key={c.code} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" name="codes" value={c.code} style={{ width: 16 }} />
                    <strong>{c.code}</strong> — {c.labelFr}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid-fields">
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Date du comité</div>
                <input type="date" name="committeeDate" required max={today} defaultValue={today} />
              </label>
              <label>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>N° du procès-verbal</div>
                <input name="reference" required maxLength={80} placeholder="ex. CR-2026-118" />
              </label>
            </div>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Motif de la décision (information nouvelle, analyse du comité)</div>
              <textarea name="motif" required minLength={10} maxLength={4000} rows={3} />
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer la levée"}
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                {doubleValidation ? "Prend effet après confirmation par une seconde personne habilitée." : "Prend effet immédiatement ; la note du dossier est recalculée."} La
                levée vaut pour ce dossier.
              </span>
            </div>
          </form>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            Critères actifs : {activeCriteria.map((c) => c.code).join(", ")}. La levée, sur décision de comité, est enregistrée par : {holdersFr}.
          </p>
        )
      )}
    </section>
  );
}

/** Watch list du client : état, historique, décision de comité (profil habilité). */
export function WatchlistPanel({
  counterpartyId,
  today,
  inWatchlist,
  since,
  level,
  levelSince,
  levels,
  history,
  canRecord,
  canConfirm,
  holdersFr,
  doubleValidation,
}: {
  counterpartyId: string;
  today: string;
  inWatchlist: boolean;
  since: string | null;
  level: string | null;
  levelSince: string | null;
  levels: Array<{ code: string; labelFr: string; cap: string; reviewDays: number; renotationDays: number; helpFr?: string }>;
  history: DecisionRow[];
  canRecord: boolean;
  canConfirm: boolean;
  holdersFr: string;
  doubleValidation: boolean;
}) {
  const [state, action, pending] = useActionState(recordWatchlistAction, INIT);
  const [mode, setMode] = useState<"ENTREE" | "SORTIE">(inWatchlist ? "SORTIE" : "ENTREE");
  const pendingDecision = history.some((h) => h.status === "EN_ATTENTE");
  const lv = levels.find((l) => l.code === level);
  const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
  return (
    <section id="watchlist" className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <h2 style={{ fontWeight: 600, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        Watch list
        <span className={inWatchlist ? "wl-badge" : undefined} style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: inWatchlist ? "#fff" : "var(--good)", background: inWatchlist ? "var(--bad)" : "transparent", border: inWatchlist ? "none" : "1px solid var(--good)" }}>
          {inWatchlist ? `${level ?? ""} ${lv ? `— ${lv.labelFr}` : ""} · depuis le ${since}` : "Hors watch list"}
        </span>
      </h2>
      {inWatchlist && lv && levelSince && (
        <ul style={{ fontSize: 13, paddingLeft: 18, display: "grid", gap: 2 }}>
          <li>
            Effet sur la note : <strong>plafonnée à {lv.cap}</strong> au mieux (le plafond le plus sévère, watch list ou critères BAM, s&apos;applique).
          </li>
          <li>
            Renotation exigée avant le <strong>{addDays(levelSince, lv.renotationDays)}</strong> ; revue par la surveillance tous les {lv.reviewDays} jours (prochaine
            au plus tard le {addDays(levelSince, lv.reviewDays)}).
          </li>
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        L&apos;inscription, le changement de niveau et la sortie relèvent d&apos;une décision de comité, enregistrée avec sa date d&apos;effet, la date du comité et le
        numéro du procès-verbal. Une date passée reprend l&apos;historique d&apos;un client déjà suivi.
      </p>
      <DecisionList rows={history} canConfirm={canConfirm} canCancel={canRecord} counterpartyId={counterpartyId} wl />
      {canRecord && !pendingDecision ? (
        <form action={action} style={{ display: "grid", gap: 8 }}>
          <input type="hidden" name="counterpartyId" value={counterpartyId} />
          <input type="hidden" name="kind" value={mode === "SORTIE" ? "WL_SORTIE" : "WL_ENTREE"} />
          {inWatchlist && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="radio" style={{ width: 16 }} checked={mode === "ENTREE"} onChange={() => setMode("ENTREE")} />
                Changer de niveau
              </label>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="radio" style={{ width: 16 }} checked={mode === "SORTIE"} onChange={() => setMode("SORTIE")} />
                Sortie de watch list
              </label>
            </div>
          )}
          {mode === "ENTREE" && (
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Niveau décidé par le comité</div>
              <select name="level" required defaultValue={levels.find((l) => l.code !== level)?.code ?? ""}>
                {levels.map((l) => (
                  <option key={l.code} value={l.code} disabled={l.code === level}>
                    {l.code} — {l.labelFr} (note plafonnée à {l.cap})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid-fields">
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{mode === "SORTIE" ? "Date de sortie" : inWatchlist ? "Date du changement" : "Date d'entrée"}</div>
              <input type="date" name="effectiveDate" required max={today} defaultValue={today} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Date du comité</div>
              <input type="date" name="committeeDate" required max={today} defaultValue={today} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>N° du procès-verbal</div>
              <input name="reference" required maxLength={80} placeholder="ex. CWL-2026-07" />
            </label>
          </div>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Motif {mode === "SORTIE" ? "de la sortie" : inWatchlist ? "du changement de niveau" : "de l'inscription"}</div>
            <textarea name="motif" required minLength={10} maxLength={4000} rows={2} />
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className={mode === "SORTIE" ? "btn-ghost" : "btn-danger"} disabled={pending}>
              {pending ? "Enregistrement…" : mode === "SORTIE" ? "Enregistrer la sortie de watch list" : inWatchlist ? "Enregistrer le changement de niveau" : "Enregistrer l'entrée en watch list"}
            </button>
            {doubleValidation && <span className="muted" style={{ fontSize: 12 }}>Prend effet après confirmation par une seconde personne habilitée.</span>}
          </div>
          <Feedback state={state} />
        </form>
      ) : !canRecord ? (
        <p className="muted" style={{ fontSize: 12 }}>Décisions de watch list enregistrées par : {holdersFr}.</p>
      ) : null}
    </section>
  );
}
