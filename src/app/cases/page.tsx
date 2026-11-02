import Link from "next/link";
import type { Prisma } from "@/generated/prisma";
import { hasRole } from "@/lib/auth";
import { caseWorkflow, CASE_STATUSES, OFFICIAL_RUN_WHERE } from "@/lib/cases";
import { pendingStepIndex, stepConcerns } from "@/reference/workflow";
import { settingInt } from "@/lib/settings";
import { safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge } from "@/app/ui-helpers";
import { CaseStatusBadge } from "./CaseStatusBadge";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "todo", label: "À traiter" },
  { key: "DRAFT", label: "Brouillons" },
  { key: "SUBMITTED", label: "En validation" },
  { key: "VALIDATED", label: "Validés" },
  { key: "REJECTED", label: "Rejetés" },
  { key: "CANCELLED", label: "Abandonnés" },
  { key: "all", label: "Tous" },
] as const;

/**
 * Dossiers de notation du périmètre. « À traiter » rassemble ce qui attend
 * l'utilisateur : ses brouillons et ses dossiers rejetés à reprendre, et les
 * dossiers dont l'étape en attente du circuit lui revient (fonction et rôle).
 */
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const identity = await requireSession();
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "todo";
  const decider = hasRole(identity.role, "ANALYST");

  let where: Prisma.RatingCaseWhereInput = {};
  if (tab === "todo") {
    where = {
      OR: [
        { status: { in: ["DRAFT", "REJECTED"] }, createdBy: identity.name },
        ...(decider ? [{ status: "SUBMITTED", submittedBy: { not: identity.name } }] : []),
      ],
    };
  } else if ((CASE_STATUSES as readonly string[]).includes(tab)) {
    where = { status: tab };
  }

  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      const [cases, counts] = await Promise.all([
        db.ratingCase.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: 200,
          include: {
            counterparty: { select: { id: true, name: true, currency: true, entityId: true } },
            run: { select: { finalGrade: true } },
          },
        }),
        db.ratingCase.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);
      const entities = await db.entity.findMany({ select: { id: true, code: true } });
      // Étape en attente de chaque dossier soumis ; « À traiter » ne garde que
      // les dossiers dont l'étape revient à l'utilisateur.
      const actor = { name: identity.name, role: identity.role, jobFunction: identity.jobFunction ?? null };
      const stepOf = new Map<string, string>();
      const mine = new Set<string>();
      for (const c of cases) {
        if (c.status !== "SUBMITTED") continue;
        const w = await caseWorkflow(c);
        const i = pendingStepIndex(w);
        if (i !== null) stepOf.set(c.id, `${w.steps[i].labelFr} (${i + 1}/${w.steps.length})`);
        if (stepConcerns(w, actor)) mine.add(c.id);
      }
      const shown = tab === "todo" ? cases.filter((c) => c.status !== "SUBMITTED" || mine.has(c.id)) : cases;
      return { cases: shown, counts, entityCode: new Map(entities.map((e) => [e.id, e.code])), stepOf };
    },
    { cases: [], counts: [], entityCode: new Map<string, string>(), stepOf: new Map<string, string>() }
  );
  const count = (s: string) => data.counts.find((c) => c.status === s)?._count._all ?? 0;

  // Notes à renouveler : dernière notation officielle plus ancienne que la
  // durée de validité paramétrée (Paramétrage › Workflow).
  const validityMonths = await settingInt("RATING_VALIDITY_MONTHS");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - validityMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const { data: renewals } = await safeQuery(
    async (db) => {
      const latest = await db.ratingRun.findMany({
        where: OFFICIAL_RUN_WHERE,
        distinct: ["counterpartyId"],
        orderBy: [{ counterpartyId: "asc" }, { asOfDate: "desc" }, { createdAt: "desc" }],
        select: { asOfDate: true, finalGrade: true, counterparty: { select: { id: true, name: true, isActive: true } } },
      });
      return latest
        .filter((r) => r.counterparty.isActive && r.asOfDate < cutoffIso)
        .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
        .slice(0, 50);
    },
    [] as Array<{ asOfDate: string; finalGrade: string | null; counterparty: { id: string; name: string; isActive: boolean } }>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Dossiers de notation</h1>
          <p className="muted">
            Brouillon → soumission → circuit de validation (par défaut : directeur du centre d&apos;affaires, puis contre-étude). Seule
            une notation ayant franchi la validation finale devient la note du client.
          </p>
        </div>
        {hasRole(identity.role, "ANALYST") && (
          <Link href="/scoring" className="btn-primary" style={{ textDecoration: "none" }}>
            Nouveau dossier
          </Link>
        )}
      </div>

      <div className="stat-grid">
        {(["DRAFT", "SUBMITTED", "VALIDATED", "REJECTED"] as const).map((s) => (
          <div key={s} className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              <CaseStatusBadge status={s} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{count(s)}</div>
          </div>
        ))}
      </div>

      <nav className="tabs" aria-label="Filtrer les dossiers">
        {TABS.map((t) => (
          <Link key={t.key} href={`/cases?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "todo" && renewals.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Notes à renouveler ({renewals.length})</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Dernière notation validée arrêtée avant le {cutoffIso} (validité de {validityMonths} mois, Paramétrage › Workflow).
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Dernier arrêté validé</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((r) => (
                <tr key={r.counterparty.id}>
                  <td>
                    <Link href={`/counterparties/${r.counterparty.id}`} style={{ color: "var(--brand)" }}>
                      {r.counterparty.name}
                    </Link>
                  </td>
                  <td>{r.asOfDate}</td>
                  <td>
                    <GradeBadge grade={r.finalGrade} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card" style={{ padding: 16 }}>
        {!dbAvailable ? (
          <p className="muted">Base non connectée.</p>
        ) : data.cases.length === 0 ? (
          <p className="muted">Aucun dossier.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Entité</th>
                <th>Arrêté</th>
                <th>Statut</th>
                <th>Grade</th>
                <th>Ouvert par</th>
                <th>Soumis par</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/cases/${c.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                      {c.counterparty.name}
                    </Link>
                  </td>
                  <td className="muted">{data.entityCode.get(c.counterparty.entityId) ?? "—"}</td>
                  <td>{c.asOfDate}</td>
                  <td>
                    <CaseStatusBadge status={c.status} />
                    {data.stepOf.get(c.id) && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {data.stepOf.get(c.id)}
                      </div>
                    )}
                  </td>
                  <td>{c.run ? <GradeBadge grade={c.run.finalGrade} /> : <span className="muted">—</span>}</td>
                  <td className="muted">{c.createdBy}</td>
                  <td className="muted">{c.submittedBy ?? "—"}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {c.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
