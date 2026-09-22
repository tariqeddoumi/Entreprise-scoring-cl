import type {
  GradeScaleConfig,
  GroupSupportConfig,
  GroupSupportInput,
  GroupSupportResult,
} from "./types";

/**
 * Méthode de support groupe (constat H05).
 *
 * Le dispositif V2 annonçait une méthode dédiée sans l'implémenter, tout en
 * laissant un critère (D5.4/B6.1) porter implicitement le soutien. Deux effets
 * s'ensuivaient : un relèvement opportuniste non tracé, et l'impossibilité de
 * comparer une note autonome à une note soutenue.
 *
 * La méthode retenue est volontairement stricte :
 *
 *  1. la note AUTONOME est toujours calculée et conservée ;
 *  2. le relèvement n'est accordé que si les QUATRE conditions sont documentées
 *     — capacité du garant, volonté démontrée, caractère juridiquement
 *     contraignant, transférabilité effective des fonds ;
 *  3. il est plafonné en nombre de crans ;
 *  4. la condition manquante est nommée dans le résultat, ce qui rend le refus
 *     de relèvement explicable au client comme au comité.
 *
 * Une garantie qui ne satisfait pas ces conditions n'est pas ignorée : elle
 * appartient au moteur de décision et au calcul de la perte en cas de défaut.
 * Elle ne rend simplement pas l'emprunteur intrinsèquement meilleur.
 */
export function applyGroupSupport(
  scale: GradeScaleConfig,
  config: GroupSupportConfig,
  standaloneGrade: string | null,
  input: GroupSupportInput | undefined
): { finalGrade: string | null; support: GroupSupportResult | null } {
  if (!input || !input.claimed) {
    return { finalGrade: standaloneGrade, support: null };
  }

  const missing: string[] = [];
  if (!input.capacityDocumented) missing.push("capacité financière du garant non documentée");
  if (!input.willingnessDocumented) missing.push("volonté de soutien non démontrée (historique, engagement écrit)");
  if (!input.legallyBinding) missing.push("engagement non juridiquement contraignant");
  if (!input.fundsTransferable) missing.push("transférabilité effective des fonds non établie");

  if (standaloneGrade === null) {
    return {
      finalGrade: null,
      support: {
        claimed: true,
        granted: false,
        notchesApplied: 0,
        missingConditionsFr: missing,
        rationaleFr:
          "Aucune note autonome n'a pu être produite : un relèvement de support ne peut pas se substituer à une notation absente.",
      },
    };
  }

  if (config.requiresAllConditions && missing.length > 0) {
    return {
      finalGrade: standaloneGrade,
      support: {
        claimed: true,
        granted: false,
        notchesApplied: 0,
        missingConditionsFr: missing,
        rationaleFr: `Relèvement refusé : ${missing.length} condition(s) non satisfaite(s) sur quatre. La garantie éventuelle reste à traiter par le moteur de décision et dans la perte en cas de défaut.`,
      },
    };
  }

  const requested = Math.max(0, Math.trunc(input.requestedNotches ?? 0));
  const notches = Math.min(requested, config.maxNotches);
  if (notches === 0) {
    return {
      finalGrade: standaloneGrade,
      support: {
        claimed: true,
        granted: false,
        notchesApplied: 0,
        missingConditionsFr: [],
        rationaleFr:
          "Conditions satisfaites mais aucun cran demandé : la note autonome est conservée.",
      },
    };
  }

  const upgraded = improveGrade(scale, standaloneGrade, notches);
  return {
    finalGrade: upgraded,
    support: {
      claimed: true,
      granted: true,
      notchesApplied: notches,
      missingConditionsFr: [],
      rationaleFr: `Relèvement de ${notches} cran(s) appliqué (plafond ${config.maxNotches}) : ${standaloneGrade} → ${upgraded}. La note autonome ${standaloneGrade} reste la mesure du risque intrinsèque et doit être utilisée en surveillance.`,
    },
  };
}

/**
 * Remonte un grade de n crans dans l'échelle, sans jamais dépasser le meilleur
 * grade existant. Un grade de défaut n'est jamais relevé : un défaut est un
 * état constaté, qu'aucun soutien ne fait disparaître hors processus formel de
 * guérison.
 */
function improveGrade(scale: GradeScaleConfig, grade: string, notches: number): string {
  if (grade.startsWith("DEF")) return grade;
  const idx = scale.bands.findIndex((b) => b.grade === grade);
  if (idx < 0) return grade;
  const target = Math.max(0, idx - notches);
  return scale.bands[target].grade;
}
