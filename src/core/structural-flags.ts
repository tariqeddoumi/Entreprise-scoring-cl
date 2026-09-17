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

/** Déclencheurs qu'aucun champ d'entrée ne sait porter : anomalie de configuration. */
export function unmappedTriggers(triggers: readonly string[]): string[] {
  return triggers.filter((t) => !(t in CAP_TRIGGER_TO_FLAG));
}
