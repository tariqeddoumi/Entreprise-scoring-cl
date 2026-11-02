import Link from "next/link";
import { getModel, listModels } from "@/models";
import { effectiveParams, loadParamVersions } from "@/lib/model-params";
import { effectiveScale, today } from "@/lib/rating-scale";
import { getPerimeter, requireSession } from "@/lib/session";
import { applyModelParams, paramsOf, thresholdsOf } from "@/reference/model-params";
import { GridEditor, type GridMeta } from "./GridEditor";

export const dynamic = "force-dynamic";

/**
 * Paramétrage des grilles : versions datées des paramètres de chaque grille
 * (poids, barèmes, repères, critères, exceptions, revues, couverture,
 * confiance, support groupe). Lecture pour tout administrateur ; écriture
 * réservée à l'administrateur du groupe.
 */
export default async function GridsPage({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const { model: modelParam } = await searchParams;
  const models = listModels();
  const base = getModel(modelParam ?? "") ?? models[0];
  const day = today();
  const [versions, scale] = await Promise.all([loadParamVersions({ fresh: true }), effectiveScale(day, { fresh: true })]);
  const current = effectiveParams(versions, base.modelId, day);
  const effective = current ? applyModelParams(base, current) : base;

  const meta: GridMeta = {
    modelId: base.modelId,
    baseVersion: base.version,
    labelFr: base.labelFr,
    segments: base.segments,
    domains: base.domains.map((d) => ({ code: d.code, labelFr: d.labelFr })),
    // Critères embarqués (un critère retiré reste listé pour pouvoir être
    // rétabli) ; les critères ajoutés viennent des paramètres.
    criteria: base.criteria.map((c) => ({
      code: c.code,
      domainCode: c.domainCode,
      type: c.type,
      unit: c.unit?.trim() ?? "",
      direction:
        Object.values(c.binsBySegment ?? {})
          .map((bins) => thresholdsOf(bins)?.direction)
          .find(Boolean) ??
        c.direction ??
        "HIGHER_IS_BETTER",
      editableBins: Object.values(c.binsBySegment ?? {}).some((bins) => thresholdsOf(bins) !== null),
    })),
    rules: effective.nonCompensatoryRules.map((r) => ({
      code: r.code,
      labelFr: r.labelFr,
      criterion: r.derivation?.criterion ?? null,
    })),
    reviews: (effective.mandatoryReviews ?? []).map((r) => ({ criterion: r.criterion, labelFr: r.labelFr })),
    grades: scale.bands.map((b) => b.grade),
    concentrationCapBps: base.concentrationCapBps ?? (base.routeFamily === "BEHAVIORAL" ? 800 : 600),
  };
  const rows = versions
    .filter((v) => v.modelId === base.modelId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .map((v) => ({
      version: v.version,
      effectiveFrom: v.effectiveFrom,
      labelFr: v.labelFr,
      noteFr: v.noteFr ?? "",
      createdBy: v.createdBy ?? "",
      state: v.version === current?.version ? "EN_VIGUEUR" : v.effectiveFrom > day ? "A_VENIR" : "REMPLACEE",
      params: v.params,
    }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Paramétrage des grilles</h1>
        <p className="muted">
          Poids par segment, seuils des barèmes, repères qualitatifs, critères (ajout, retrait, caractère critique, score d&apos;une
          donnée absente), exceptions, revues obligatoires, couverture, confiance et support groupe. Chaque version porte une date
          d&apos;effet ; la version en vigueur à la date de calcul s&apos;applique et son identifiant est consigné dans la notation. Une
          version en vigueur est figée. Les contrôles du démarrage s&apos;appliquent à l&apos;enregistrement : poids à 100 % par segment,
          plafond de concentration, barèmes exhaustifs, plafonds présents dans l&apos;échelle.
        </p>
      </div>
      <nav className="tabs" aria-label="Grille à paramétrer">
        {models.map((m) => (
          <Link key={m.modelId} href={`/admin/grilles?model=${m.modelId}`} aria-current={m.modelId === base.modelId ? "page" : undefined}>
            {m.modelId}
          </Link>
        ))}
      </nav>
      <GridEditor
        key={base.modelId}
        meta={meta}
        readOnly={!perimeter.all}
        today={day}
        current={current ? { version: current.version, effectiveFrom: current.effectiveFrom, labelFr: current.labelFr } : null}
        currentParams={current ? current.params : paramsOf(base)}
        versions={rows}
      />
    </div>
  );
}
