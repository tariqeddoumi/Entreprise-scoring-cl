import Link from "next/link";
import { notFound } from "next/navigation";
import { getScoringModel, today } from "@/lib/rating-scale";
import { effectiveFormat, formatByVersion } from "@/lib/statement-format";
import { loadCreditTypes, loadPurposes } from "@/lib/financial-statements";
import { DEFAULT_CREDIT_TYPES, DEFAULT_PURPOSES } from "@/reference/case-purposes";
import { aiStatus } from "@/lib/ai";
import { hasRole } from "@/lib/auth";
import { draftClassification, draftFinancials, parseDraft, proposableFields } from "@/lib/case-input";
import { CASE_STATUS_LABELS, caseWorkflow, contributorsOf, validationBlocker } from "@/lib/cases";
import { actorStepIndex, hasPermission, holdersOf, pendingStepIndex, WORKFLOW_ROLE_LABELS, type CaseWorkflow } from "@/reference/workflow";
import { activeWatchlistCap, caseLifts, counterpartyLifts, loadClassification, watchlistState } from "@/lib/committee";
import { DEFAULT_CLASSIFICATION, type WatchlistCap } from "@/reference/classification";
import { LiftPanel } from "@/app/committee/CommitteePanels";
import { loadCircuit } from "@/lib/workflow";
import { formatAmount, type FxConversion } from "@/lib/fx";
import { safeQuery } from "@/lib/safe-db";
import { settingBool, settingInt } from "@/lib/settings";
import { requireSession } from "@/lib/session";
import { readResultSnapshot } from "@/lib/snapshot-compat";
import { ResultPanel } from "@/app/scoring/ResultPanel";
import { GradeBadge } from "@/app/ui-helpers";
import { CaseStatusBadge } from "../CaseStatusBadge";
import { CaseActions, CircuitProgress, DecisionPanel, type CircuitStepView } from "./CaseActions";
import { CaseWorkspace } from "./CaseWorkspace";
import { FinancialBasisPanel, readFinancialBasis } from "@/app/scoring/FinancialBasisPanel";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  CASE_CREATED: "Dossier ouvert",
  CASE_REOPENED: "Dossier repris après rejet",
  CASE_DRAFT_SAVED: "Brouillon enregistré",
  CASE_DOCUMENT_ADDED: "Pièce ajoutée",
  AI_PROPOSALS_GENERATED: "Analyse par l'IA",
  AI_PROPOSAL_DECIDED: "Proposition de l'IA traitée",
  CASE_SUBMITTED: "Soumis à validation",
  CASE_STEP_APPROVED: "Étape de validation franchie",
  CASE_VALIDATED: "Validation finale",
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
      case "CASE_STEP_APPROVED":
      case "CASE_VALIDATED":
      case "CASE_REJECTED":
        return [d.libelleEtape ? `${d.libelleEtape}${d.rang ? ` (étape ${d.rang}/${d.etapes})` : ""}` : "", d.motif ? `motif : ${d.motif}` : ""].filter(Boolean).join(" · ");
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
        run: { select: { id: true, resultSnapshot: true, inputSnapshot: true, finalGrade: true, cappedGrade: true, outcome: true } },
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
    // Dossier de revue ouvert par une renotation par lot : son origine et la
    // migration constatée orientent l'instruction.
    const fromBatch = await db.renotationItem.findFirst({
      where: { caseId: id },
      orderBy: { processedAt: "desc" },
      select: { batchId: true, previousGrade: true, newGrade: true, notchDelta: true, movement: true, messageFr: true, batch: { select: { name: true } } },
    });
    return { c, entity, events, blocker, contributors, fromBatch };
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
  const model = await getScoringModel(c.modelId);
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
  // Dossier en cours : format en vigueur ; dossier soumis : celui figé dans la notation.
  const frozenBasis = c.run ? readFinancialBasis(c.run.inputSnapshot) : null;
  const format = c.status === "DRAFT" ? await effectiveFormat(today()) : await formatByVersion(frozenBasis?.formatVersion, today());
  const ai = await aiStatus();
  // Critères de classement BAM, levées de comité (ce dossier, rappel des précédents), watch list.
  const committee = (
    await safeQuery(
      async (db) => {
        const [classification, lifts, all, wl, wlCap] = await Promise.all([
          loadClassification(db),
          caseLifts(db, c.id),
          counterpartyLifts(db, c.counterparty.id),
          watchlistState(db, c.counterparty.id),
          activeWatchlistCap(db, c.counterparty.id),
        ]);
        const otherIds = [...new Set(all.filter((d) => d.caseId && d.caseId !== c.id && d.status === "EFFECTIVE").map((d) => d.caseId!))];
        const others = otherIds.length ? await db.ratingCase.findMany({ where: { id: { in: otherIds } }, select: { id: true, asOfDate: true, status: true, decidedAt: true }, orderBy: { decidedAt: "desc" } }) : [];
        const lastOther = others.find((o) => o.status === "VALIDATED");
        return { classification, lifts, all, wl, wlCap, lastOtherId: lastOther?.id ?? null, lastOtherAsOf: lastOther?.asOfDate ?? null };
      },
      { classification: DEFAULT_CLASSIFICATION, lifts: [], all: [], wl: { inWatchlist: false, since: null, level: null, levelSince: null, lastExit: null, history: [] }, wlCap: null as WatchlistCap | null, lastOtherId: null, lastOtherAsOf: null }
    )
  ).data;
  const { circuit: circuitDef } = await loadCircuit();
  const liftDouble = await settingBool("COMMITTEE_LIFT_DOUBLE_VALIDATION");
  const cumulNotch = await settingInt("WATCHLIST_CUMUL_NOTCH");
  const activeCriteria = (() => {
    const cl = draftClassification(draft, draftFinancials(draft, model, format), committee.classification, committee.lifts);
    return cl.items.filter((i) => i.state === "COCHE").map((i) => ({ code: i.code, labelFr: i.labelFr }));
  })();
  const toRow = (d: (typeof committee.all)[number]) => ({
    id: d.id,
    kind: d.kind,
    codes: d.codes,
    effectiveDate: d.effectiveDate,
    committeeDate: d.committeeDate,
    reference: d.reference,
    motif: d.motif,
    status: d.status,
    recordedBy: d.recordedBy,
    confirmedBy: d.confirmedBy,
    cancelReason: d.cancelReason,
  });
  const refs = (await safeQuery(async (db) => ({ purposes: await loadPurposes(db), creditTypes: await loadCreditTypes(db) }), { purposes: DEFAULT_PURPOSES, creditTypes: DEFAULT_CREDIT_TYPES })).data;
  const purposeLabel = [
    c.purpose ? (refs.purposes.find((p) => p.code === c.purpose)?.labelFr ?? c.purpose) : null,
    c.creditType ? (refs.creditTypes.find((t) => t.code === c.creditType)?.labelFr ?? c.creditType) : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;
  const maxMb = await settingInt("DOCUMENT_MAX_MB");
  const workflow = c.status === "SUBMITTED" || c.status === "VALIDATED" || c.status === "REJECTED" ? await caseWorkflow(c) : null;
  const circuit = workflow ? stepsView(workflow, c) : [];
  const pendingIdx = workflow ? pendingStepIndex(workflow) : null;

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
          {purposeLabel ? <><strong style={{ color: "var(--text)" }}>{purposeLabel}</strong> · </> : null}
          {entity?.name ?? "—"} · {model.labelFr} v{model.version} · arrêté au {c.asOfDate} · montants en {c.counterparty.currency} ·
          ouvert par {c.createdBy} le {c.createdAt.toISOString().slice(0, 10)}
          {c.submittedBy && ` · soumis par ${c.submittedBy}`}
          {c.decidedBy && ` · ${c.status === "VALIDATED" ? "validé" : "décidé"} par ${c.decidedBy}`}
        </p>
      </div>

      {data.fromBatch && c.status === "DRAFT" && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--warn)", fontSize: 14 }}>
          <strong>Dossier de revue</strong> ouvert par la renotation «{" "}
          <Link href={`/renotation/${data.fromBatch.batchId}`} style={{ color: "var(--brand)" }}>
            {data.fromBatch.batch.name}
          </Link>{" "}
          » : note officielle {data.fromBatch.previousGrade ?? "—"}, note de surveillance {data.fromBatch.newGrade ?? "sans note"}
          {data.fromBatch.notchDelta ? ` (${data.fromBatch.notchDelta > 0 ? "+" : ""}${data.fromBatch.notchDelta} cran(s))` : ""}. La saisie
          reprend le dernier dossier validé, avec les données rafraîchies et la nouvelle date d&apos;arrêté : vérifiez-la, complétez-la,
          puis soumettez-la à validation.
          {data.fromBatch.messageFr && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{data.fromBatch.messageFr}</div>}
        </div>
      )}

      {c.status === "VALIDATED" && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--good)" }}>
          <strong>Validé par {c.decidedBy}</strong> le {c.decidedAt?.toISOString().slice(0, 16).replace("T", " ")} : cette
          notation est la note officielle du client.
          {c.decisionComment && <span className="muted"> Commentaire : {c.decisionComment}</span>}
        </div>
      )}

      {c.status === "REJECTED" && c.decisionComment && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--bad)" }}>
          <strong>Motif du rejet :</strong> {c.decisionComment}
        </div>
      )}

      {c.status === "SUBMITTED" && workflow && pendingIdx !== null && (() => {
        // Étape que la personne connectée peut traiter (un avis ouvert ou l'étape en attente).
        const mineIdx = actorStepIndex(workflow, { name: identity.name, role: identity.role, jobFunction: identity.jobFunction ?? null });
        const target = workflow.steps[mineIdx ?? pendingIdx];
        return (
          <DecisionPanel
            caseId={c.id}
            blocker={blocker}
            steps={circuit}
            pendingLabelFr={target.labelFr}
            kind={target.kind === "AVIS" ? "AVIS" : target.kind === "DECISION" ? "DECISION" : mineIdx === workflow.steps.length - 1 || pendingIdx === workflow.steps.length - 1 ? "FINAL" : "VALIDATION"}
            contributors={contributors}
          />
        );
      })()}

      {(c.status === "VALIDATED" || c.status === "REJECTED") && circuit.length > 0 && (
        <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <h2 style={{ fontWeight: 600 }}>Circuit de validation</h2>
          <CircuitProgress steps={circuit} />
        </section>
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
        <section style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Notation calculée à la soumission :{" "}
            <Link href={`/rating-runs/${c.run.id}`} style={{ color: "var(--brand)" }}>
              run {c.run.id}
            </Link>{" "}
            · grade <GradeBadge grade={c.run.finalGrade} />{" "}
            {c.status === "VALIDATED" ? "— note officielle du client" : c.status === "SUBMITTED" ? "— proposée, non validée" : "— rejetée"}
          </p>
          {(() => {
            // Le valideur voit le bilan sur lequel la note a été calculée.
            const basis = readFinancialBasis(c.run.inputSnapshot);
            return basis ? <FinancialBasisPanel basis={basis} model={model} format={format} /> : null;
          })()}
          {snapshot.kind === "V3" && <ResultPanel result={snapshot.result} model={model} />}
        </section>
      )}

      {committee.wl.inWatchlist && (
        <div className="card" role="status" style={{ padding: 12, borderLeft: "4px solid var(--bad)", fontSize: 14 }}>
          <strong>Client en watch list</strong>
          {committee.wlCap ? ` ${committee.wlCap.level} — ${committee.wlCap.labelFr}` : ""} depuis le {committee.wl.since} (décision de comité) : note plafonnée à{" "}
          {committee.wlCap?.cap ?? "—"} au mieux —{" "}
          <Link href={`/counterparties/${c.counterparty.id}#watchlist`} style={{ color: "var(--brand)" }}>
            voir l&apos;historique
          </Link>
          .
        </div>
      )}

      <LiftPanel
        caseId={c.id}
        today={today()}
        activeCriteria={activeCriteria}
        decisions={committee.all.filter((d) => d.caseId === c.id).map(toRow)}
        previous={committee.lastOtherId ? committee.all.filter((d) => d.caseId === committee.lastOtherId && d.status === "EFFECTIVE").map((d) => ({ ...toRow(d), caseAsOf: committee.lastOtherAsOf })) : []}
        canRecord={hasPermission(circuitDef, identity.jobFunction, "LEVER_CRITERE")}
        canConfirm={hasPermission(circuitDef, identity.jobFunction, "CONFIRMER_LEVEE")}
        holdersFr={holdersOf(circuitDef, "LEVER_CRITERE").map((f) => f.labelFr).join(", ") || "aucun profil"}
        open={c.status === "DRAFT" || c.status === "SUBMITTED"}
        doubleValidation={liftDouble}
      />

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
        format={format}
        classification={committee.classification}
        lifts={committee.lifts}
        watchlist={committee.wlCap}
        cumulNotch={cumulNotch}
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

/** Vue des étapes du circuit : décision, attente ou à venir. */
function stepsView(
  w: CaseWorkflow,
  c: { status: string; workflow: string | null; decidedBy: string | null; decidedAt: Date | null; decisionComment: string | null }
): CircuitStepView[] {
  const pending = pendingStepIndex(w);
  const legacyDone = !c.workflow && (c.status === "VALIDATED" || c.status === "REJECTED");
  return w.steps.map((rawStep, i) => {
    // Niveau de décision inférieur devenu instruction pour ce dossier.
    const st = rawStep.instruction ? { ...rawStep, labelFr: `${rawStep.labelFr.replace(/\s*:\s*décision$/i, "")} : instruction` } : rawStep;
    const d = w.decisions.find((x) => x.step === st.code);
    const nature = st.kind === "AVIS" ? (st.instruction ? "instruction, avis bloquant" : st.blocking ? "avis bloquant" : "avis non bloquant") : st.kind === "DECISION" ? "décision" : null;
    const whoFr = `${nature ? `${nature[0].toUpperCase()}${nature.slice(1)} · ` : ""}${st.functionLabels.length > 0 ? st.functionLabels.join(", ") : "Toute fonction"} · rôle ${WORKFLOW_ROLE_LABELS[st.minRole] ?? st.minRole} au moins`;
    if (d) {
      const state = d.decision === "APPROVED" ? "DONE" : d.decision === "REJECTED" ? "REJECTED" : d.decision === "FAVORABLE" ? "FAVORABLE" : "DEFAVORABLE";
      return { code: st.code, labelFr: st.labelFr, whoFr, state, decidedBy: d.by, decidedAt: d.at.slice(0, 16).replace("T", " "), comment: d.comment };
    }
    if (st.kind === "AVIS" && !st.blocking && c.status !== "SUBMITTED") {
      return { code: st.code, labelFr: st.labelFr, whoFr, state: "SKIPPED" };
    }
    if (st.kind === "AVIS" && !st.blocking && c.status === "SUBMITTED") {
      return { code: st.code, labelFr: st.labelFr, whoFr, state: "OPEN" };
    }
    if (legacyDone && i === 0) {
      return {
        code: st.code,
        labelFr: st.labelFr,
        whoFr,
        state: c.status === "VALIDATED" ? "DONE" : "REJECTED",
        decidedBy: c.decidedBy ?? undefined,
        decidedAt: c.decidedAt?.toISOString().slice(0, 16).replace("T", " "),
        comment: c.decisionComment,
      };
    }
    return { code: st.code, labelFr: st.labelFr, whoFr, state: c.status === "SUBMITTED" && i === pending ? "PENDING" : "TODO" };
  });
}
