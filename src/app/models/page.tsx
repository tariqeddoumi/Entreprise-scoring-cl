import Link from "next/link";
import { listModels } from "@/models";
import { requireSession } from "@/lib/session";

export default async function ModelsPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

  const models = listModels();
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Versions de modèle</h1>
        <p className="muted">
          Chaque version est immuable et validée au chargement (somme des poids,
          exhaustivité des barèmes, master scale, bandes de confiance).
        </p>
      </div>
      {models.map((m) => (
        <section key={m.modelId} className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 style={{ fontWeight: 600 }}>
              <Link href={`/models/${m.modelId}`} style={{ color: "var(--brand)" }}>
                {m.modelId}
              </Link>{" "}
              — {m.labelFr}
            </h2>
            <span className="muted" style={{ fontSize: 12 }}>
              v{m.version} · {m.status} · effet {m.effectiveFrom}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {m.criteria.length} critères · {m.domains.length} domaines · segments{" "}
            {m.segments.join(", ")} · {m.structuralCaps.length} caps ·{" "}
            {m.redFlags.length} red flags · PD :{" "}
            {m.calibration
              ? `calibrée sur ${m.calibration.dataSource === "SYNTHETIC" ? "données simulées" : "défauts observés"} (${m.calibration.calibrationId})`
              : "non calibrée"}
          </p>
        </section>
      ))}
    </div>
  );
}
