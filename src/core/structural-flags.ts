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
  YOUNG_COMPANY_NO_SUPPORT: "companyAgeYears",
  NEGATIVE_TANGIBLE_EQUITY: "negativeTangibleEquity",
  GOING_CONCERN_UNCERTAINTY: "goingConcernMaterialUncertainty",
  ACCOUNTS_TOO_OLD: "accountsTooOld",
  EBITDA_NEGATIVE_2_OF_3: "ebitdaNegativeTwoOfThreeYears",
  BASE_DSCR_BELOW_1: "baseDscrBelow1",
  STRESS_DSCR_BELOW_1: "stressDscrBelow1",
  SINGLE_CLIENT_DEPENDENCY: "singleClientDependencyUnmitigated",
  ACTIVE_RESTRUCTURING: "activeRestructuringForbearance",
  GROUP_FILE_INCOMPLETE: "materialGroupFileIncomplete",
};

/** Déclencheurs qu'aucun champ d'entrée ne sait porter : anomalie de configuration. */
export function unmappedTriggers(triggers: readonly string[]): string[] {
  return triggers.filter((t) => !(t in CAP_TRIGGER_TO_FLAG));
}
