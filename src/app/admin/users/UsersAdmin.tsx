"use client";

import { useActionState } from "react";
import { adminUsersAction, type AdminActionState } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  READONLY: "Lecture seule",
  ANALYST: "Analyste",
  RISK_MANAGER: "Gestionnaire des risques",
  ADMIN: "Administrateur",
};

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
}

const smallButton = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "3px 9px",
  color: "var(--text)",
  fontSize: 12,
  whiteSpace: "nowrap" as const,
};

function RoleSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? "ANALYST"}>
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function statusOf(u: UserRow): { label: string; color: string } {
  if (!u.isActive) return { label: "Désactivé", color: "var(--muted)" };
  if (u.locked) return { label: "Verrouillé", color: "var(--bad)" };
  if (u.mustChangePassword) return { label: "Mot de passe provisoire", color: "var(--warn)" };
  return { label: "Actif", color: "var(--good)" };
}

export function UsersAdmin({ me, users }: { me: string; users: UserRow[] }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    adminUsersAction,
    {}
  );

  return (
    <>
      {state.errorFr && (
        <div role="alert" className="card" style={{ padding: 12, borderLeft: "4px solid var(--bad)" }}>
          {state.errorFr}
        </div>
      )}
      {state.okFr && (
        <div role="status" className="card" style={{ padding: 12, borderLeft: "4px solid var(--good)" }}>
          <div>{state.okFr}</div>
          {state.temporaryPassword && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Mot de passe provisoire de <strong>{state.temporaryPassword.username}</strong> — il ne
                sera plus affiché :
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code
                  style={{
                    fontSize: 16,
                    padding: "6px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    userSelect: "all",
                  }}
                >
                  {state.temporaryPassword.value}
                </code>
                <button
                  type="button"
                  style={smallButton}
                  onClick={() => navigator.clipboard?.writeText(state.temporaryPassword!.value)}
                >
                  Copier
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Nouveau compte</h2>
        <form
          action={formAction}
          style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr auto", gap: 10, alignItems: "end" }}
        >
          <input type="hidden" name="op" value="create" />
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Identifiant
            </div>
            <input
              name="username"
              required
              pattern="[A-Za-z0-9._\-]{3,64}"
              title="3 à 64 caractères : lettres, chiffres, point, tiret, tiret bas"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="p.nom"
            />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Nom affiché
            </div>
            <input name="displayName" required minLength={2} maxLength={120} placeholder="Prénom Nom" />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Rôle
            </div>
            <RoleSelect name="role" />
          </label>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 600,
              opacity: pending ? 0.6 : 1,
            }}
          >
            Créer
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Comptes ({users.length})</h2>
        {users.length === 0 ? (
          <p className="muted">Aucun compte.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Identifiant</th>
                <th>Nom</th>
                <th>Rôle</th>
                <th>État</th>
                <th>Dernière connexion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const status = statusOf(u);
                const self = u.username === me;
                return (
                  <tr key={u.id}>
                    <td>
                      <code>{u.username}</code>
                      {self && <span className="muted"> (vous)</span>}
                    </td>
                    <td>{u.displayName}</td>
                    <td>
                      {self ? (
                        ROLE_LABELS[u.role] ?? u.role
                      ) : (
                        <form action={formAction} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="op" value="role" />
                          <input type="hidden" name="userId" value={u.id} />
                          <RoleSelect name="role" defaultValue={u.role} />
                          <button type="submit" disabled={pending} style={smallButton}>
                            Appliquer
                          </button>
                        </form>
                      )}
                    </td>
                    <td style={{ color: status.color, fontSize: 13 }}>{status.label}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {self ? (
                          <a href="/account/password" style={{ ...smallButton, textDecoration: "none" }}>
                            Changer mon mot de passe
                          </a>
                        ) : (
                          <form action={formAction}>
                            <input type="hidden" name="op" value="reset" />
                            <input type="hidden" name="userId" value={u.id} />
                            <button type="submit" disabled={pending} style={smallButton}>
                              Réinitialiser le mot de passe
                            </button>
                          </form>
                        )}
                        {!self && (
                          <form action={formAction}>
                            <input type="hidden" name="op" value={u.isActive ? "deactivate" : "reactivate"} />
                            <input type="hidden" name="userId" value={u.id} />
                            <button type="submit" disabled={pending} style={smallButton}>
                              {u.isActive ? "Désactiver" : "Réactiver"}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
