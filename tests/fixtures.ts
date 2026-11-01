import { emptyFinancials, type FinancialsDraft } from "@/financials/compute";
import type { CriterionInput, RatingInput } from "@/core/types";

/** Confiance parfaite : aucune contrainte liée à la donnée. */
export const FULL_CONFIDENCE = {
  completeness: 100,
  freshness: 100,
  reliability: 100,
  provenance: 100,
};

function q(score: 0 | 25 | 50 | 75 | 100): CriterionInput {
  return { status: "AVAILABLE", score };
}
function v(value: number): CriterionInput {
  return { status: "AVAILABLE", value };
}

/**
 * Golden vector TPE — exemple 21.1 des grilles pour D1 (score domaine 61,00),
 * complété par des scores uniformes contrôlés sur les autres domaines :
 * D2 = 50, D3 = 75, D4 = 50, D5 = 75, D6 = 75, D7 = 50.
 *
 * Score global attendu :
 * 61×0,25 + 50×0,10 + 75×0,25 + 50×0,15 + 75×0,15 + 75×0,07 + 50×0,03 = 64,50 → STD-P5.
 *
 * D7.1 et D7.2 sont conditionnés à la matérialité : sans déclaration, leur poids
 * est transféré à D7.3 et D7.4 selon la règle déclarée, et le score du domaine
 * reste 50.
 */
export function tpeGoldenInput(): RatingInput {
  return {
    modelId: "CORP_STD_V1",
    segment: "TPE",
    asOfDate: "2026-08-18",
    confidence: { ...FULL_CONFIDENCE },
    criteria: {
      // D1 — exemple 21.1 : 75/50/50/75/50/75/50/50 → 61,00
      "D1.1": q(75),
      "D1.2": q(50),
      "D1.3": q(50),
      "D1.4": v(30), // [25,35[ => 75
      "D1.5": v(3), // ]2,3.5] => 50
      "D1.6": v(1.3), // [1.25,1.5[ => 75
      "D1.7": q(50),
      "D1.8": v(60), // [50,70[ => 50
      // D2 — uniforme 50
      "D2.1": v(2.5), // [2,3[ => 50
      "D2.2": v(1.2), // [1.15,1.3[ => 50
      "D2.3": v(8), // [5,12[ => 50
      "D2.4": q(50),
      "D2.5": v(1.1), // [1.0,1.2[ => 50
      "D2.6": q(50),
      // D3 — uniforme 75
      "D3.1": v(5), // ]0,7] => 75
      "D3.2": q(75),
      "D3.3": q(75),
      "D3.4": v(100), // [90,110[ => 75
      "D3.5": q(75),
      "D3.6": q(75),
      "D3.7": q(75),
      // D4 — uniforme 50
      "D4.1": q(50),
      "D4.2": q(50),
      "D4.3": v(30), // ]25,35] => 50 (TPE)
      "D4.4": v(30), // ]25,40] => 50
      "D4.5": q(50),
      "D4.6": q(50),
      "D4.7": q(50),
      "D4.8": q(50),
      // D5 — uniforme 75
      "D5.1": q(75),
      "D5.2": q(75),
      "D5.3": q(75),
      "D5.4": q(75),
      "D5.5": q(75),
      "D5.6": q(75),
      "D5.7": q(75),
      // D6 — uniforme 75
      "D6.1": q(75),
      "D6.2": v(150), // ]120,180] => 75 (TPE)
      "D6.3": v(4), // ]2,5] => 75
      "D6.4": q(75),
      "D6.5": q(75),
      // D7 — uniforme 50
      "D7.1": q(50),
      "D7.2": q(50),
      "D7.3": q(50),
      "D7.4": q(50),
    },
  };
}

// --- Bilan d'une PME fictive (module bilan) ---

const M = 1_000_000;
const s = (n: number) => String(n * M);

/** PME fictive, bilan équilibré sur deux exercices (montants en millions). */
export function pmeFinancials(): FinancialsDraft {
  return {
    ...emptyFinancials(),
    statementModel: "NORMAL",
    certified: true,
    source: "SAISIE",
    years: [
      {
        fiscalYear: "2025",
        closingDate: "2025-12-31",
        values: {
          IMMO_INCORPORELLES: s(2), IMMO_CORPORELLES: s(40), IMMO_FINANCIERES: s(1),
          STOCKS: s(15), CREANCES_CLIENTS: s(20), AUTRES_CREANCES: s(5), TRESORERIE_ACTIF: s(7),
          CAPITAL: s(20), PRIMES_RESERVES: s(10), REPORT_A_NOUVEAU: s(2), RESULTAT_EXERCICE_BILAN: s(5),
          DETTES_FINANCEMENT: s(25), FOURNISSEURS: s(14), AUTRES_DETTES_CIRCULANTES: s(8), TRESORERIE_PASSIF: s(6),
          VENTES_BIENS_SERVICES: s(100), ACHATS_CONSOMMES: s(55), AUTRES_CHARGES_EXTERNES: s(12), IMPOTS_TAXES: s(1),
          CHARGES_PERSONNEL: s(18), DOTATIONS_EXPLOITATION: s(5), CHARGES_INTERETS: s(2), IMPOTS_RESULTATS: s(2),
          TOTAL_ACTIF_DECLARE: s(90), RESULTAT_NET_DECLARE: s(5),
          SERVICE_DETTE_PRINCIPAL_12M: s(5),
        },
      },
      {
        fiscalYear: "2024",
        closingDate: "2024-12-31",
        values: {
          IMMO_INCORPORELLES: s(2), IMMO_CORPORELLES: s(38), IMMO_FINANCIERES: s(1),
          STOCKS: s(14), CREANCES_CLIENTS: s(18), AUTRES_CREANCES: s(4), TRESORERIE_ACTIF: s(5),
          CAPITAL: s(20), PRIMES_RESERVES: s(8), REPORT_A_NOUVEAU: s(1), RESULTAT_EXERCICE_BILAN: s(4),
          DETTES_FINANCEMENT: s(27), FOURNISSEURS: s(13), AUTRES_DETTES_CIRCULANTES: s(6), TRESORERIE_PASSIF: s(3),
          VENTES_BIENS_SERVICES: s(92), ACHATS_CONSOMMES: s(51), AUTRES_CHARGES_EXTERNES: s(11), IMPOTS_TAXES: s(1),
          CHARGES_PERSONNEL: s(17), DOTATIONS_EXPLOITATION: "4500000", CHARGES_INTERETS: "2100000", IMPOTS_RESULTATS: "1400000",
        },
      },
    ],
  };
}

