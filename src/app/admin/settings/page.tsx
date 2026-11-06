import { aiStatus } from "@/lib/ai";
import { loadSettings, SETTINGS } from "@/lib/settings";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, requireSession } from "@/lib/session";
import { loadCircuit } from "@/lib/workflow";
import { CircuitEditor } from "./CircuitEditor";
import { SettingsForm } from "./SettingsForm";
import { PurposesEditor } from "./PurposesEditor";
import { RefListEditor } from "./RefListEditor";
import { ClassificationEditor } from "./ClassificationEditor";
import { loadClassification, loadWatchlistLevels } from "@/lib/classification-store";
import { DEFAULT_CLASSIFICATION, DEFAULT_WATCHLIST_LEVELS } from "@/reference/classification";
import { WatchlistLevelsEditor } from "./WatchlistLevelsEditor";
import { SurveillanceEditor } from "./SurveillanceEditor";
import { loadSurveillanceSettings } from "@/lib/portfolio-data";
import { DEFAULT_SURVEILLANCE } from "@/reference/portfolio";
import { effectiveFormat } from "@/lib/statement-format";
import { today } from "@/lib/rating-scale";
import { loadCreditTypes, loadEntityTiers, loadPurposes } from "@/lib/financial-statements";
import { DEFAULT_CREDIT_TYPES, DEFAULT_ENTITY_TIERS, DEFAULT_PURPOSES } from "@/reference/case-purposes";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const values = await loadSettings();
  const ai = await aiStatus();
  const { circuit, stored } = await loadCircuit({ fresh: true });
  const { data: holders } = await safeQuery(async (db) => {
    const rows = await db.user.groupBy({ by: ["jobFunction"], where: { isActive: true, jobFunction: { not: null } }, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.jobFunction ?? "", r._count._all]));
  }, {} as Record<string, number>);
  const { data: purposes } = await safeQuery((db) => loadPurposes(db), DEFAULT_PURPOSES);
  const { data: lists } = await safeQuery(
    async (db) => ({ creditTypes: await loadCreditTypes(db), tiers: await loadEntityTiers(db), classification: await loadClassification(db), wlLevels: await loadWatchlistLevels(db) }),
    { creditTypes: DEFAULT_CREDIT_TYPES, tiers: DEFAULT_ENTITY_TIERS, classification: DEFAULT_CLASSIFICATION, wlLevels: DEFAULT_WATCHLIST_LEVELS }
  );
  const format = await effectiveFormat(today());
  const { data: surveillance } = await safeQuery((db) => loadSurveillanceSettings(db), DEFAULT_SURVEILLANCE);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Paramétrage de l&apos;outil</h1>
        <p className="muted">
          Circuit de validation, règles du workflow, dérogations, pièces et intelligence artificielle. Les grilles
          de notation et l&apos;échelle se paramètrent dans leurs écrans dédiés, par versions datées. Chaque modification est
          journalisée.
        </p>
      </div>
      <div className="card" role="status" style={{ padding: "12px 16px", fontSize: 13 }}>
        <strong>État de l&apos;IA :</strong> {ai.enabled ? (ai.missing ? `activée, mais ${ai.missing}` : `active (${ai.provider}, ${ai.model})`) : "désactivée"}.
      </div>
      <CircuitEditor
        circuit={circuit}
        stored={stored}
        readOnly={!perimeter.all}
        holders={holders}
        creditTypes={lists.creditTypes.filter((t) => t.active)}
        tiers={lists.tiers.filter((t) => t.active)}
      />
      <PurposesEditor initial={purposes} readOnly={!perimeter.all} creditTypes={lists.creditTypes.filter((t) => t.active)} />
      <ClassificationEditor initial={lists.classification} readOnly={!perimeter.all} alertKeys={format.alerts.map((a) => a.key)} />
      <WatchlistLevelsEditor initial={lists.wlLevels} readOnly={!perimeter.all} />
      <SurveillanceEditor initial={surveillance} readOnly={!perimeter.all} />
      <RefListEditor
        listKey="CREDIT_TYPES"
        title="Types de crédit"
        intro="Type de crédit choisi à l'ouverture du dossier ; une étape du circuit peut ne s'appliquer qu'à certains types (par exemple un niveau de décision supérieur pour l'investissement ou la promotion immobilière)."
        initial={lists.creditTypes}
        readOnly={!perimeter.all}
      />
      <RefListEditor
        listKey="ENTITY_TIERS"
        title="Catégories de délégation des centres"
        intro="Attribuées à chaque centre d'affaires (Administration › Banques et filiales) d'après la taille du portefeuille, sa sinistralité (créances en souffrance, coût du risque), les dérogations et rejets en contre-étude et les constats d'audit ; revues au moins une fois par an. Elles rendent bloquant l'avis du directeur du centre ou ajoutent un niveau de décision selon le circuit."
        initial={lists.tiers}
        readOnly={!perimeter.all}
        withHelp
      />
      <SettingsForm
        readOnly={!perimeter.all}
        values={values}
        defs={SETTINGS.map((d) => ({ ...d, options: d.options ? [...d.options] : undefined }))}
      />
    </div>
  );
}
