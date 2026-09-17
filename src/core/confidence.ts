import type {
  ConfidenceInput,
  ConfidencePolicy,
  ConfidenceResultView,
} from "./types";

/**
 * Classe de confiance (constat H02).
 *
 * V2 traduisait la qualité de l'information en PLAFOND de grade. Sur le
 * portefeuille simulé, ce mécanisme déplaçait 55 à 65 % des dossiers de deux
 * grades et concentrait la moitié du portefeuille sur deux grades — au point
 * que le score moyen d'un grade dépassait celui du grade censé lui être
 * supérieur. La qualité de la mesure dominait ainsi le risque mesuré.
 *
 * V3 sépare les deux. La confiance est restituée comme une CLASSE (A, B, C, U)
 * à côté du grade, jamais dessus. Sous la classe minimale, aucun grade n'est
 * produit : un dossier trop peu documenté n'est pas un dossier moyen, c'est un
 * dossier non notable — et c'est une information opérationnelle utile, puisque
 * la réponse est de compléter le dossier, pas de négocier la note.
 */
export function computeConfidence(
  input: ConfidenceInput,
  policy: ConfidencePolicy
): ConfidenceResultView {
  for (const [k, v] of Object.entries(input)) {
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error(`Composante de confiance invalide : ${k}=${v}`);
    }
  }
  const w = policy.weights;
  const score =
    (input.completeness * w.completeness +
      input.freshness * w.freshness +
      input.reliability * w.reliability +
      input.provenance * w.provenance) /
    100;

  for (const band of policy.classes) {
    const okMin = score >= band.minScore;
    const okMax = band.maxScore === null || score < band.maxScore;
    if (okMin && okMax) {
      return {
        score,
        classCode: band.code,
        labelFr: band.labelFr,
        affectsGrade: false,
      };
    }
  }
  throw new Error(`Classes de confiance non exhaustives pour le score ${score}`);
}

const CLASS_ORDER: Record<"A" | "B" | "C" | "U", number> = { A: 1, B: 2, C: 3, U: 4 };

/** true si la classe atteint le minimum exigé pour produire un grade. */
export function meetsMinimumClass(
  classCode: "A" | "B" | "C" | "U",
  minimum: "A" | "B" | "C"
): boolean {
  return CLASS_ORDER[classCode] <= CLASS_ORDER[minimum];
}
