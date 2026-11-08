"use client";

import { useActionState } from "react";
import { testIntegrationAction, type TestActionState } from "./actions";

export function IntegrationTester({ code, sampleLabel, disabled }: { code: string; sampleLabel: string | null; disabled?: boolean }) {
  const [state, action, pending] = useActionState<TestActionState | undefined, FormData>(testIntegrationAction, undefined);
  return (
    <form action={action} style={{ display: "grid", gap: 8, minWidth: 0 }}>
      <input type="hidden" name="code" value={code} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {sampleLabel && (
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {sampleLabel}
            <input name="sample" required maxLength={40} autoComplete="off" style={{ width: 200, maxWidth: "100%" }} />
          </label>
        )}
        <button type="submit" className="btn-primary" disabled={pending || disabled}>
          {pending ? "Test en cours…" : "Tester la connexion"}
        </button>
      </div>
      {state?.errorFr && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {state.errorFr}
        </p>
      )}
      {state?.test && (
        <div role="status" style={{ fontSize: 13, display: "grid", gap: 2 }}>
          <strong style={{ color: state.test.ok ? "var(--good)" : "var(--bad)" }}>
            {state.test.ok ? "✓ " : "✕ "}
            {state.test.messageFr}
          </strong>
          {state.test.details.map((d, i) => (
            <span key={i} className="muted" style={{ overflowWrap: "anywhere" }}>
              {d}
            </span>
          ))}
          <span className="muted">Durée : {state.test.durationMs} ms.</span>
        </div>
      )}
    </form>
  );
}
