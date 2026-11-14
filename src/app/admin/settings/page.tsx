import { DEFAULT_ENTRY_LISTS, loadEntryLists } from "@/lib/entry-lists";
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
import { FacilityTypesEditor } from "./FacilityTypesEditor";
import { loadFacilityTypes } from "@/lib/facilities";
import { DEFAULT_FACILITY_TYPES } from "@/reference/facilities";
import { loadSurveillanceSettings } from "@/lib/portfolio-data";
import { DEFAULT_SURVEILLANCE } from "@/reference/portfolio";
import { effectiveFormat } from "@/lib/statement-format";
import { today } from "@/lib/rating-scale";
import { loadCommercialSegments, loadCreditTypes, loadEntityTiers, loadPurposes } from "@/lib/financial-statements";
import { DEFAULT_COMMERCIAL_SEGMENTS, DEFAULT_CREDIT_TYPES, DEFAULT_ENTITY_TIERS, DEFAULT_PURPOSES } from "@/reference/case-purposes";

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
    async (db) => ({ creditTypes: await loadCreditTypes(db), tiers: await loadEntityTiers(db), classification: await loadClassification(db), wlLevels: await loadWatchlistLevels(db), segments: await loadCommercialSegments(db) }),
    { creditTypes: DEFAULT_CREDIT_TYPES, tiers: DEFAULT_ENTITY_TIERS, classification: DEFAULT_CLASSIFICATION, wlLevels: DEFAULT_WATCHLIST_LEVELS, segments: DEFAULT_COMMERCIAL_SEGMENTS }
  );
  const format = await effectiveFormat(today());
  const { data: surveillance } = await safeQuery((db) => loadSurveillanceSettings(db), DEFAULT_SURVEILLANCE);
  const { data: facilityTypes } = await safeQuery((db) => loadFacilityTypes(db), DEFAULT_FACILITY_TYPES);
  const { data: entryLists } = await safeQuery((db) => loadEntryLists(db), DEFAULT_ENTRY_LISTS);

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
        <strong>État de l&apos;OCR intelligent :</strong> {ai.enabled ? (ai.missing ? `activé, mais ${ai.missing}` : `actif (${ai.provider}, ${ai.model})`) : "désactivé"}.
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
      <FacilityTypesEditor initial={facilityTypes} readOnly={!perimeter.all} />
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
      <RefListEditor
        listKey="COMMERCIAL_SEGMENTS"
        title="Segments commerciaux"
        intro="Segmentation commerciale de la banque, rapatriée de T24 (codes à aligner sur ceux de T24) ou choisie en saisie minimale. Distincte du segment du modèle de notation (TPE, PME, GE), calculé selon ses propres seuils."
        initial={lists.segments}
        readOnly={!perimeter.all}
      />
      <section className="card" style={{ padding: 16, display: "grid", gap: 6 }} id="listes-saisie">
        <h2 style={{ fontWeight: 600 }}>Listes de saisie</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          En saisie manuelle (client pas encore dans T24, ou T24 indisponible), la fiche client et les lignes d&apos;engagement se remplissent par ces
          listes : les valeurs sont figées et se rapprochent de T24 au rattachement. Alignez les codes sur ceux de T24. Un code utilisé se désactive au
          lieu d&apos;être supprimé.
        </p>
      </section>
      <RefListEditor listKey="ENTRY_LEGAL_FORMS" title="Formes juridiques" intro="Code enregistré dans la fiche (ex. SA, SARL), comparé tel quel à T24." initial={entryLists.legalForms} readOnly={!perimeter.all} />
      <RefListEditor listKey="ENTRY_SECTORS" title="Secteurs d'activité" intro="Code du référentiel sectoriel de la banque (par défaut : sections de la NMAE 2010)." initial={entryLists.sectors} readOnly={!perimeter.all} />
      <RefListEditor listKey="ENTRY_CITIES" title="Villes" intro="Libellé enregistré dans la fiche ; comparé à T24 sans accents ni casse." initial={entryLists.cities} readOnly={!perimeter.all} />
      <RefListEditor listKey="ENTRY_COMMERCIAL_COURTS" title="Tribunaux de commerce" intro="Tribunal qui tient le registre de commerce (fiche client, signalétique des rapports)." initial={entryLists.commercialCourts} readOnly={!perimeter.all} />
      <RefListEditor listKey="ENTRY_GUARANTEE_TYPES" title="Types de garantie" intro="Garanties des lignes d'engagement saisies." initial={entryLists.guaranteeTypes} readOnly={!perimeter.all} />
      <SettingsForm
        readOnly={!perimeter.all}
        values={values}
        defs={SETTINGS.map((d) => ({ ...d, options: d.options ? [...d.options] : undefined }))}
      />
    </div>
  );
}
