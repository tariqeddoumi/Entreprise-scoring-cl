"use client";

import { useActionState } from "react";
import { assignGroupAction, createGroupAction, type GroupActionResult } from "./actions";

function Feedback({ state }: { state: GroupActionResult }) {
  if (state.errorFr)
    return (
      <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
        {state.errorFr}
      </div>
    );
  if (state.okFr)
    return (
      <div role="status" style={{ color: "var(--good)", fontSize: 13 }}>
        {state.okFr}
      </div>
    );
  return null;
}

export function NewGroupForm({ entities }: { entities: Array<{ id: string; name: string; level: number }> }) {
  const [state, action, pending] = useActionState(createGroupAction, { ok: false });
  return (
    <form action={action} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <h2 style={{ fontWeight: 600 }}>Nouveau groupe d&apos;affaires</h2>
      <div className="grid-fields">
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Code
          </div>
          <input name="code" required minLength={2} maxLength={30} placeholder="ex. GRP-HOLDA" />
        </label>
        <label>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Nom
          </div>
          <input name="name" required minLength={2} maxLength={160} placeholder="ex. Groupe Holdam" />
        </label>
        {entities.length > 1 && (
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Entité qui suit le groupe
            </div>
            <select name="entityId" defaultValue={entities[0]?.id}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {"  ".repeat(e.level)}
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Notes (actionnaire de contrôle, périmètre de consolidation…)
        </div>
        <textarea name="notes" rows={2} maxLength={2000} />
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Création…" : "Créer le groupe"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Rattachement en masse : ICE ou identifiants, un par ligne (ou séparés par des virgules). */
export function AssignForm({ groupId, detach = false }: { groupId: string | null; detach?: boolean }) {
  const [state, action, pending] = useActionState(assignGroupAction, { ok: false });
  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="groupId" value={groupId ?? ""} />
      <textarea name="refs" rows={detach ? 2 : 4} required placeholder="ICE ou identifiants des contreparties, un par ligne" />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className={detach ? "btn-ghost" : "btn-primary"} disabled={pending}>
          {detach ? "Détacher du groupe" : "Rattacher au groupe"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
