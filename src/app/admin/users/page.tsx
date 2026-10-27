import { listUsers } from "@/lib/accounts";
import { safeQuery } from "@/lib/safe-db";
import { loadTree, readableEntities, sortTree } from "@/lib/scope";
import { getPerimeter, requireSession } from "@/lib/session";
import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const me = await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const { data, dbAvailable } = await safeQuery(
    async (db) => ({ users: await listUsers(db), tree: await loadTree() }),
    { users: [], tree: [] }
  );
  const { users } = data;
  // Entités administrables : celles de la branche de l'administrateur.
  const entities = readableEntities(sortTree(data.tree), perimeter).map((e) => ({
    id: e.id,
    label: `${"— ".repeat(e.level)}${e.name}${e.isActive ? "" : " (désactivée)"}`,
  }));
  const now = Date.now();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Utilisateurs</h1>
        <p className="muted">
          Comptes nominatifs de l&apos;interface. Le mot de passe provisoire d&apos;un compte
          créé ou réinitialisé s&apos;affiche une seule fois : remettez-le à la personne par
          un canal distinct, elle devra le changer à sa première connexion. Les clés API
          restent réservées aux échanges entre systèmes.
        </p>
      </div>
      {!dbAvailable ? (
        <div className="card" style={{ padding: 16 }}>
          <span className="muted">Base injoignable : la gestion des comptes est indisponible.</span>
        </div>
      ) : (
        <UsersAdmin
          me={me.name}
          entities={entities}
          groupAdmin={perimeter.all}
          users={users.map((u) => ({
            entityId: u.entityId,
            writeScope: u.writeScope,
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            role: u.role,
            isActive: u.isActive,
            mustChangePassword: u.mustChangePassword,
            locked: u.lockedUntil !== null && u.lockedUntil.getTime() > now,
            lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          }))}
        />
      )}
    </div>
  );
}
