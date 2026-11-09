import Link from "next/link";
import { AUDIT_RESOURCE_LABELS, auditLabel } from "@/lib/audit-labels";
import { JOURNAL_EXPORT_MAX, JOURNAL_PAGE_SIZE, journalQuery, loadJournal, parseJournalFilters, summarizeDetail } from "@/lib/audit-journal";
import { getDb, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Casablanca" });

function resourceLink(type: string, id: string): string | null {
  if (type === "RatingCase") return `/cases/${id}`;
  if (type === "Counterparty") return `/counterparties/${id}`;
  if (type === "RatingRun") return `/rating-runs/${id}`;
  if (type === "RenotationBatch") return `/renotation/${id}`;
  return null;
}

/** Journal d'audit : lecture seule, filtres, export. */
export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession("ADMIN");
  const f = parseJournalFilters(await searchParams);
  const data = await loadJournal(await getDb(), f).catch(() => null);
  const q = journalQuery(f);
  const pages = data ? Math.max(1, Math.ceil(data.total / JOURNAL_PAGE_SIZE)) : 1;
  const pageHref = (p: number) => `/admin/journal?${[q, `page=${p}`].filter(Boolean).join("&")}`;
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Journal d&apos;audit</h1>
        <p className="muted">
          Toutes les opérations tracées par l&apos;outil : dossiers, décisions, clients, comptes et connexions, paramétrage, tests des API. Le journal est en
          ajout seul : rien ne s&apos;y modifie ni ne s&apos;y supprime. Un administrateur d&apos;entité ne voit que les événements de son périmètre.
        </p>
      </div>
      <form method="get" className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Objet
          <select name="type" defaultValue={f.resourceType}>
            <option value="">Tous</option>
            {data?.types.map((t) => (
              <option key={t} value={t}>
                {AUDIT_RESOURCE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, minWidth: 0 }}>
          Action
          <select name="action" defaultValue={f.action} style={{ maxWidth: "100%" }}>
            <option value="">Toutes</option>
            {data?.actions.map((a) => (
              <option key={a} value={a}>
                {auditLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Acteur
          <input name="acteur" defaultValue={f.actor} maxLength={80} style={{ width: 160 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Du
          <input type="date" name="du" defaultValue={f.from} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Au
          <input type="date" name="au" defaultValue={f.to} />
        </label>
        <button type="submit" className="btn-primary">
          Filtrer
        </button>
        <Link href="/admin/journal" style={{ fontSize: 13 }}>
          Effacer
        </Link>
        <a href={`/admin/journal/export${q ? `?${q}` : ""}`} style={{ fontSize: 13, marginLeft: "auto" }}>
          Exporter (Excel, {JOURNAL_EXPORT_MAX.toLocaleString("fr-FR")} lignes au plus)
        </a>
      </form>
      {!data ? (
        <p className="muted">Base non connectée.</p>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13 }} role="status">
            {data.total.toLocaleString("fr-FR")} événement(s){data.total > JOURNAL_PAGE_SIZE ? ` — page ${f.page} sur ${pages}` : ""}.
          </p>
          <div className="table-scroll card" style={{ minWidth: 0 }}>
            <table className="data" style={{ fontSize: 13, width: "100%" }}>
              <caption className="sr-only">Événements du journal d&apos;audit, du plus récent au plus ancien</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Acteur</th>
                  <th scope="col">Action</th>
                  <th scope="col">Objet</th>
                  <th scope="col">Détail</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((e) => {
                  const href = resourceLink(e.resourceType, e.resourceId);
                  const label = `${AUDIT_RESOURCE_LABELS[e.resourceType] ?? e.resourceType} ${e.resourceId.length > 24 ? `${e.resourceId.slice(0, 24)}…` : e.resourceId}`;
                  return (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmt(e.createdAt)}</td>
                      <td>
                        {e.actor}
                        {e.actorRole ? <span className="muted"> · {e.actorRole}</span> : null}
                      </td>
                      <td>{auditLabel(e.action)}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{href ? <Link href={href}>{label}</Link> : label}</td>
                      <td className="muted" style={{ overflowWrap: "anywhere", maxWidth: 420 }}>
                        {summarizeDetail(e.detail)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pages du journal" style={{ display: "flex", gap: 12, fontSize: 13 }}>
              {f.page > 1 && <Link href={pageHref(f.page - 1)}>← Plus récents</Link>}
              {f.page < pages && <Link href={pageHref(f.page + 1)}>Plus anciens →</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
