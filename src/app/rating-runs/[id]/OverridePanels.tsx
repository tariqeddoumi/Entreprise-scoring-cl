"use client";

import { useActionState } from "react";
import { decideOverrideAction, requestOverrideAction } from "@/app/cases/actions";
import { OVERRIDE_REASON_LABELS } from "@/app/ui-helpers";

/** Demande de dérogation sur une notation validée (maker). */
export function OverrideRequestForm({
  runId,
  grades,
  currentGrade,
  maxNotches,
}: {
  runId: string;
  grades: string[];
  currentGrade: string;
  maxNotches: number;
}) {
  const [state, action, pending] = useActionState(requestOverrideAction, { ok: false });
  return (
    <details className="card" style={{ padding: 16 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Demander une dérogation</summary>
      <form action={action} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input type="hidden" name="ratingRunId" value={runId} />
        <p className="muted" style={{ fontSize: 12 }}>
          Écart de {maxNotches} cran(s) au plus depuis le grade produit par le moteur ({currentGrade}). La dérogation
          s&apos;applique après approbation par une seconde personne ; le résultat moteur reste inchangé.
        </p>
        <div className="grid-fields">
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Grade retenu
            </div>
            <select name="toGrade" defaultValue={currentGrade}>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Motif
            </div>
            <select name="reasonCode" defaultValue="DATA_NOT_CAPTURED">
              {Object.entries(OVERRIDE_REASON_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Justification (10 caractères au moins)
          </div>
          <textarea name="comment" rows={3} minLength={10} maxLength={4000} required />
        </label>
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Éléments probants (facultatif)
          </div>
          <textarea name="evidence" rows={2} maxLength={4000} />
        </label>
        <button type="submit" className="btn-primary" disabled={pending} style={{ justifySelf: "start" }}>
          Demander
        </button>
        {state.errorFr && <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>{state.errorFr}</span>}
        {state.okFr && <span role="status" style={{ color: "var(--good)", fontSize: 13 }}>{state.okFr}</span>}
      </form>
    </details>
  );
}

/** Décision sur une dérogation en attente (checker). */
export function OverrideDecision({ overrideId, runId }: { overrideId: string; runId: string }) {
  const [state, action, pending] = useActionState(decideOverrideAction, { ok: false });
  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="overrideId" value={overrideId} />
      <input type="hidden" name="ratingRunId" value={runId} />
      <input name="comment" placeholder="Commentaire" maxLength={4000} style={{ width: 160 }} />
      <button type="submit" name="decision" value="APPROVED" className="btn-ghost" disabled={pending} style={{ fontSize: 12, padding: "3px 8px" }}>
        Approuver
      </button>
      <button type="submit" name="decision" value="REJECTED" className="btn-danger" disabled={pending} style={{ fontSize: 12, padding: "3px 8px" }}>
        Rejeter
      </button>
      {state.errorFr && <span role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>{state.errorFr}</span>}
      {state.okFr && <span role="status" style={{ color: "var(--good)", fontSize: 12 }}>{state.okFr}</span>}
    </form>
  );
}
