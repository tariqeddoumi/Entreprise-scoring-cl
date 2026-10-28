import Link from "next/link";
import { notFound } from "next/navigation";
import { getModel } from "@/models";
import {
  BATCH_STATUS_LABELS,
  describeFilters,
  ITEM_STATUS_LABELS,
  MOVEMENT_LABELS,
  MOVEMENTS,
  parseSummary,
  safeJson,
  type RenotationFilters,
} from "@/lib/renotation";
import { loadTree } from "@/lib/scope";
import { safeQuery } from "@/lib/safe-db";
import { getSessionIdentity, requireSession } from "@/lib/session";
import { GradeBadge } from "@/app/ui-helpers";
import { BatchRunner } from "./BatchRunner";

export const dynamic = "force-dynamic";
// Les actions serveur de l'écran (lancement, tranches de traitement) héritent de cette durée.
export const maxDuration = 120;

const PAGE = 100;
const FILTERS = [
  { key: "review", label: "À revoir" },
  ...MOVEMENTS.map((m) => ({ key: m, label: MOVEMENT_LABELS[m] })),
  { key: "SKIPPED", label: "Écartées" },
  { key: "ERROR", label: "Erreurs" },
  { key: "all", label: "Toutes" },
];

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string; page?: string }>;
}) {
  await requireSession();
  const canRun = (await getSessionIdentity("RISK_MANAGER")).ok;
  const { id } = await params;
  const sp = await searchParams;
  const f = FILTERS.some((x) => x.key === sp.f) ? sp.f! : "review";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Record<string, unknown> = { batchId: id };
  if (f === "review") where.OR = [{ caseId: { not: null } }, { movement: { in: ["DOWNGRADE", "UPGRADE", "NO_RATING", "DEFAULTED"] } }];
  else if ((MOVEMENTS as readonly string[]).includes(f)) where.movement = f;
  else if (f === "SKIPPED" || f === "ERROR") where.status = f;

  const { data } = await safeQuery(
    async (db) => {
      const batch = await db.renotationBatch.findUnique({ where: { id } });
      if (!batch) return null;
      const [items, count, matrix, group] = await Promise.all([
        db.renotationItem.findMany({
          where,
          orderBy: [{ notchDelta: "desc" }, { id: "asc" }],
          skip: (page - 1) * PAGE,
          take: PAGE,
          include: { counterparty: { select: { id: true, name: true, ice: true, segment: true, sectorCode: true } } },
        }),
        db.renotationItem.count({ where }),
        db.renotationItem.groupBy({
          by: ["previousGrade", "newGrade"],
          where: { batchId: id, status: "DONE" },
          _count: { _all: true },
        }),
        (() => {
          const gid = (safeJson(batch.filters) as RenotationFilters | null)?.economicGroupId;
          return gid ? db.economicGroup.findUnique({ where: { id: gid }, select: { code: true, name: true } }) : null;
        })(),
      ]);
      return { batch, items, count, matrix, group };
    },
    null
  );
  if (!data) notFound();
  const { batch, items, count, matrix, group } = data;
  const s = parseSummary(batch.summary);
  const tree = await loadTree();
  const filters = (safeJson(batch.filters) ?? {}) as RenotationFilters;
  const options = safeJson(batch.options) as { notchThreshold?: number; openCases?: boolean } | null;

  // Matrice de migration : grades de l'échelle du modèle, dans l'ordre.
  const scale = getModel("CORP_STD_V1")?.gradeScale.bands.map((b) => b.grade) ?? [];
  const seen = new Set(matrix.flatMap((m) => [m.previousGrade ?? "—", m.newGrade ?? "—"]));
  const grades = [...scale.filter((g) => seen.has(g)), ...[...seen].filter((g) => !scale.includes(g)).sort()];
  const cell = (from: string, to: string) =>
    matrix.find((m) => (m.previousGrade ?? "—") === from && (m.newGrade ?? "—") === to)?._count._all ?? 0;

  const tiles = [
    { label: "Renotées", value: s.done },
    { label: "Inchangées", value: s.movements.UNCHANGED ?? 0 },
    { label: "Améliorations", value: s.movements.UPGRADE ?? 0, color: "var(--good)" },
    { label: "Dégradations", value: s.movements.DOWNGRADE ?? 0, color: "var(--bad)" },
    { label: "Sans note", value: s.movements.NO_RATING ?? 0, color: "var(--warn)" },
    { label: "Défauts", value: s.movements.DEFAULTED ?? 0, color: "var(--bad)" },
    { label: "Écartées", value: s.skipped },
    { label: "Erreurs", value: s.errors, color: s.errors ? "var(--bad)" : undefined },
    { label: "Dossiers de revue", value: s.cases, color: "var(--brand)" },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <Link href="/renotation" className="muted" style={{ fontSize: 13 }}>
          ← Renotation du portefeuille
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{batch.name}</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Arrêté {batch.asOfDate} · {describeFilters(filters, { entities: Object.fromEntries(tree.map((e) => [e.id, e.name])), groups: group ? { [filters.economicGroupId!]: `${group.code} — ${group.name}` } : {} })} ·{" "}
          {BATCH_STATUS_LABELS[batch.status] ?? batch.status} · lancé par {batch.createdBy}
          {options?.openCases ? ` · dossier de revue dès ${options.notchThreshold ?? 1} cran(s)` : " · sans ouverture de dossier"}
        </p>
      </div>

      <BatchRunner batchId={batch.id} status={batch.status} processed={batch.processed} total={batch.total} canRun={canRun} />

      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.label} className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>{t.value}</div>
          </div>
        ))}
      </div>

      {grades.length > 0 && (
        <section className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
          <h2 style={{ fontWeight: 600 }}>Matrice de migration</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            En ligne, la note officielle avant le lot ; en colonne, la note de surveillance calculée. La diagonale porte les grades
            inchangés.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="data" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Avant \ Après</th>
                  {grades.map((g) => (
                    <th key={g} style={{ textAlign: "center" }}>
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grades.map((from) => (
                  <tr key={from}>
                    <th style={{ textAlign: "left" }}>{from}</th>
                    {grades.map((to) => {
                      const n = cell(from, to);
                      const diag = from === to;
                      const worse = grades.indexOf(to) > grades.indexOf(from);
                      return (
                        <td
                          key={to}
                          style={{
                            textAlign: "center",
                            fontWeight: diag ? 700 : 400,
                            color: n === 0 ? "var(--muted)" : diag ? undefined : worse ? "var(--bad)" : "var(--good)",
                          }}
                        >
                          {n || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ fontWeight: 600 }}>Contreparties</h2>
          <a href={`/renotation/${batch.id}/export`} className="btn-ghost" style={{ fontSize: 13 }}>
            Exporter le lot (CSV)
          </a>
        </div>
        <nav className="tabs" aria-label="Filtre des contreparties">
          {FILTERS.map((x) => (
            <Link key={x.key} href={`/renotation/${batch.id}?f=${x.key}`} aria-current={x.key === f ? "page" : undefined}>
              {x.label}
            </Link>
          ))}
        </nav>
        {items.length === 0 ? (
          <p className="muted">Aucune contrepartie dans ce filtre.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Contrepartie</th>
                  <th>Segment</th>
                  <th>Secteur</th>
                  <th>Avant</th>
                  <th>Après</th>
                  <th>Crans</th>
                  <th>Résultat</th>
                  <th>Suite</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <Link href={`/counterparties/${it.counterparty.id}`} style={{ color: "var(--brand)" }}>
                        {it.counterparty.name}
                      </Link>
                      {it.counterparty.ice && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          ICE {it.counterparty.ice}
                        </div>
                      )}
                    </td>
                    <td>{it.counterparty.segment ?? "—"}</td>
                    <td>{it.counterparty.sectorCode ?? "—"}</td>
                    <td>
                      <GradeBadge grade={it.previousGrade} />
                    </td>
                    <td>
                      {it.runId ? (
                        <Link href={`/rating-runs/${it.runId}`}>
                          <GradeBadge grade={it.newGrade} />
                        </Link>
                      ) : (
                        <GradeBadge grade={it.newGrade} />
                      )}
                    </td>
                    <td className="nowrap" style={{ color: (it.notchDelta ?? 0) > 0 ? "var(--bad)" : (it.notchDelta ?? 0) < 0 ? "var(--good)" : undefined }}>
                      {it.notchDelta === null ? "—" : it.notchDelta > 0 ? `+${it.notchDelta}` : it.notchDelta}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {it.movement ? MOVEMENT_LABELS[it.movement] : ITEM_STATUS_LABELS[it.status] ?? it.status}
                      {it.messageFr && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {it.messageFr}
                        </div>
                      )}
                    </td>
                    <td>
                      {it.caseId ? (
                        <Link href={`/cases/${it.caseId}`} style={{ color: "var(--brand)", fontSize: 13 }}>
                          Dossier
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {count > PAGE && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
            {page > 1 && (
              <Link href={`/renotation/${batch.id}?f=${f}&page=${page - 1}`} style={{ color: "var(--brand)" }}>
                ← Précédentes
              </Link>
            )}
            <span className="muted">
              {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, count)} sur {count}
            </span>
            {page * PAGE < count && (
              <Link href={`/renotation/${batch.id}?f=${f}&page=${page + 1}`} style={{ color: "var(--brand)" }}>
                Suivantes →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
