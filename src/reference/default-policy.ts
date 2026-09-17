import type { DefaultGradeConfig } from "@/core/types";

/**
 * Politique de défaut, guérison et rechute (constat H03).
 *
 * Le diagnostic relevait que DEF1/DEF2/DEF3 restaient des libellés génériques.
 * Ils sont définis ici, une fois, pour les deux modèles : un défaut est un
 * ÉTAT CONSTATÉ selon une définition unique, pas une estimation produite par
 * une grille. C'est la raison pour laquelle les grades de défaut restent
 * communs alors que les grades performants deviennent propres à chaque modèle.
 *
 * STATUT — proposition à valider. Les seuils de jours de retard, de matérialité
 * et les durées probatoires doivent être confirmés sur le corpus Bank Al-Maghrib
 * applicable et approuvés conjointement Risques–Finance. Le moteur de notation
 * n'évalue jamais lui-même la définition du défaut : il reçoit le constat d'un
 * moteur séparé et force le grade correspondant.
 */

export const DEFAULT_POLICY_VERSION = "DEF-2026.1";
export const DEFAULT_POLICY_STATUS = "PROPOSITION_A_VALIDER" as const;

export const DEFAULT_GRADES: DefaultGradeConfig[] = [
  {
    grade: "DEF1",
    labelFr: "Défaut par retard de paiement",
    entryCriteriaFr: [
      "Arriéré supérieur au seuil de matérialité approuvé, persistant au-delà du nombre de jours retenu par la définition du défaut applicable (seuil seed : 90 jours).",
      "Aucun élément d'improbabilité de paiement au-delà du retard lui-même.",
    ],
    cureRuleFr:
      "Retour en sain après régularisation intégrale de l'arriéré et période probatoire continue sans nouvel incident (durée seed : 3 mois). Une rechute pendant la période probatoire ramène en défaut sans nouvelle période de grâce.",
  },
  {
    grade: "DEF2",
    labelFr: "Défaut par improbabilité de paiement ou restructuration en difficulté",
    entryCriteriaFr: [
      "Improbabilité de paiement constatée : abandon de créance, provision spécifique matérielle, cession à perte, exécution de garantie.",
      "Restructuration accordée en raison de difficultés financières, ou seconde concession sur un même encours.",
      "Contagion appliquée selon la règle validée du régime applicable.",
    ],
    cureRuleFr:
      "Retour en sain après période probatoire renforcée (durée seed : 12 mois) sans arriéré ni nouvelle concession, et suppression des éléments d'improbabilité de paiement. La décision de guérison est prise par l'instance de délégation compétente, jamais par le modèle.",
  },
  {
    grade: "DEF3",
    labelFr: "Défaut par procédure collective ou contentieux",
    entryCriteriaFr: [
      "Ouverture d'une procédure de redressement, de sauvegarde ou de liquidation.",
      "Cessation d'activité constatée, ou passage en recouvrement contentieux.",
    ],
    cureRuleFr:
      "Pas de guérison automatique : sortie uniquement sur décision formelle après clôture de la procédure et reconstitution d'un historique de paiement approuvé par l'instance compétente.",
  },
];

/** Grade de défaut appliqué quand le constat amont n'en précise pas la nature. */
export const DEFAULT_GRADE_FALLBACK = "DEF1" as const;

/**
 * Rang ordinal d'un grade de défaut : tous strictement pires que tout grade
 * performant, et ordonnés entre eux par sévérité du constat.
 */
export function defaultGradeSeverity(grade: string): number {
  const idx = DEFAULT_GRADES.findIndex((g) => g.grade === grade);
  return idx >= 0 ? idx + 1 : 0;
}

export function isDefaultGrade(grade: string | null): boolean {
  return grade !== null && grade.startsWith("DEF");
}
