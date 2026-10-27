import { getModel, listModels } from "@/models";
import { safeQuery } from "@/lib/safe-db";
import { hasRole } from "@/lib/auth";
import { getPerimeter, requireSession } from "@/lib/session";
import { canWrite, loadTree } from "@/lib/scope";
import { CodeLabel, MODEL_STATUS_LABELS } from "@/app/ui-helpers";
import { NewCaseForm } from "./NewCaseForm";
import { SimulationWorkspace } from "./SimulationWorkspace";

export const dynamic = "force-dynamic";

export default async function ScoringPage({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  // Toute page porteuse de données exige une session authentifiée.
  const identity = await requireSession();
  // Le calcul exige le rôle ANALYST, comme l'API.
  const canRate = hasRole(identity.role, "ANALYST");

  const { model: modelParam } = await searchParams;
  const model = getModel(modelParam ?? "CORP_STD_V1");
  if (!model) return <p>Modèle inconnu.</p>;
  const today = new Date().toISOString().slice(0, 10);

  const perimeter = await getPerimeter();
  const { data: counterparties } = await safeQuery(async (db) => {
    const [rows, tree] = await Promise.all([
      db.counterparty.findMany({
        where: { isActive: true },
        select: { id: true, name: true, currency: true, entityId: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      loadTree(),
    ]);
    const code = new Map(tree.map((e) => [e.id, e.code]));
    // Un dossier s'ouvre dans le périmètre d'écriture seulement.
    return rows
      .filter((r) => canWrite(perimeter, r.entityId))
      .map((r) => ({ id: r.id, name: r.name, currency: r.currency, entityCode: code.get(r.entityId) ?? "—" }));
  }, [] as Array<{ id: string; name: string; currency: string; entityCode: string }>);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Nouvelle notation</h1>
        <p className="muted">
          Une notation enregistrée passe par un dossier : saisie (assistée par l&apos;IA si elle est activée), soumission, puis
          validation par une seconde personne. La simulation ci-dessous calcule sans rien enregistrer.
        </p>
      </div>
      {!canRate && (
        <div className="card" role="status" style={{ padding: "12px 16px", fontSize: 13 }}>
          Profil en lecture seule : la grille est consultable, mais les dossiers et le calcul sont réservés aux analystes.
        </div>
      )}
      <NewCaseForm
        models={listModels().map((m) => ({ modelId: m.modelId, label: `${m.labelFr} · v${m.version}` }))}
        defaultModelId={model.modelId}
        counterparties={counterparties}
        today={today}
        canRate={canRate}
      />
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Simulation</h2>
        <p className="muted">
          {model.labelFr} · version {model.version} · statut <CodeLabel code={model.status} labels={MODEL_STATUS_LABELS} />. Le
          formulaire est généré depuis la version de modèle publiée : poids, barèmes et agrégation sont appliqués côté serveur.
        </p>
      </div>
      <SimulationWorkspace model={model} canRate={canRate} today={today} />
    </div>
  );
}
