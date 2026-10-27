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

/** Validation par une seconde personne : valider, ou rejeter avec un motif. */
export function DecisionPanel({
  caseId,
  blocker,
  requiredRole,
  reasonFr,
  contributors,
}: {
  caseId: string;
  blocker: string | null;
  requiredRole: string;
  reasonFr: string;
  contributors: string[];
}) {
  const [state, action, pending] = useActionState(decideCaseAction, { ok: false });
  const [comment, setComment] = useState("");
  return (
    <section className="card" style={{ padding: 16, borderLeft: "4px solid var(--warn)" }}>
      <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Validation</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        Rôle requis : {requiredRole} ({reasonFr}). Exclus de la validation (contributeurs) : {contributors.join(", ") || "—"}.
      </p>
      {blocker ? (
        <p style={{ fontSize: 13 }}>Vous ne pouvez pas décider de ce dossier : {blocker}.</p>
      ) : (
        <form action={action} style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="caseId" value={caseId} />
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Commentaire (obligatoire en cas de rejet, 10 caractères au moins)
            </div>
            <textarea name="comment" rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" name="decision" value="VALIDATED" className="btn-primary" disabled={pending}>
              Valider la notation
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
