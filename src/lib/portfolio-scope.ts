import type { Identity } from "./auth";
import type { Perimeter } from "./scope";
import { loadSettings } from "./settings";
import { loadCircuit } from "./workflow";

/**
 * Portefeuille d'un chargé d'affaires (profil 1 du circuit), si le paramétrage
 * restreint sa visibilité à ses clients (PORTFOLIO_SCOPE_P1 = PORTEFEUILLE).
 *
 * Ne sont jamais restreints : le gestionnaire des risques et l'administrateur
 * (rôles), et les fonctions des profils 2 à 4 (directeur de centre,
 * contre-étude, surveillance), qui voient leur centre, leur région ou leur
 * banque selon l'arborescence. Une personne sans fonction métier garde la
 * visibilité de son entité.
 */
export async function portfolioFor(identity: Pick<Identity, "name" | "role" | "jobFunction" | "accountOfficerCode">): Promise<Perimeter["portfolio"]> {
  if (identity.role !== "ANALYST" && identity.role !== "READONLY") return null;
  if (!identity.jobFunction) return null;
  const { circuit } = await loadCircuit();
  if (circuit.functions.find((f) => f.code === identity.jobFunction)?.profile !== "P1") return null;
  if ((await loadSettings()).PORTFOLIO_SCOPE_P1 !== "PORTEFEUILLE") return null;
  const owners = [identity.accountOfficerCode?.trim(), identity.name].filter((x): x is string => !!x);
  return { owners: [...new Set(owners)], username: identity.name };
}
