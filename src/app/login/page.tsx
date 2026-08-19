"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <div style={{ maxWidth: 420, margin: "60px auto" }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          Authentification
        </h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Saisissez votre clé d&apos;accès. Elle est vérifiée côté serveur et
          conservée dans un cookie inaccessible au JavaScript.
        </p>

        <form action={formAction}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Clé d&apos;accès
            </div>
            <input
              type="password"
              name="apiKey"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>

          {state?.errorFr && (
            <p style={{ color: "var(--bad)", fontSize: 13, marginTop: 10 }}>
              {state.errorFr}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 16,
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
        En déploiement bancaire, cet écran est remplacé par l&apos;authentification
        unique de l&apos;établissement (OIDC/SAML). Le contrat reste identique :
        l&apos;identité et le rôle proviennent du jeton, jamais d&apos;un champ de
        formulaire.
      </p>
    </div>
  );
}
