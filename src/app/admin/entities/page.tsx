import { loadTree, readableEntities, sortTree } from "@/lib/scope";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, requireSession } from "@/lib/session";
import { EntitiesAdmin } from "./EntitiesAdmin";

export const dynamic = "force-dynamic";

export default async function EntitiesPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const { data, dbAvailable } = await safeQuery(async (db) => {
    const tree = await loadTree();
    const counts = await db.counterparty.groupBy({ by: ["entityId"], _count: { _all: true } });
    const users = await db.user.groupBy({ by: ["entityId"], _count: { _all: true } });
    return { tree, counts, users };
  }, { tree: [], counts: [], users: [] });

  const visible = readableEntities(sortTree(data.tree), perimeter);
  const count = (list: Array<{ entityId: string | null; _count: { _all: number } }>, id: string) =>
    list.find((c) => c.entityId === id)?._count._all ?? 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Banques et filiales</h1>
        <p className="muted">
          Organisation du groupe. Chaque utilisateur, contrepartie et dossier appartient à une
          entité : une entité voit sa descendance, jamais sa maison mère ni ses entités sœurs.
          La devise de l&apos;entité est celle de ses contreparties par défaut ; l&apos;habillage
          vide est hérité de l&apos;entité mère.
        </p>
      </div>
      {!dbAvailable ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted">Base injoignable : l&apos;organisation est indisponible.</span>
        </div>
      ) : (
        <EntitiesAdmin
          groupAdmin={perimeter.all}
          entities={visible.map((e) => ({
            ...e,
            counterparties: count(data.counts, e.id),
            users: count(data.users, e.id),
          }))}
        />
      )}
    </div>
  );
}
