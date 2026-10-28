"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { ModelConfig, RatingResult } from "@/core/types";
import { applyField, type CaseDraft, type FieldKind } from "@/lib/case-input";
import { ResultPanel } from "@/app/scoring/ResultPanel";
import { ScoringForm } from "@/app/scoring/ScoringForm";
import { DATA_STATUS_LABELS } from "@/app/ui-helpers";
import {
  decideProposalAction,
  generateProposalsAction,
  previewCaseAction,
  saveDraftAction,
  submitCaseAction,
  uploadDocumentAction,
} from "../actions";

interface DocumentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

interface ProposalRow {
  id: string;
  field: string;
  labelFr: string;
  kind: FieldKind;
  value: string;
  source: string | null;
  rationale: string | null;
  confidence: number;
  status: string;
}

interface Props {
  caseId: string;
  model: ModelConfig;
  initialDraft: CaseDraft;
  currency: string;
  editable: boolean;
  documents: DocumentRow[];
  proposals: ProposalRow[];
  ai: { enabled: boolean; missing: string | null; provider: string; model: string };
  maxMb: number;
}

type Fx = { currency: string; rate: number; rateDate: string; amounts: Record<string, { original: number; base: number }> } | null;

/**
 * Espace de travail d'un dossier : la grille (brouillon), l'aperçu du calcul,
 * l'enregistrement, la soumission, et le panneau d'assistance de l'IA.
 */
export function CaseWorkspace({ caseId, model, initialDraft, currency, editable, documents, proposals, ai, maxMb }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<CaseDraft>(initialDraft);
  const [dirty, setDirty] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(
    () => new Set(proposals.filter((p) => p.status === "ACCEPTED").map((p) => p.field))
  );
  const [preview, setPreview] = useState<{ result: RatingResult; fx: Fx } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "preview" | "submit">(null);

  // Une saisie non enregistrée ne se perd pas sans avertissement.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(next: CaseDraft) {
    setDraft(next);
    setDirty(true);
    setPreview(null);
  }

  async function run(kind: "save" | "preview" | "submit") {
    setBusy(kind);
    setMessage(null);
    try {
      if (kind === "save") {
        const r = await saveDraftAction(caseId, draft);
        setMessage({ ok: r.ok, text: r.ok ? (r.okFr ?? "Enregistré.") : (r.errorFr ?? "Échec.") });
        if (r.ok) setDirty(false);
      } else if (kind === "preview") {
        const r = await previewCaseAction(caseId, draft);
        if (r.ok && r.result) setPreview({ result: r.result, fx: (r.fx ?? null) as Fx });
        else setMessage({ ok: false, text: r.errorFr ?? "Échec du calcul." });
      } else {
        if (!window.confirm("Soumettre le dossier ? La notation sera calculée et figée, puis transmise pour validation à une autre personne.")) return;
        const r = await submitCaseAction(caseId, draft);
        if (r.ok) {
          setDirty(false);
          router.refresh();
        } else setMessage({ ok: false, text: r.errorFr ?? "Échec de la soumission." });
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Erreur inattendue." });
    } finally {
      setBusy(null);
    }
  }

  function applyProposal(field: string, value: string) {
    setDraft((d) => applyField(d, field, value));
    setAiFields((s) => new Set(s).add(field));
    setDirty(true);
    setPreview(null);
  }

  if (!editable) {
    return (
      <details className="card" style={{ padding: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Saisie du dossier (lecture seule)</summary>
        <div style={{ marginTop: 14 }}>
          <ScoringForm model={model} draft={draft} onChange={() => undefined} readOnly currency={currency} aiFields={aiFields} />
        </div>
      </details>
    );
  }

  return (
    <div className="workspace">
      <div style={{ display: "grid", gap: 18, paddingBottom: 72, minWidth: 0 }}>
        <ScoringForm model={model} draft={draft} onChange={change} currency={currency} aiFields={aiFields} />
        <div className="card no-print action-bar">
          <button type="button" className="btn-ghost" onClick={() => run("save")} disabled={busy !== null}>
            {busy === "save" ? "Enregistrement…" : "Enregistrer le brouillon"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => run("preview")} disabled={busy !== null}>
            {busy === "preview" ? "Calcul…" : "Aperçu du calcul"}
          </button>
          <button type="button" className="btn-primary" onClick={() => run("submit")} disabled={busy !== null}>
            {busy === "submit" ? "Soumission…" : "Soumettre à validation"}
          </button>
          {dirty && <span className="muted" style={{ fontSize: 12 }}>Modifications non enregistrées</span>}
          {message && (
            <span role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--good)" : "var(--bad)", fontSize: 13 }}>
              {message.text}
            </span>
          )}
        </div>
        {preview && (
          <div style={{ display: "grid", gap: 8 }}>
            <p className="muted" style={{ fontSize: 13 }}>
              Aperçu, non enregistré
              {preview.fx && preview.fx.currency !== "MAD"
                ? ` · montants convertis au cours ${preview.fx.currency}/MAD ${preview.fx.rate} du ${preview.fx.rateDate}`
                : ""}
              . La soumission recalcule exactement la même requête.
            </p>
            <ResultPanel result={preview.result} model={model} />
          </div>
        )}
      </div>
      <aside className="side-panel no-print">
        <AiPanel
          caseId={caseId}
          model={model}
          documents={documents}
          proposals={proposals.filter((p) => p.status === "PENDING")}
          ai={ai}
          maxMb={maxMb}
          onApply={applyProposal}
        />
      </aside>
    </div>
  );
}

function formatValue(kind: FieldKind, value: string, model: ModelConfig, field: string): string {
  if (kind === "boolean") return value === "true" ? "Oui" : "Non";
  if (kind === "status") return DATA_STATUS_LABELS[value] ?? value;
  if (kind === "anchor") {
    const code = field.slice("criteria.".length, field.lastIndexOf("."));
    const anchor = model.criteria.find((c) => c.code === code)?.anchors?.find((a) => String(a.score) === value);
    return anchor ? `${value} — ${anchor.labelFr}` : value;
  }
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) >= 1000 ? n.toLocaleString("fr-FR") : value;
}

function AiPanel({
  caseId,
  model,
  documents,
  proposals,
  ai,
  maxMb,
  onApply,
}: {
  caseId: string;
  model: ModelConfig;
  documents: DocumentRow[];
  proposals: ProposalRow[];
  ai: Props["ai"];
  maxMb: number;
  onApply: (field: string, value: string) => void;
}) {
  const router = useRouter();
  const [uploadState, upload, uploading] = useActionState(uploadDocumentAction, { ok: false });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(documents.map((d) => d.id)));
  const [notes, setNotes] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; summary?: string } | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const usable = ai.enabled && !ai.missing;

  // Une pièce ajoutée est cochée d'office pour la prochaine analyse.
  useEffect(() => {
    setSelected((s) => {
      const next = new Set(s);
      for (const d of documents) if (!s.has(d.id)) next.add(d.id);
      return next;
    });
  }, [documents]);

  async function analyse() {
    setAnalysing(true);
    setResult(null);
    try {
      const r = await generateProposalsAction(caseId, [...selected], notes);
      setResult({ ok: r.ok, text: r.ok ? (r.okFr ?? "") : (r.errorFr ?? "Échec."), summary: r.summary });
      if (r.ok) {
        setDecided(new Set());
        router.refresh();
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Erreur inattendue." });
    } finally {
      setAnalysing(false);
    }
  }

  async function decide(p: ProposalRow, accept: boolean) {
    setError(null);
    const r = await decideProposalAction(p.id, accept);
    if (!r.ok) {
      setError(r.errorFr ?? "Échec.");
      return false;
    }
    setDecided((s) => new Set(s).add(p.id));
    if (accept && r.field && r.value !== undefined) onApply(r.field, r.value);
    return true;
  }

  async function acceptConfident() {
    for (const p of open.filter((x) => x.confidence >= 80)) {
      if (!(await decide(p, true))) break;
    }
  }

  const open = proposals.filter((p) => !decided.has(p.id));

  return (
    <>
      <section className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <h2 style={{ fontWeight: 600 }}>Pièces du dossier</h2>
        {documents.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>Aucune pièce. États financiers, liasse fiscale, rapport de gestion, extrait RC…</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {documents.map((d) => (
              <li key={d.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  style={{ width: 14 }}
                  aria-label={`Inclure ${d.fileName} dans l'analyse`}
                  checked={selected.has(d.id)}
                  disabled={!usable}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(d.id);
                      else n.delete(d.id);
                      return n;
                    })
                  }
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={d.fileName}>
                  {d.fileName}
                </span>
                <span className="muted">{Math.max(1, Math.round(d.sizeBytes / 1024))} ko</span>
              </li>
            ))}
          </ul>
        )}
        <form action={upload} style={{ display: "grid", gap: 6 }}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="file" name="file" multiple aria-label="Pièces à ajouter au dossier" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,application/pdf,image/png,image/jpeg,text/plain,text/csv" />
          <button type="submit" className="btn-ghost" disabled={uploading}>
            {uploading ? "Envoi…" : "Ajouter"}
          </button>
          <span className="muted" style={{ fontSize: 11 }}>PDF, PNG, JPEG, texte ou CSV · {maxMb} Mo au plus par pièce.</span>
          {uploadState.errorFr && <span style={{ color: "var(--bad)", fontSize: 12 }}>{uploadState.errorFr}</span>}
        </form>
      </section>

      <section className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
        <h2 style={{ fontWeight: 600 }}>Assistance de l&apos;IA</h2>
        {!ai.enabled ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Désactivée. Un administrateur l&apos;active dans Paramétrage › Intelligence artificielle.
          </p>
        ) : ai.missing ? (
          <p style={{ fontSize: 12, color: "var(--warn)" }}>Activée mais non configurée : {ai.missing}.</p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12 }}>
              L&apos;IA lit les pièces cochées et propose des valeurs pour la grille, avec leur source. Rien n&apos;est appliqué sans votre accord.
              Fournisseur : {ai.provider} · {ai.model}.
            </p>
            <textarea
              rows={4}
              placeholder="Éléments complémentaires (facultatif) : compte rendu de visite, faits récents, incidents de paiement…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={20000}
            />
            <button type="button" className="btn-primary" onClick={analyse} disabled={analysing || (selected.size === 0 && !notes.trim())}>
              {analysing ? "Analyse en cours (jusqu'à 2 minutes)…" : "Proposer des valeurs"}
            </button>
            {result && (
              <div role={result.ok ? "status" : "alert"} style={{ fontSize: 12, color: result.ok ? "var(--text)" : "var(--bad)" }}>
                {result.text}
                {result.summary && <p className="muted" style={{ marginTop: 6 }}>{result.summary}</p>}
              </div>
            )}
          </>
        )}
      </section>

      {open.length > 0 && (
        <section className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <h2 style={{ fontWeight: 600 }}>Propositions ({open.length})</h2>
            {open.some((p) => p.confidence >= 80) && (
              <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "3px 8px" }} onClick={acceptConfident}>
                Accepter celles ≥ 80 %
              </button>
            )}
          </div>
          {error && <span style={{ color: "var(--bad)", fontSize: 12 }}>{error}</span>}
          {open.map((p) => (
            <article key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{p.labelFr}</div>
              <div style={{ fontSize: 13 }}>
                <strong>{formatValue(p.kind, p.value, model, p.field)}</strong>{" "}
                <span className="muted" style={{ fontSize: 11 }}>
                  confiance {p.confidence} %
                </span>
              </div>
              {p.rationale && <div className="muted" style={{ fontSize: 11 }}>{p.rationale}</div>}
              {p.source && <div className="muted" style={{ fontSize: 11, fontStyle: "italic" }}>Source : {p.source}</div>}
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => decide(p, true)}>
                  Accepter
                </button>
                <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => decide(p, false)}>
                  Refuser
                </button>
              </div>
            </article>
          ))}
          <p className="muted" style={{ fontSize: 11 }}>
            Accepter applique la valeur à la grille (repère « IA ») ; enregistrez ensuite le brouillon. Accepter ou refuser vous rend contributeur du dossier.
          </p>
        </section>
      )}
    </>
  );
}
