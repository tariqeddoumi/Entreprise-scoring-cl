import Link from "next/link";
import {
  BATCH_STATUS_LABELS,
  describeFilters,
  FREQUENCIES,
  parseSummary,
  previousMonthEnd,
  safeJson,
  type RenotationFilters,
} from "@/lib/renotation";
import { loadTree, sortTree, writableEntities } from "@/lib/scope";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, getSessionIdentity, requireSession } from "@/lib/session";
import { BatchForm, ScheduleForm, ScheduleToggle, type SelectionChoices } from "./RenotationForms";

export const dynamic = "force-dynamic";
// Les actions serveur de l'écran (lancement, tranches de traitement) héritent de cette durée.
export const maxDuration = 120;

const fmt = (d: Date | null) => (d ? d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" }) : "—");

/**
 * Renotation par lot : lancement immédiat, planification périodique et suivi.
 * Consultation ouverte à tous ; lancement et planification réservés au
 * gestionnaire des risques.
 */
export default async function RenotationPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; segment?: string; sector?: string }>;
}) {
  await requireSession();
  const canLaunch = (await getSessionIdentity("RISK_MANAGER")).ok;
  const perimeter = await getPerimeter();
  const params = await searchParams;

  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      const [batches, schedules, groups, sectors, tree] = await Promise.all([
        db.renotationBatch.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
        db.renotationSchedule.findMany({ orderBy: { createdAt: "desc" } }),
        db.economicGroup.findMany({
          where: { isActive: true },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, _count: { select: { counterparties: true } } },
        }),
        db.counterparty.findMany({
          where: { sectorCode: { not: null } },
          distinct: ["sectorCode"],
          select: { sectorCode: true },
          orderBy: { sectorCode: "asc" },
          take: 300,
        }),
        loadTree(),
      ]);
      return { batches, schedules, groups, sectors, tree };
    },
    { batches: [], schedules: [], groups: [], sectors: [], tree: [] }
  );

  const entityNames = Object.fromEntries(data.tree.map((e) => [e.id, e.name]));
  const groupNames = Object.fromEntries(data.groups.map((g) => [g.id, g.code]));
  const names = { entities: entityNames, groups: groupNames };
  const choices: SelectionChoices = {
    entities: sortTree(writableEntities(data.tree, perimeter)).map((e) => ({ id: e.id, name: e.name, level: e.level })),
    groups: data.groups.map((g) => ({ id: g.id, code: g.code, name: g.name, members: g._count.counterparties })),
    sectors: data.sectors.map((s) => s.sectorCode!).filter(Boolean),
  };
  const defaults = {
    economicGroupId: data.groups.some((g) => g.id === params.group) ? params.group : undefined,
    segment: ["TPE", "PME", "GE"].includes(params.segment ?? "") ? params.segment : undefined,
    sectorPrefix: params.sector?.slice(0, 30),
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Renotation du portefeuille</h1>
        <p className="muted">
          Renotation par lot de tout ou partie du portefeuille (banque ou filiale, groupe d&apos;affaires, segment, secteur),
          ponctuelle ou périodique. Une migration de grade ouvre un dossier de revue ; la note officielle reste celle du dernier
          dossier validé.
        </p>
      </div>

      {!dbAvailable && (
        <div className="card" style={{ padding: 14 }}>
          <span className="muted">Base injoignable : la renotation est indisponible.</span>
        </div>
      )}

      {dbAvailable && canLaunch && <BatchForm choices={choices} defaultAsOf={previousMonthEnd(new Date())} defaults={defaults} />}

      <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <h2 style={{ fontWeight: 600 }}>Lots</h2>
        {data.batches.length === 0 ? (
          <p className="muted">Aucun lot lancé.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Arrêté</th>
                  <th>Sélection</th>
                  <th>Statut</th>
                  <th>Avancement</th>
                  <th title="Améliorations / dégradations / sans note">↑ / ↓ / ∅</th>
                  <th>Dossiers ouverts</th>
                  <th>Lancé par</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map((b) => {
                  const s = parseSummary(b.summary);
                  return (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/renotation/${b.id}`} style={{ color: "var(--brand)" }}>
                          {b.name}
                        </Link>
                        {b.scheduleId && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>planifié</span>}
                      </td>
                      <td className="nowrap">{b.asOfDate}</td>
                      <td style={{ fontSize: 13 }}>{describeFilters((safeJson(b.filters) ?? {}) as RenotationFilters, names)}</td>
                      <td>{BATCH_STATUS_LABELS[b.status] ?? b.status}</td>
                      <td className="nowrap">
                        {b.processed} / {b.total}
                      </td>
                      <td className="nowrap">
                        <span style={{ color: "var(--good)" }}>{s.movements.UPGRADE ?? 0}</span> /{" "}
                        <span style={{ color: "var(--bad)" }}>{s.movements.DOWNGRADE ?? 0}</span> /{" "}
                        {(s.movements.NO_RATING ?? 0) + (s.movements.DEFAULTED ?? 0)}
                      </td>
                      <td>{s.cases}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {b.createdBy}
                        <br />
                        {fmt(b.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <h2 style={{ fontWeight: 600 }}>Planifications</h2>
        {data.schedules.length === 0 ? (
          <p className="muted">Aucune renotation périodique planifiée.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Planification</th>
                  <th>Fréquence</th>
                  <th>Sélection</th>
                  <th>Prochaine exécution</th>
                  <th>Dernier lot</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {data.schedules.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <div className="muted" style={{ fontSize: 11 }}>
                        par {s.createdBy}
                      </div>
                    </td>
                    <td className="nowrap">
                      {FREQUENCIES.find((f) => f.months === s.intervalMonths)?.labelFr ?? `${s.intervalMonths} mois`}, le {s.dayOfMonth}
                    </td>
                    <td style={{ fontSize: 13 }}>{describeFilters((safeJson(s.filters) ?? {}) as RenotationFilters, names)}</td>
                    <td className="nowrap">{s.isActive ? fmt(s.nextRunAt) : "—"}</td>
                    <td>
                      {s.lastBatchId ? (
                        <Link href={`/renotation/${s.lastBatchId}`} style={{ color: "var(--brand)" }}>
                          {fmt(s.lastRunAt)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="nowrap">
                      {s.isActive ? "Active" : "Suspendue"}
                      {canLaunch && (
                        <span style={{ marginLeft: 8 }}>
                          <ScheduleToggle scheduleId={s.id} active={s.isActive} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dbAvailable && canLaunch && <ScheduleForm choices={choices} />}

      {!canLaunch && (
        <p className="muted" style={{ fontSize: 13 }}>
          Le lancement et la planification d&apos;une renotation relèvent du gestionnaire des risques.
        </p>
      )}
    </div>
  );
}
