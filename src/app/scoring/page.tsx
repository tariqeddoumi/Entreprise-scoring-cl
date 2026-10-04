import { getModel } from "@/models";
import { prisma, safeQuery } from "@/lib/safe-db";
import { ScoringForm } from "./ScoringForm";
import { hasRole } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { CodeLabel, MODEL_STATUS_LABELS } from "@/app/ui-helpers";

export const dynamic = "force-dynamic";

export default async function ScoringPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  // Toute page porteuse de données exige une session authentifiée.
  const identity = await requireSession();
  // Le calcul exige le rôle ANALYST, comme l'API : un profil en lecture seule
  // consulte la grille mais ne la soumet pas.
  const canRate = hasRole(identity.role, "ANALYST");

  const { model: modelParam } = await searchParams;
  const model = getModel(modelParam ?? "CORP_STD_V1");
  if (!model) {
    return <p>Modèle inconnu.</p>;
  }

  const { data: counterparties } = await safeQuery(
    () =>
      prisma.counterparty.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
    [] as Array<{ id: string; name: string }>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Nouvelle notation</h1>
        <p className="muted">
          {model.labelFr} · version {model.version} · statut{" "}
          <CodeLabel code={model.status} labels={MODEL_STATUS_LABELS} />. Le
          formulaire est généré depuis la version de modèle publiée : poids, barèmes et
          agrégation sont appliqués côté serveur.
        </p>
      </div>
      {!canRate && (
        <div className="card" role="status" style={{ padding: "12px 16px", fontSize: 13 }}>
          Profil en lecture seule : la grille est consultable, mais le calcul et
          l&apos;enregistrement d&apos;une notation sont réservés aux analystes.
        </div>
      )}
      <ScoringForm model={model} counterparties={counterparties} canRate={canRate} />
    </div>
  );
}
