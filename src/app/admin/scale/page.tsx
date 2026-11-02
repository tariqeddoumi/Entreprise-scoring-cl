import { gradesRequiredByModels } from "@/models";
import { effectiveScale, loadScaleVersions, today } from "@/lib/rating-scale";
import { getPerimeter, requireSession } from "@/lib/session";
import { ScaleEditor } from "./ScaleEditor";

export const dynamic = "force-dynamic";

/**
 * Échelle de notation : versions datées de l'échelle maîtresse 1 à 10.
 *
 * Lecture pour tout administrateur ; écriture réservée à l'administrateur du
 * groupe. Une version en vigueur est figée : la changer reviendrait à rendre
 * incomparables deux notations faites sous la « même » échelle.
 */
export default async function ScalePage() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const [versions, current] = await Promise.all([loadScaleVersions({ fresh: true }), effectiveScale(today(), { fresh: true })]);
  const day = today();
  const rows = versions.map((v) => ({
    ...v,
    state: v.version === current.version ? "EN_VIGUEUR" : v.effectiveFrom > day ? "A_VENIR" : "REMPLACEE",
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Échelle de notation</h1>
        <p className="muted">
          Échelle maîtresse commune à toutes les grilles : classes 1 (meilleur risque) à 10, le défaut constaté restant noté hors
          échelle (DEF1 à DEF3). Chaque version porte une date d&apos;effet ; la version en vigueur à la date de calcul s&apos;applique
          et son identifiant est consigné dans chaque notation, qui se rejoue donc à l&apos;identique. Une version en vigueur est
          figée : pour changer les bornes ou les libellés, créez une nouvelle version, qui prend effet aujourd&apos;hui au plus tôt.
        </p>
      </div>
      <ScaleEditor
        readOnly={!perimeter.all}
        today={day}
        versions={rows}
        current={current}
        requiredGrades={gradesRequiredByModels()}
      />
    </div>
  );
}
