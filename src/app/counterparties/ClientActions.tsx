"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCounterpartyAction, reactivateCounterpartyAction } from "./actions";

/**
 * Suppression ou réactivation d'un client (gestionnaire des risques).
 *
 * Un client avec historique n'est jamais effacé : il est désactivé, et ses
 * notations restent consultables. Le bouton l'annonce avant confirmation.
 */
export function ClientActions({
  id,
  name,
  isActive,
  hasHistory,
}: {
  id: string;
  name: string;
  isActive: boolean;
  hasHistory: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errorFr, setErrorFr] = useState<string | null>(null);
  const [okFr, setOkFr] = useState<string | null>(null);

  function remove() {
    const question = hasHistory
      ? `Désactiver « ${name} » ? Son historique de notation est conservé ; il ne pourra plus faire l'objet d'un nouveau dossier tant qu'il n'est pas réactivé.`
      : `Supprimer définitivement « ${name} » ? Ce client n'a aucune notation.`;
    if (!window.confirm(question)) return;
    setErrorFr(null);
    start(async () => {
      const res = await deleteCounterpartyAction(id);
      if (!res.ok) return setErrorFr(res.errorFr ?? "Suppression impossible.");
      if (res.mode === "DELETED") {
        router.push("/counterparties");
        return;
      }
      setOkFr(res.messageFr ?? "Client désactivé.");
      router.refresh();
    });
  }

  function reactivate() {
    setErrorFr(null);
    start(async () => {
      const res = await reactivateCounterpartyAction(id);
      if (!res.ok) return setErrorFr(res.errorFr ?? "Réactivation impossible.");
      setOkFr("Client réactivé.");
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      {isActive ? (
        <button type="button" className="btn-danger" onClick={remove} disabled={pending} style={{ fontSize: 13 }}>
          {pending ? "…" : hasHistory ? "Désactiver le client" : "Supprimer le client"}
        </button>
      ) : (
        <button type="button" className="btn-ghost" onClick={reactivate} disabled={pending} style={{ fontSize: 13 }}>
          {pending ? "…" : "Réactiver le client"}
        </button>
      )}
      {okFr && (
        <span role="status" style={{ color: "var(--good)", fontSize: 13 }}>
          {okFr}
        </span>
      )}
      {errorFr && (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {errorFr}
        </span>
      )}
    </div>
  );
}
