import { getModel } from "@/models";
import { prisma, safeQuery } from "@/lib/safe-db";
import { ScoringForm } from "./ScoringForm";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ScoringPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

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
          {model.labelFr} · version {model.version} · statut {model.status}. Le
          formulaire est généré depuis la version de modèle publiée : poids, barèmes et
          agrégation sont appliqués côté serveur.
        </p>
      </div>
      <ScoringForm model={model} counterparties={counterparties} />
    </div>
  );
}
