import { gridLinks, gridNeededPostes, indicatorCatalog } from "@/financials/compute";
import { DEFAULT_FORMAT } from "@/financials/statement-format";
import { today } from "@/lib/rating-scale";
import { getPerimeter, requireSession } from "@/lib/session";
import { activeModelIds, effectiveFormat, loadFormatVersions } from "@/lib/statement-format";
import { listModels } from "@/models";
import { FormatEditor } from "./FormatEditor";

export const dynamic = "force-dynamic";

/**
 * Format du bilan : ce que l'on charge (postes, totaux saisis ou calculés,
 * postes propres à la banque) et comment on l'analyse dès le chargement
 * (appréciation des indicateurs, alertes, synthèse). Versions datées, comme
 * les grilles et l'échelle : une version en vigueur est figée.
 */
export default async function FormatPage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const day = today();
  const [stored, current] = await Promise.all([loadFormatVersions({ fresh: true }), effectiveFormat(day, { fresh: true })]);
  const versions = [DEFAULT_FORMAT, ...stored].map((v) => ({
    ...v,
    state: v.version === current.version ? "EN_VIGUEUR" : v.effectiveFrom > day ? "A_VENIR" : "REMPLACEE",
  }));
  // Ratios de chaque grille : critère et indicateur, pour l'aide à l'écran.
  const gridUses: Record<string, string[]> = {};
  for (const m of listModels()) {
    for (const [criterion, link] of Object.entries(gridLinks(m.modelId))) {
      (gridUses[link.indicator] ??= []).push(`${m.modelId} ${criterion}`);
    }
  }
  const needs = gridNeededPostes(activeModelIds());

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Format du bilan</h1>
        <p className="muted">
          Ce que le chargé d&apos;affaires charge — bilan complet, bilan agrégé ou seulement les postes utiles à la notation — et
          l&apos;analyse restituée dès le chargement : appréciation de chaque indicateur, évolution sur trois exercices, alertes et
          situation financière d&apos;ensemble. Les ratios de la grille restent calculés par l&apos;outil selon les définitions CGNC.
          Chaque version porte une date d&apos;effet ; la version appliquée est consignée dans chaque notation.
        </p>
      </div>
      <FormatEditor
        readOnly={!perimeter.all}
        today={day}
        versions={versions}
        current={current}
        catalog={indicatorCatalog(DEFAULT_FORMAT)}
        gridUses={gridUses}
        gridDeps={Object.fromEntries(needs.byIndicator)}
        modelIds={activeModelIds()}
      />
    </div>
  );
}
