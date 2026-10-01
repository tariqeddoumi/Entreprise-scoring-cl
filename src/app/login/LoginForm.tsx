"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div style={{ maxWidth: 420, margin: "60px auto" }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Connexion</h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Identifiez-vous avec le compte nominatif que vous a remis l&apos;administrateur
          de l&apos;outil.
        </p>

        <form action={formAction} style={{ display: "grid", gap: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Identifiant
            </div>
            <input
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Mot de passe
            </div>
            <input type="password" name="password" autoComplete="current-password" required />
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
              marginTop: 4,
              width: "100%",
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 16px",
              fontWeight: 600,
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Vérification…" : "Se connecter"}
          </button>
        </form>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Mot de passe oublié ou compte verrouillé : adressez-vous à l&apos;administrateur de
        l&apos;outil, qui vous remettra un mot de passe provisoire. Cinq échecs consécutifs
        verrouillent le compte pendant quinze minutes.
      </p>
    </div>
  );
}
