"use client";

import { useEffect } from "react";

/**
 * Frontière d'erreur de l'interface.
 *
 * Aucun détail technique n'est présenté à l'utilisateur : ni message
 * d'exception, ni trace d'exécution. Seul l'identifiant de corrélation
 * fourni par Next.js est affiché, afin que le support puisse retrouver
 * l'événement dans les journaux serveur.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La trace complète reste côté serveur, dans les journaux d'exploitation.
  }, [error]);

  return (
    <div className="card" style={{ padding: 24, maxWidth: 620, margin: "40px auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        Une erreur est survenue
      </h1>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        L&apos;opération n&apos;a pas abouti. Aucune donnée n&apos;a été enregistrée de
        façon partielle : les écritures critiques sont transactionnelles.
        {error.digest && (
          <>
            {" "}Référence à communiquer au support :{" "}
            <code>{error.digest}</code>.
          </>
        )}
      </p>
      <button
        onClick={reset}
        style={{
          background: "var(--brand)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 16px",
          fontWeight: 600,
        }}
      >
        Réessayer
      </button>
    </div>
  );
}
