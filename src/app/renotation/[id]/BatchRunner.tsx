"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { cancelBatchAction, processBatchAction } from "../actions";

/**
 * Poursuite du lot tant que l'écran est ouvert : une tranche d'environ vingt
 * secondes après l'autre, jusqu'à la fin. Fermer l'écran n'arrête rien de
 * définitif : la tâche planifiée du serveur reprend le lot là où il en est.
 */
export function BatchRunner({
  batchId,
  status,
  processed,
  total,
  canRun,
}: {
  batchId: string;
  status: string;
  processed: number;
  total: number;
  canRun: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState({ status, processed, total });
  const [running, setRunning] = useState(canRun && (status === "QUEUED" || status === "RUNNING"));
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!running) return;
    (async () => {
      while (alive.current) {
        const r = await processBatchAction(batchId);
        if (!alive.current) return;
        if (!r.ok) {
          setError(r.errorFr ?? "Traitement interrompu.");
          setRunning(false);
          return;
        }
        setProgress({ status: r.status!, processed: r.processed!, total: r.total! });
        router.refresh();
        if (r.status === "DONE" || r.status === "CANCELLED") {
          setRunning(false);
          return;
        }
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [running, batchId, router]);

  const pct = progress.total ? Math.round((100 * progress.processed) / progress.total) : 0;
  const open = progress.status === "QUEUED" || progress.status === "RUNNING";
  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <strong>
          {progress.processed} / {progress.total} contrepartie(s) traitée(s) — {pct} %
        </strong>
        {open && canRun && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={() => setRunning((v) => !v)}>
              {running ? "Mettre en pause le suivi" : "Poursuivre le traitement"}
            </button>
            <CancelBatch batchId={batchId} />
          </div>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: 10, borderRadius: 999, background: "color-mix(in srgb, var(--muted) 20%, transparent)", overflow: "hidden" }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--brand)", transition: "width .4s" }} />
      </div>
      {open && (
        <span className="muted" style={{ fontSize: 12 }}>
          {running
            ? "Traitement en cours depuis cet écran…"
            : "En attente : le traitement reprend avec la tâche planifiée du serveur, ou depuis cet écran."}
        </span>
      )}
      {error && (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {error}
        </span>
      )}
    </div>
  );
}

function CancelBatch({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(cancelBatchAction, { ok: false });
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Annuler le lot ? Les contreparties déjà renotées le restent ; les autres ne le seront pas.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="batchId" value={batchId} />
      <button type="submit" className="btn-danger" disabled={pending}>
        Annuler le lot
      </button>
      {state.errorFr && <span style={{ color: "var(--bad)", fontSize: 12, marginLeft: 8 }}>{state.errorFr}</span>}
    </form>
  );
}
