"use client";

import { useActionState } from "react";
import { createCaseAction } from "@/app/cases/actions";

interface Props {
  models: Array<{ modelId: string; label: string }>;
  defaultModelId: string;
  counterparties: Array<{ id: string; name: string; currency: string; entityCode: string }>;
  today: string;
  canRate: boolean;
}

/** Ouverture d'un dossier : contrepartie, modèle, date d'arrêté. */
export function NewCaseForm({ models, defaultModelId, counterparties, today, canRate }: Props) {
  const [state, action, pending] = useActionState(createCaseAction, { ok: false });
  return (
    <form action={action} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2 style={{ fontWeight: 600 }}>Ouvrir un dossier de notation</h2>
      <fieldset disabled={!canRate} style={{ border: "none", padding: 0, margin: 0 }}>
        <div className="grid-fields">
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Contrepartie
            </div>
            <select name="counterpartyId" required defaultValue="">
              <option value="" disabled>
                — Choisir —
              </option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.entityCode} · {c.currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Modèle
            </div>
            <select name="modelId" defaultValue={defaultModelId}>
              {models.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Date d&apos;arrêté
            </div>
            <input type="date" name="asOfDate" required defaultValue={today} />
          </label>
        </div>
      </fieldset>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn-primary" disabled={pending || !canRate}>
          {pending ? "Ouverture…" : "Ouvrir le dossier"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          La saisie du dernier dossier validé de la contrepartie est reprise, s&apos;il existe.
        </span>
        {state.errorFr && (
          <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
            {state.errorFr}
          </span>
        )}
      </div>
    </form>
  );
}
