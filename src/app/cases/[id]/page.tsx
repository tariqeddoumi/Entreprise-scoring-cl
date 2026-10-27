import Link from "next/link";
import { notFound } from "next/navigation";
import { getModel } from "@/models";
import { aiStatus } from "@/lib/ai";
import { hasRole } from "@/lib/auth";
import { parseDraft, proposableFields } from "@/lib/case-input";
import { CASE_STATUS_LABELS, contributorsOf, requiredValidatorRole, validationBlocker } from "@/lib/cases";
import { formatAmount, type FxConversion } from "@/lib/fx";
import { safeQuery } from "@/lib/safe-db";
import { settingInt } from "@/lib/settings";
import { requireSession } from "@/lib/session";
import { readResultSnapshot } from "@/lib/snapshot-compat";
import { ResultPanel } from "@/app/scoring/ResultPanel";
import { GradeBadge } from "@/app/ui-helpers";
import { CaseStatusBadge } from "../CaseStatusBadge";
import { CaseActions, DecisionPanel } from "./CaseActions";
import { CaseWorkspace } from "./CaseWorkspace";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  CASE_CREATED: "Dossier ouvert",
  CASE_REOPENED: "Dossier repris après rejet",
  CASE_DRAFT_SAVED: "Brouillon enregistré",
  CASE_DOCUMENT_ADDED: "Pièce ajoutée",
  AI_PROPOSALS_GENERATED: "Analyse par l'IA",
  AI_PROPOSAL_DECIDED: "Proposition de l'IA traitée",
  CASE_SUBMITTED: "Soumis à validation",
  CASE_VALIDATED: "Validé",
  CASE_REJECTED: "Rejeté",
  CASE_CANCELLED: "Abandonné",
};

function describe(action: string, detail: string | null): string {
  if (!detail) return "";
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    switch (action) {
      case "CASE_DOCUMENT_ADDED":
        return String(d.fichier ?? "");
      case "AI_PROPOSALS_GENERATED":
        return `${d.propositions ?? 0} proposition(s), ${d.ecartees ?? 0} écartée(s) · ${d.modele ?? ""}`;
      case "AI_PROPOSAL_DECIDED":
        return `${d.champ} = ${d.valeur} · ${d.decision === "ACCEPTED" ? "acceptée" : "refusée"}`;
      case "CASE_SUBMITTED":
        return d.devise && d.devise !== "MAD" ? `montants en ${d.devise}, cours ${d.cours}` : "";
      case "CASE_REJECTED":
        return String(d.motif ?? "");
      case "CASE_REOPENED":
        return d.fromCaseId ? `reprend le dossier ${d.fromCaseId}` : "";
      default:
        return "";
    }
  } catch {
    return "";
  }
}

/**
 * Dossier de notation : saisie (brouillon), pièces et assistance de l'IA,
 * soumission, puis validation par une seconde personne.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requireSession();
  const { id } = await params;
  const canRate = hasRole(identity.role, "ANALYST");

  const { data, dbAvailable } = await safeQuery(async (db) => {
    const c = await db.ratingCase.findUnique({
      where: { id },
      include: {
        counterparty: { select: { id: true, name: true, currency: true, ice: true, entityId: true } },
        run: { select: { id: true, resultSnapshot: true, finalGrade: true, cappedGrade: true, outcome: true } },
        documents: {
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedBy: true, createdAt: true },
        },
        proposals: { where: { status: { in: ["PENDING", "ACCEPTED"] } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!c) return null;
    const entity = await db.entity.findUnique({ where: { id: c.counterparty.entityId }, select: { name: true, code: true } });
    const events = await db.auditEvent.findMany({
      where: { resourceType: "RatingCase", resourceId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: { id: true, actor: true, action: true, detail: true, createdAt: true },
    });
    const blocker = await validationBlocker(db, identity, c);
    const contributors = await contributorsOf(db, id);
    return { c, entity, events, blocker, contributors };
  }, null);

  if (!dbAvailable) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="muted">Base non connectée : les dossiers de notation sont indisponibles.</span>
      </div>
    );
  }
  if (!data) notFound();
  const { c, entity, events, blocker, contributors } = data;
  const model = getModel(c.modelId);
  if (!model) {
    return (
      <div className="card" style={{ padding: 16 }}>
        La version de modèle {c.modelId} n&apos;est plus chargée par l&apos;application.
      </div>
    );
  }

  const draft = parseDraft(c.draftInput, model, c.asOfDate);
  const fx: FxConversion | null = c.fxDetail ? (JSON.parse(c.fxDetail) as FxConversion) : null;
  const snapshot = c.run ? readResultSnapshot(c.run.resultSnapshot) : null;
  const editable = c.status === "DRAFT" && canRate;
  const ai = await aiStatus();
  const maxMb = await settingInt("DOCUMENT_MAX_MB");
  const exposure = fx?.amounts.globalBankExposure?.base ?? null;
  const validator = await requiredValidatorRole(exposure);

  const labels = new Map(proposableFields(model).map((f) => [f.key, f]));
  const proposals = c.proposals.map((p) => ({
    id: p.id,
    field: p.field,
    labelFr: labels.get(p.field)?.labelFr ?? p.field,
    kind: labels.get(p.field)?.kind ?? "number",
    value: p.value,
    source: p.source,
    rationale: p.rationale,
    confidence: p.confidence,
    status: p.status,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <p className="muted" style={{ fontSize: 13 }}>
          <Link href="/cases" style={{ color: "var(--brand)" }}>
            Dossiers
          </Link>{" "}
          ›{" "}
          <Link href={`/counterparties/${c.counterparty.id}`} style={{ color: "var(--brand)" }}>
            {c.counterparty.name}
          </Link>
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          Dossier de notation — {c.counterparty.name} <CaseStatusBadge status={c.status} />
        </h1>
        <p className="muted">
          {entity?.name ?? "—"} · {model.labelFr} v{model.version} · arrêté au {c.asOfDate} · montants en {c.counterparty.currency} ·
          ouvert par {c.createdBy} le {c.createdAt.toISOString().slice(0, 10)}
          {c.submittedBy && ` · soumis par ${c.submittedBy}`}
          {c.decidedBy && ` · ${c.status === "VALIDATED" ? "validé" : "décidé"} par ${c.decidedBy}`}
        </p>
      </div>

      {c.status === "VALIDATED" && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--good)" }}>
          <strong>Validé par {c.decidedBy}</strong> le {c.decidedAt?.toISOString().slice(0, 16).replace("T", " ")} : cette
          notation est la note officielle de la contrepartie.
          {c.decisionComment && <span className="muted"> Commentaire : {c.decisionComment}</span>}
        </div>
      )}

      {c.status === "REJECTED" && c.decisionComment && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--bad)" }}>
          <strong>Motif du rejet :</strong> {c.decisionComment}
        </div>
      )}

      {c.status === "SUBMITTED" && (
        <DecisionPanel
          caseId={c.id}
          blocker={blocker}
          requiredRole={validator.role}
          reasonFr={validator.reasonFr}
          contributors={contributors}
        />
      )}

      {(c.status === "DRAFT" || c.status === "REJECTED") && canRate && <CaseActions caseId={c.id} status={c.status} />}

      {fx && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Conversion des montants</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            Cours {fx.currency}/{fx.baseCurrency} = {fx.rate} publié le {fx.rateDate} (dernier cours à la date d&apos;arrêté).
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Montant</th>
                <th>Saisi</th>
                <th>Converti</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(fx.amounts).map(([k, v]) => (
                <tr key={k}>
                  <td>
                    {k === "annualTurnover" ? "Chiffre d'affaires" : k === "groupAnnualTurnover" ? "CA du groupe" : "Engagements bancaires"}
                  </td>
                  <td>{formatAmount(v.original, fx.currency)}</td>
                  <td>{formatAmount(v.base, fx.baseCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {c.run && snapshot && (
        <section style={{ display: "grid", gap: 8 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Notation calculée à la soumission :{" "}
            <Link href={`/rating-runs/${c.run.id}`} style={{ color: "var(--brand)" }}>
              run {c.run.id}
            </Link>{" "}
            · grade <GradeBadge grade={c.run.finalGrade} />{" "}
            {c.status === "VALIDATED" ? "— note officielle de la contrepartie" : c.status === "SUBMITTED" ? "— proposée, non validée" : "— rejetée"}
          </p>
          {snapshot.kind === "V3" && <ResultPanel result={snapshot.result} model={model} />}
        </section>
      )}

      <CaseWorkspace
        caseId={c.id}
        model={model}
        initialDraft={draft}
        currency={c.counterparty.currency}
        editable={editable}
        documents={c.documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
        proposals={proposals}
        ai={{ enabled: ai.enabled, missing: ai.missing, provider: ai.provider, model: ai.model }}
        maxMb={maxMb}
      />

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Historique du dossier</h2>
        {events.length === 0 ? (
          <p className="muted">Aucun événement.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Par</th>
                <th>Événement</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td>{e.actor}</td>
                  <td>{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {describe(e.action, e.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Statut : {CASE_STATUS_LABELS[c.status] ?? c.status}. Contributeurs (exclus de la validation) :{" "}
          {contributors.join(", ") || "—"}.
        </p>
      </section>
    </div>
  );
}
