import Link from "next/link";
import { loadTree, sortTree, writableEntities } from "@/lib/scope";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, getSessionIdentity, requireSession } from "@/lib/session";
import { NewGroupForm } from "./GroupForms";

export const dynamic = "force-dynamic";

/** Groupes d'affaires du périmètre : membres, et accès à la renotation du groupe. */
export default async function GroupsPage() {
  await requireSession();
  const canEdit = (await getSessionIdentity("ANALYST")).ok;
  const canRenote = (await getSessionIdentity("RISK_MANAGER")).ok;
  const perimeter = await getPerimeter();
  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      const [groups, tree] = await Promise.all([
        db.economicGroup.findMany({
          orderBy: { code: "asc" },
          include: { _count: { select: { counterparties: true } } },
        }),
        loadTree(),
      ]);
      return { groups, tree };
    },
    { groups: [], tree: [] }
  );
  const entityName = new Map(data.tree.map((e) => [e.id, e.name]));
  const writable = sortTree(writableEntities(data.tree, perimeter)).map((e) => ({ id: e.id, name: e.name, level: e.level }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Groupes d&apos;affaires</h1>
        <p className="muted">
          Contreparties liées par le contrôle (actionnaire commun, maison mère). Le groupe sert à lire les notes de ses membres et à
          les renoter ensemble. Appartenir à un groupe ne relève jamais une note : le support groupe d&apos;une notation reste soumis
          aux quatre conditions documentées du modèle.
        </p>
      </div>
      {!dbAvailable && (
        <div className="card" style={{ padding: 14 }}>
          <span className="muted">Base injoignable.</span>
        </div>
      )}
      {dbAvailable && canEdit && writable.length > 0 && <NewGroupForm entities={writable} />}
      <section className="card" style={{ padding: 16 }}>
        {data.groups.length === 0 ? (
          <p className="muted">Aucun groupe d&apos;affaires enregistré.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Groupe</th>
                <th>Entité</th>
                <th>Membres</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id}>
                  <td className="nowrap">
                    <Link href={`/groups/${g.id}`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                      {g.code}
                    </Link>
                  </td>
                  <td>{g.name}</td>
                  <td>{entityName.get(g.entityId) ?? "—"}</td>
                  <td>{g._count.counterparties}</td>
                  <td>
                    {canRenote && g._count.counterparties > 0 && (
                      <Link href={`/renotation?group=${g.id}`} style={{ color: "var(--brand)", fontSize: 13 }}>
                        Renoter le groupe
                      </Link>
                    )}
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
