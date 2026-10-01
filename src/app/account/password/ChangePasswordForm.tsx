"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm({ username }: { username: string }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, {});

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      {/* Aide les gestionnaires de mots de passe à associer le compte. */}
      <input type="hidden" name="username" value={username} autoComplete="username" />
      <label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Mot de passe actuel
        </div>
        <input type="password" name="current" autoComplete="current-password" required autoFocus />
      </label>
      <label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Nouveau mot de passe
        </div>
        <input type="password" name="next" autoComplete="new-password" required minLength={12} />
      </label>
      <label>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
          Confirmation
        </div>
        <input type="password" name="confirm" autoComplete="new-password" required minLength={12} />
      </label>

      {state?.errorFr && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {state.errorFr}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: "var(--brand)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 16px",
          fontWeight: 600,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
