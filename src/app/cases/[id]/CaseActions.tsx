"use client";

import { useActionState, useState } from "react";
import { cancelCaseAction, decideCaseAction, reopenCaseAction, type ActionResult } from "../actions";

function Feedback({ state }: { state: ActionResult }) {
  if (state.errorFr)
    return (
      <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
        {state.errorFr}
      </div>
    );
  if (state.okFr)
    return (
      <div role="status" style={{ color: "var(--good)", fontSize: 13 }}>
        {state.okFr}
      </div>
    );
  return null;
}

/** Reprise d'un dossier rejeté, abandon d'un brouillon. */
export function CaseActions({ caseId, status }: { caseId: string; status: string }) {
  const [reopenState, reopen, reopening] = useActionState(reopenCaseAction, { ok: false });
  const [cancelState, cancel, cancelling] = useActionState(cancelCaseAction, { ok: false });
  if (status === "REJECTED") {
    return (
      <form action={reopen} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="hidden" name="caseId" value={caseId} />
        <button type="submit" className="btn-primary" disabled={reopening}>
          Reprendre le dossier
        </button>
        <span className="muted" style={{ fontSize: 13 }}>
          Ouvre un nouveau brouillon reprenant la saisie ; ce dossier et sa notation rejetée restent dans l&apos;historique.
        </span>
        <Feedback state={reopenState} />
      </form>
    );
  }
  return (
    <form
      action={cancel}
      onSubmit={(e) => {
        if (!window.confirm("Abandonner ce dossier ? Il restera consultable mais ne pourra plus être soumis.")) e.preventDefault();
      }}
      style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}
    >
      <input type="hidden" name="caseId" value={caseId} />
      <Feedback state={cancelState} />
      <button type="submit" className="btn-danger" disabled={cancelling}>
        Abandonner le dossier
      </button>
    </form>
  );
}

export interface CircuitStepView {
  code: string;
  labelFr: string;
  whoFr: string;
  state: "DONE" | "PENDING" | "TODO" | "REJECTED";
  decidedBy?: string;
  decidedAt?: string;
  comment?: string | null;
}

/** Progression du circuit de validation, étape par étape. */
export function CircuitProgress({ steps }: { steps: CircuitStepView[] }) {
  const mark: Record<CircuitStepView["state"], { sym: string; color: string; label: string }> = {
    DONE: { sym: "✓", color: "var(--good)", label: "validée" },
    PENDING: { sym: "●", color: "var(--warn)", label: "en attente" },
    TODO: { sym: "○", color: "var(--muted)", label: "à venir" },
    REJECTED: { sym: "✕", color: "var(--bad)", label: "rejet" },
  };
  return (
    <ol aria-label="Circuit de validation" style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((s, i) => {
        const m = mark[s.state];
        return (
          <li key={s.code} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8, alignItems: "start" }}>
            <span
              aria-hidden
              style={{ width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, color: "#fff", background: m.color }}
            >
              {s.state === "TODO" || s.state === "PENDING" ? i + 1 : m.sym}
            </span>
            <div style={{ fontSize: 13 }}>
              <strong>{s.labelFr}</strong> <span style={{ color: m.color, fontWeight: 600 }}>— {m.label}</span>
              <div className="muted" style={{ fontSize: 12 }}>
                {s.decidedBy ? `${s.state === "REJECTED" ? "Rejeté" : "Validé"} par ${s.decidedBy} le ${s.decidedAt}` : s.whoFr}
                {s.comment ? ` · « ${s.comment} »` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Décision sur l'étape en attente : valider l'étape, ou rejeter avec un motif. */
export function DecisionPanel({
  caseId,
  blocker,
  steps,
  pendingLabelFr,
  isFinal,
  contributors,
}: {
  caseId: string;
  blocker: string | null;
  steps: CircuitStepView[];
  pendingLabelFr: string;
  isFinal: boolean;
  contributors: string[];
}) {
  const [state, action, pending] = useActionState(decideCaseAction, { ok: false });
  const [comment, setComment] = useState("");
  return (
    <section className="card" style={{ padding: 16, borderLeft: "4px solid var(--warn)", display: "grid", gap: 12 }}>
      <h2 style={{ fontWeight: 600 }}>Circuit de validation</h2>
      <CircuitProgress steps={steps} />
      <p className="muted" style={{ fontSize: 12 }}>
        Exclus de la validation (contributeurs du dossier) : {contributors.join(", ") || "—"}. Une même personne ne décide que d&apos;une
        étape.
      </p>
      {blocker ? (
        <>
          <Feedback state={state} />
          <p style={{ fontSize: 13 }}>Vous ne pouvez pas décider de l&apos;étape « {pendingLabelFr} » : {blocker}.</p>
        </>
      ) : (
        <form action={action} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="caseId" value={caseId} />
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Avis ou commentaire (obligatoire en cas de rejet, 10 caractères au moins)
            </div>
            <textarea name="comment" rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" name="decision" value="VALIDATED" className="btn-primary" disabled={pending}>
              {isFinal ? "Validation finale" : `Valider : ${pendingLabelFr}`}
            </button>
            <button
              type="submit"
              name="decision"
              value="REJECTED"
              className="btn-danger"
              disabled={pending || comment.trim().length < 10}
              title={comment.trim().length < 10 ? "Motif de 10 caractères au moins" : undefined}
            >
              Rejeter
            </button>
          </div>
          <Feedback state={state} />
        </form>
      )}
    </section>
  );
}
