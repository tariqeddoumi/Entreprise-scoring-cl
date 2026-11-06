"use client";

import { useActionState, useState } from "react";
import { createCaseAction } from "@/app/cases/actions";
import { GradeBadge } from "@/app/ui-helpers";
import { nextClosing, suggestedExercise, type CasePurpose, type ExerciseChoice } from "@/reference/case-purposes";

interface LastRating {
  fiscalYear: string;
  closingDate: string;
  grade: string | null;
  decidedAt: string | null;
}

interface Props {
  models: Array<{ modelId: string; label: string }>;
  defaultModelId: string;
  counterparties: Array<{
    id: string;
    name: string;
    currency: string;
    entityCode: string;
    /** Dernier bilan au référentiel et dernière note validée. */
    last?: LastRating;
  }>;
  /** Motifs actifs (paramétrage). */
  purposes: CasePurpose[];
  today: string;
  canRate: boolean;
  /** Ouverture depuis la fiche client : le client est imposé. */
  fixedCounterpartyId?: string;
}

const nextYear = (l: LastRating) => (/^\d{4}$/.test(l.fiscalYear) ? String(Number(l.fiscalYear) + 1) : nextClosing(l.closingDate).slice(0, 4));

/**
 * Ouverture d'un dossier : client, motif, modèle, date d'arrêté et exercice du
 * bilan. Avec une note validée, son bilan est repris : soit tel quel (même
 * exercice), soit décalé d'un an (N devient N−1) et seul le nouveau bilan est
 * à charger.
 */
export function NewCaseForm({ models, defaultModelId, counterparties, purposes, today, canRate, fixedCounterpartyId }: Props) {
  const [state, action, pending] = useActionState(createCaseAction, { ok: false });
  const [counterpartyId, setCounterpartyId] = useState(fixedCounterpartyId ?? "");
  const [purposeCode, setPurposeCode] = useState("");
  const [asOfDate, setAsOfDate] = useState(today);
  const [chosen, setChosen] = useState<ExerciseChoice | null>(null);
  const last = counterparties.find((c) => c.id === counterpartyId)?.last;
  const purpose = purposes.find((p) => p.code === purposeCode);
  const exercise: ExerciseChoice = chosen ?? suggestedExercise(last?.closingDate, asOfDate, purpose);

  return (
    <form action={action} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2 style={{ fontWeight: 600 }}>{fixedCounterpartyId ? "Noter ce client" : "Ouvrir un dossier de notation"}</h2>
      <fieldset disabled={!canRate} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {fixedCounterpartyId && <input type="hidden" name="counterpartyId" value={fixedCounterpartyId} />}
        <div className="grid-fields">
          {!fixedCounterpartyId && (
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Client
              </div>
              <select
                name="counterpartyId"
                required
                value={counterpartyId}
                onChange={(e) => {
                  setCounterpartyId(e.target.value);
                  setChosen(null);
                }}
              >
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
          )}
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Motif du dossier
            </div>
            <select
              name="purpose"
              required
              value={purposeCode}
              onChange={(e) => {
                setPurposeCode(e.target.value);
                setChosen(null);
              }}
            >
              <option value="" disabled>
                — Choisir —
              </option>
              {purposes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.labelFr}
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
            <input type="date" name="asOfDate" required value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </label>
        </div>

        {counterpartyId && (
          <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Bilan du dossier</strong>
            {last ? (
              <>
                <p style={{ fontSize: 13 }}>
                  {last.grade ? (
                    <>
                      Dernière note validée <GradeBadge grade={last.grade} />
                      {last.decidedAt ? ` le ${last.decidedAt}` : ""} ·{" "}
                    </>
                  ) : null}
                  dernier bilan au dossier du client : exercice <strong>{last.fiscalYear}</strong>, clos le {last.closingDate}.
                </p>
                <input type="hidden" name="exercise" value={exercise} />
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="radio" name="exerciseChoice" style={{ width: 16, marginTop: 2 }} checked={exercise === "CONSERVE"} onChange={() => setChosen("CONSERVE")} />
                  <span>
                    <strong>Conserver l&apos;exercice {last.fiscalYear}</strong> — le bilan de la dernière note est repris tel quel, rien à recharger.
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="radio" name="exerciseChoice" style={{ width: 16, marginTop: 2 }} checked={exercise === "SUIVANT"} onChange={() => setChosen("SUIVANT")} />
                  <span>
                    <strong>Passer à l&apos;exercice {nextYear(last)}</strong> (clôture {nextClosing(last.closingDate) || "à préciser"}) — {last.fiscalYear} devient
                    N−1 et l&apos;exercice précédent N−2, repris automatiquement ; seul le bilan {nextYear(last)} est à charger.
                  </span>
                </label>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun bilan au dossier du client : le bilan (N et N−1, N−2 facultatif) est à charger en entier.
              </p>
            )}
          </div>
        )}
      </fieldset>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="btn-primary" disabled={pending || !canRate}>
          {pending ? "Ouverture…" : "Ouvrir le dossier"}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          La saisie de la dernière note validée est reprise ; chaque champ repris est signalé, à confirmer ou à mettre à jour.
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
