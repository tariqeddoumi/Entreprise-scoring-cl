"use client";

import { useActionState, useState } from "react";
import { entitiesAction, type EntityActionState } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  GROUP: "Groupe",
  BANK: "Banque",
  REGIONAL_BANK: "Banque régionale",
  SUBSIDIARY_GROUP: "Groupe de filiales",
  SUBSIDIARY: "Filiale",
};

interface EntityRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  level: number;
  country: string | null;
  currency: string;
  isActive: boolean;
  toolName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  counterparties: number;
  users: number;
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function EntityFields({ entity, entities, create }: { entity?: EntityRow; entities: EntityRow[]; create: boolean }) {
  return (
    <div className="grid-fields">
      {create && (
        <>
          <Field label="Code (unique)">
            <input name="code" required pattern="[A-Za-z0-9][A-Za-z0-9\-]{1,23}" placeholder="BA-CI" />
          </Field>
          <Field label="Entité mère">
            <select name="parentId" defaultValue={entities[0]?.id ?? ""}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {"— ".repeat(e.level)}
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      {!create && <input type="hidden" name="code" value={entity?.code} />}
      <Field label="Nom">
        <input name="name" required minLength={2} maxLength={160} defaultValue={entity?.name} />
      </Field>
      <Field label="Type">
        <select name="type" defaultValue={entity?.type ?? "SUBSIDIARY"}>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pays (ISO, ex. CI)">
        <input name="country" maxLength={2} defaultValue={entity?.country ?? ""} placeholder="MA" />
      </Field>
      <Field label="Devise (ISO, ex. XOF)">
        <input name="currency" required maxLength={3} defaultValue={entity?.currency ?? "MAD"} />
      </Field>
      <Field label="Nom de l'outil (habillage)">
        <input name="toolName" maxLength={80} defaultValue={entity?.toolName ?? ""} placeholder="hérité" />
      </Field>
      <Field label="Logo (https://… ou /…)">
        <input name="logoUrl" maxLength={500} defaultValue={entity?.logoUrl ?? ""} placeholder="hérité" />
      </Field>
      <Field label="Couleur principale (#RRGGBB)">
        <input name="primaryColor" maxLength={7} defaultValue={entity?.primaryColor ?? ""} placeholder="hérité" />
      </Field>
    </div>
  );
}

export function EntitiesAdmin({ entities, groupAdmin }: { entities: EntityRow[]; groupAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<EntityActionState, FormData>(entitiesAction, {});
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {state.errorFr && (
        <div role="alert" className="card" style={{ padding: 12, borderLeft: "4px solid var(--bad)" }}>
          {state.errorFr}
        </div>
      )}
      {state.okFr && (
        <div role="status" className="card" style={{ padding: 12, borderLeft: "4px solid var(--good)" }}>
          {state.okFr}
        </div>
      )}

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Nouvelle entité</h2>
        {entities.length === 0 && !groupAdmin ? (
          <p className="muted">Aucune entité dans votre périmètre.</p>
        ) : (
          <form action={formAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="op" value="create" />
            <EntityFields entities={entities} create />
            <div>
              <button
                type="submit"
                disabled={pending}
                style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600 }}
              >
                Créer
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Organisation ({entities.length})</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Entité</th>
              <th>Code</th>
              <th>Type</th>
              <th>Pays</th>
              <th>Devise</th>
              <th>Contreparties</th>
              <th>Utilisateurs</th>
              <th>État</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => (
              <tr key={e.id}>
                <td>
                  <span style={{ paddingLeft: e.level * 18, display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {e.primaryColor && (
                      <span
                        aria-hidden
                        style={{ width: 10, height: 10, borderRadius: 999, background: e.primaryColor, display: "inline-block" }}
                      />
                    )}
                    <strong style={{ fontWeight: e.level === 0 ? 700 : 600 }}>{e.name}</strong>
                  </span>
                  {editing === e.id && (
                    <form
                      action={async (fd) => {
                        await formAction(fd);
                        setEditing(null);
                      }}
                      style={{ display: "grid", gap: 10, marginTop: 10 }}
                    >
                      <input type="hidden" name="op" value="update" />
                      <input type="hidden" name="id" value={e.id} />
                      <EntityFields entity={e} entities={entities} create={false} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" disabled={pending} style={smallButton}>
                          Enregistrer
                        </button>
                        <button type="button" style={smallButton} onClick={() => setEditing(null)}>
                          Annuler
                        </button>
                      </div>
                    </form>
                  )}
                </td>
                <td>
                  <code>{e.code}</code>
                </td>
                <td className="muted">{TYPE_LABELS[e.type] ?? e.type}</td>
                <td>{e.country ?? "—"}</td>
                <td>{e.currency}</td>
                <td>{e.counterparties}</td>
                <td>{e.users}</td>
                <td style={{ color: e.isActive ? "var(--good)" : "var(--muted)", fontSize: 13 }}>
                  {e.isActive ? "Active" : "Désactivée"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" style={smallButton} onClick={() => setEditing(editing === e.id ? null : e.id)}>
                      Modifier
                    </button>
                    <form action={formAction}>
                      <input type="hidden" name="op" value={e.isActive ? "deactivate" : "reactivate"} />
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" disabled={pending} style={smallButton}>
                        {e.isActive ? "Désactiver" : "Réactiver"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
