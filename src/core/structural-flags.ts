/**
 * Correspondance entre le déclencheur d'un cap structurel et le champ d'entrée
 * qui le porte.
 *
 * Cette table est la SEULE source de vérité de ce lien. Elle était auparavant
 * recopiée dans le vérificateur d'alignement ; une deuxième copie est apparue
 * dans le simulateur de calibration, et deux copies d'une correspondance
 * dérivent toujours. Tout consommateur lit ici.
 */
import type { StructuralFlagsInput } from "./types";

export const CAP_TRIGGER_TO_FLAG: Record<string, keyof StructuralFlagsInput> = {
  GOING_CONCERN_UNCERTAINTY: "goingConcernMaterialUncertainty",
  EBITDA_NEGATIVE_2_OF_3: "ebitdaNegativeTwoOfThreeYears",
  BASE_DSCR_BELOW_1: "baseDscrBelow1",
  GROUP_FILE_INCOMPLETE: "materialGroupFileIncomplete",
};

/**
 * Déclencheurs retirés en V3 et devenus des entrées d'un autre traitement.
 * Conservés ici pour que les simulateurs et scripts sachent qu'ils existent
 * encore comme données d'entrée, sans plus produire de plafond de grade.
 */
export const RETIRED_CAP_TRIGGERS: Record<string, keyof StructuralFlagsInput> = {
  // Routage jeune entreprise (hors grilles publiées).
  YOUNG_COMPANY_NO_SUPPORT: "companyAgeYears",
  // Portés par la contribution centrale du critère concerné (inventaire C08).
  NEGATIVE_TANGIBLE_EQUITY: "negativeTangibleEquity",
  STRESS_DSCR_BELOW_1: "stressDscrBelow1",
  SINGLE_CLIENT_DEPENDENCY: "singleClientDependencyUnmitigated",
  ACTIVE_RESTRUCTURING: "activeRestructuringForbearance",
  // Porté par la porte de couverture et la classe de confiance.
  ACCOUNTS_TOO_OLD: "accountsTooOld",
};

/**
 * Constats structurels toujours saisis, mais qui ne plafonnent plus le grade.
 *
 * Ils restent des données d'entrée : ils alimentent les red flags, la porte de
 * couverture et les simulateurs. Ce qui a disparu en V3, c'est leur effet
 * automatique sur le grade — l'inventaire C08 a ramené dix plafonds à quatre
 * exceptions. L'interface lit cette table pour présenter chaque case pour ce
 * qu'elle fait réellement : sans cela, un analyste coche « dépendance client
 * unique » en croyant avoir posé un garde-fou qui ne s'applique plus.
 *
 * Le traitement est formulé sans code de critère : les deux modèles publiés
 * n'ont pas la même nomenclature (D* et B*).
 */
export interface RetiredCapObservation {
  trigger: string;
  flag: keyof StructuralFlagsInput;
  labelFr: string;
  treatmentFr: string;
}

export const RETIRED_CAP_OBSERVATIONS: RetiredCapObservation[] = [
  {
    trigger: "NEGATIVE_TANGIBLE_EQUITY",
    flag: "negativeTangibleEquity",
    labelFr: "Fonds propres tangibles négatifs",
    treatmentFr:
      "Porté par le critère de structure financière et par le red flag RF09. Aucun plafond de grade.",
  },
  {
    trigger: "STRESS_DSCR_BELOW_1",
    flag: "stressDscrBelow1",
    labelFr: "DSCR inférieur à 1,0× en stress seulement",
    treatmentFr:
      "Porté par le critère de couverture du service de la dette en scénario dégradé. Seule la rupture en scénario de base reste une exception non compensatoire.",
  },
  {
    trigger: "SINGLE_CLIENT_DEPENDENCY",
    flag: "singleClientDependencyUnmitigated",
    labelFr: "Dépendance à un client unique, non mitigée",
    treatmentFr: "Porté par le critère de concentration commerciale.",
  },
  {
    trigger: "ACTIVE_RESTRUCTURING",
    flag: "activeRestructuringForbearance",
    labelFr: "Restructuration ou forbearance active",
    treatmentFr:
      "Porté par le critère de comportement de paiement. La qualification en défaut DEF2 relève du moteur de défaut, jamais de la grille.",
  },
  {
    trigger: "ACCOUNTS_TOO_OLD",
    flag: "accountsTooOld",
    labelFr: "Comptes annuels trop anciens",
    treatmentFr: "Porté par la porte de couverture et par la classe de confiance.",
  },
];

/** Déclencheurs qu'aucun champ d'entrée ne sait porter : anomalie de configuration. */
export function unmappedTriggers(triggers: readonly string[]): string[] {
  return triggers.filter((t) => !(t in CAP_TRIGGER_TO_FLAG));
}
