"use client";

import { useState } from "react";
import type { ModelConfig, RatingResult } from "@/core/types";
import { emptyDraft, type CaseDraft } from "@/lib/case-input";
import { simulateDraftAction } from "./actions";
import { ResultPanel } from "./ResultPanel";
import { buttonGhostStyle, ScoringForm } from "./ScoringForm";

/** Simulation libre : la grille et le calcul serveur, sans dossier ni enregistrement. */
export function SimulationWorkspace({ model, canRate, today }: { model: ModelConfig; canRate: boolean; today: string }) {
  const [draft, setDraft] = useState<CaseDraft>(() => emptyDraft(model, today));
  const [result, setResult] = useState<RatingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function simulate() {
    setPending(true);
    setError(null);
    try {
      const res = await simulateDraftAction(model.modelId, draft);
      if (res.ok) setResult(res.result ?? null);
      else {
        setResult(null);
        setError(res.errorFr ?? "Erreur de validation.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 72 }}>
      <ScoringForm model={model} draft={draft} onChange={setDraft} readOnly={!canRate} />
      <div className="card no-print action-bar">
        <button type="button" className="btn-primary" onClick={simulate} disabled={pending || !canRate}>
          {pending ? "Calcul en cours…" : "Simuler la notation"}
        </button>
        <button
          type="button"
          style={buttonGhostStyle}
          onClick={() => {
            if (!window.confirm("Réinitialiser la simulation ? Toutes les valeurs saisies seront perdues.")) return;
            setDraft(emptyDraft(model, today));
            setResult(null);
            setError(null);
          }}
        >
          Réinitialiser
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          Simulation : rien n&apos;est enregistré.
        </span>
        {error && (
          <span role="alert" style={{ color: "var(--bad)" }}>
            {error}
          </span>
        )}
      </div>
      {result && <ResultPanel result={result} model={model} />}
    </div>
  );
}
