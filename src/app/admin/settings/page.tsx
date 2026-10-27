import { aiStatus } from "@/lib/ai";
import { loadSettings, SETTINGS } from "@/lib/settings";
import { getPerimeter, requireSession } from "@/lib/session";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const values = await loadSettings();
  const ai = await aiStatus();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Paramétrage de l&apos;outil</h1>
        <p className="muted">
          Règles du workflow, dérogations, pièces et intelligence artificielle. Les grilles de notation
          (poids, barèmes, échelles) ne se paramètrent pas ici : elles forment la version du modèle,
          validée par le comité modèles et consignée dans chaque notation. Chaque modification est
          journalisée.
        </p>
      </div>
      <div className="card" role="status" style={{ padding: "12px 16px", fontSize: 13 }}>
        <strong>État de l&apos;IA :</strong> {ai.enabled ? (ai.missing ? `activée, mais ${ai.missing}` : `active (${ai.provider}, ${ai.model})`) : "désactivée"}.
      </div>
      <SettingsForm
        readOnly={!perimeter.all}
        values={values}
        defs={SETTINGS.map((d) => ({ ...d, options: d.options ? [...d.options] : undefined }))}
      />
    </div>
  );
}
