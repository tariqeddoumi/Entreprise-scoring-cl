/**
 * Jeu de démonstration SYNTHÉTIQUE — définitions.
 *
 * Toutes les contreparties sont FICTIVES. Le jeu est construit pour que
 * chaque comportement du moteur soit représenté au moins une fois :
 * notation normale, cap structurel, cap de qualité, red flag bloquant,
 * défaut avéré, donnée critique manquante, segment indéterminable, ainsi
 * qu'un historique permettant la comparaison entre deux arrêtés.
 *
 * Les valeurs sont plausibles pour le marché marocain mais ne décrivent
 * aucune entreprise réelle.
 */
import type { CriterionInput, RatingInput, Segment } from "../src/core/types";

export interface SeedCounterparty {
  key: string;
  name: string;
  ice: string;
  rc: string;
  fiscalId: string;
  legalForm: string;
  sectorCode: string;
  city: string;
}

export interface SeedRun {
  counterpartyKey: string;
  asOfDate: string;
  requestedBy: string;
  /** Ce que ce cas est censé démontrer. */
  purposeFr: string;
  input: Omit<RatingInput, "modelId" | "asOfDate"> & { modelId?: string };
}

export interface SeedOverride {
  /** Repère du run : clé de contrepartie + date d'arrêté. */
  counterpartyKey: string;
  asOfDate: string;
  toGrade: string;
  reasonCode: string;
  comment: string;
  evidence: string;
  requestedBy: string;
  decidedBy?: string;
  decision?: "APPROVED" | "REJECTED";
  decisionComment?: string;
}

// ---------------------------------------------------------------------------
// Contreparties
// ---------------------------------------------------------------------------

export const COUNTERPARTIES: SeedCounterparty[] = [
  {
    key: "AGRO",
    name: "Conserverie Atlas Démonstration (fictive)",
    ice: "DEMO000000000000001",
    rc: "DEMO-RC-14587",
    fiscalId: "DEMO-IF-2201458",
    legalForm: "SA",
    sectorCode: "DEMO-AGRO-CONSERVE",
    city: "Agadir",
  },
  {
    key: "TEXTILE",
    name: "Atelier Textile Démonstration (fictif)",
    ice: "DEMO000000000000002",
    rc: "DEMO-RC-20114",
    fiscalId: "DEMO-IF-3310114",
    legalForm: "SARL",
    sectorCode: "DEMO-TEXTILE-CONFECTION",
    city: "Fès",
  },
  {
    key: "AUTO",
    name: "Équipementier Automobile Démonstration (fictif)",
    ice: "DEMO000000000000003",
    rc: "DEMO-RC-30877",
    fiscalId: "DEMO-IF-4430877",
    legalForm: "SA",
    sectorCode: "DEMO-AUTO-EQUIPEMENT",
    city: "Tanger",
  },
  {
    key: "BTP",
    name: "Entreprise de Travaux Démonstration (fictive)",
    ice: "DEMO000000000000004",
    rc: "DEMO-RC-41230",
    fiscalId: "DEMO-IF-5541230",
    legalForm: "SARL",
    sectorCode: "DEMO-BTP-GENIE-CIVIL",
    city: "Casablanca",
  },
  {
    key: "NEGOCE",
    name: "Négoce Alimentaire Démonstration (fictif)",
    ice: "DEMO000000000000005",
    rc: "DEMO-RC-50992",
    fiscalId: "DEMO-IF-6650992",
    legalForm: "SARL AU",
    sectorCode: "DEMO-COMMERCE-GROS",
    city: "Marrakech",
  },
  {
    key: "TOURISME",
    name: "Hôtellerie Démonstration (fictive)",
    ice: "DEMO000000000000006",
    rc: "DEMO-RC-60441",
    fiscalId: "DEMO-IF-7760441",
    legalForm: "SA",
    sectorCode: "DEMO-TOURISME-HOTEL",
    city: "Marrakech",
  },
  {
    key: "PHARMA",
    name: "Laboratoire Pharmaceutique Démonstration (fictif)",
    ice: "DEMO000000000000007",
    rc: "DEMO-RC-70118",
    fiscalId: "DEMO-IF-8870118",
    legalForm: "SA",
    sectorCode: "DEMO-PHARMA",
    city: "Casablanca",
  },
  {
    key: "TRANSPORT",
    name: "Transport Routier Démonstration (fictif)",
    ice: "DEMO000000000000008",
    rc: "DEMO-RC-80336",
    fiscalId: "DEMO-IF-9980336",
    legalForm: "SARL",
    sectorCode: "DEMO-TRANSPORT-ROUTIER",
    city: "Berrechid",
  },
  {
    key: "STARTUP",
    name: "Services Numériques Démonstration (fictif)",
    ice: "DEMO000000000000009",
    rc: "DEMO-RC-90775",
    fiscalId: "DEMO-IF-1090775",
    legalForm: "SARL",
    sectorCode: "DEMO-SERVICES-IT",
    city: "Rabat",
  },
  {
    key: "IMMO",
    name: "Société de Gestion Démonstration (fictive)",
    ice: "DEMO000000000000010",
    rc: "DEMO-RC-10228",
    fiscalId: "DEMO-IF-1110228",
    legalForm: "SA",
    sectorCode: "DEMO-SERVICES-GESTION",
    city: "Casablanca",
  },
];

// ---------------------------------------------------------------------------
// Aides à la construction des jeux de critères
// ---------------------------------------------------------------------------

const q = (score: 0 | 25 | 50 | 75 | 100): CriterionInput => ({
  status: "AVAILABLE",
  score,
});
const v = (value: number): CriterionInput => ({ status: "AVAILABLE", value });

/**
 * Construit un jeu complet de 45 critères à partir d'un profil général,
 * surchargé par les valeurs propres au dossier. Sans profil de base, chaque
 * cas devrait énumérer les 45 critères, ce qui rendrait le jeu illisible.
 */
function profile(
  level: 0 | 25 | 50 | 75 | 100,
  quantitatives: Record<string, number>,
  overrides: Record<string, CriterionInput> = {}
): Record<string, CriterionInput> {
  const QUANT_DEFAULTS: Record<string, number> = {
    "D1.4": 25, "D1.5": 2.5, "D1.6": 1.25, "D1.8": 70,
    "D2.1": 3.5, "D2.2": 1.35, "D2.3": 12, "D2.5": 1.2,
    "D3.1": 0, "D3.4": 100,
    "D4.3": 20, "D4.4": 22,
    "D6.2": 120, "D6.3": 4,
  };
  const QUALITATIVE_CODES = [
    "D1.1", "D1.2", "D1.3", "D1.7",
    "D2.4", "D2.6",
    "D3.2", "D3.3", "D3.5", "D3.6", "D3.7",
    "D4.1", "D4.2", "D4.5", "D4.6", "D4.7", "D4.8",
    "D5.1", "D5.2", "D5.3", "D5.4", "D5.5", "D5.6", "D5.7",
    "D6.1", "D6.4", "D6.5",
    "D7.1", "D7.2", "D7.3", "D7.4",
  ];

  const out: Record<string, CriterionInput> = {};
  for (const code of QUALITATIVE_CODES) out[code] = q(level);
  for (const [code, def] of Object.entries(QUANT_DEFAULTS)) {
    out[code] = v(quantitatives[code] ?? def);
  }
  return { ...out, ...overrides };
}

const CONF_HIGH = { completeness: 100, freshness: 100, reliability: 100, provenance: 100 };
const CONF_GOOD = { completeness: 100, freshness: 100, reliability: 75, provenance: 100 };
const CONF_MEDIUM = { completeness: 75, freshness: 75, reliability: 75, provenance: 75 };
const CONF_LOW = { completeness: 50, freshness: 50, reliability: 50, provenance: 25 };

const seg = (s: Segment) => s;

// ---------------------------------------------------------------------------
// Exécutions de notation
// ---------------------------------------------------------------------------

export const RUNS: SeedRun[] = [
  // --- 1. Grande entreprise solide, deux arrêtés : base de comparaison -----
  {
    counterpartyKey: "PHARMA",
    asOfDate: "2025-12-31",
    requestedBy: "seed:analyste.corporate",
    purposeFr: "Grande entreprise de bonne qualité — arrêté de référence",
    input: {
      segment: seg("GE"),
      confidence: CONF_HIGH,
      structuralFlags: { companyAgeYears: 22 },
      criteria: profile(75, {
        "D1.4": 38, "D1.5": 1.2, "D1.6": 1.6, "D1.8": 95,
        "D2.1": 7.5, "D2.2": 1.9, "D2.3": 24, "D2.5": 1.5,
        "D3.1": 0, "D3.4": 115,
        "D4.3": 8, "D4.4": 12,
        "D6.2": 60, "D6.3": 1,
      }, { "D1.2": q(100), "D5.3": q(100), "D6.1": q(100) }),
    },
  },
  {
    counterpartyKey: "PHARMA",
    asOfDate: "2026-06-30",
    requestedBy: "seed:analyste.corporate",
    purposeFr: "Même contrepartie six mois plus tard — permet l'attribution de l'écart",
    input: {
      segment: seg("GE"),
      confidence: CONF_HIGH,
      structuralFlags: { companyAgeYears: 23 },
      criteria: profile(75, {
        // Levier et couverture se dégradent après un investissement financé par dette.
        "D1.4": 31, "D1.5": 2.6, "D1.6": 1.35, "D1.8": 82,
        "D2.1": 4.2, "D2.2": 1.45, "D2.3": 14, "D2.5": 1.25,
        "D3.1": 0, "D3.4": 108,
        "D4.3": 9, "D4.4": 12,
        "D6.2": 65, "D6.3": 2,
      }, { "D1.2": q(75), "D5.3": q(100), "D6.1": q(100) }),
    },
  },

  // --- 2. PME correcte, sans particularité --------------------------------
  {
    counterpartyKey: "AGRO",
    asOfDate: "2025-12-31",
    requestedBy: "seed:analyste.entreprises",
    purposeFr: "PME agroalimentaire saine — cas nominal",
    input: {
      segment: seg("PME"),
      confidence: CONF_GOOD,
      structuralFlags: { companyAgeYears: 15 },
      criteria: profile(75, {
        "D1.4": 29, "D1.5": 2.1, "D1.6": 1.3, "D1.8": 78,
        "D2.1": 4.5, "D2.2": 1.5, "D2.3": 14, "D2.5": 1.3,
        "D3.1": 0, "D3.4": 105,
        "D4.3": 18, "D4.4": 20,
        "D6.2": 85, "D6.3": 3,
      }, {
        // Saisonnalité agricole : exposition climatique matérielle.
        "D7.1": q(25), "D7.2": q(50),
      }),
    },
  },

  // --- 3. PME sous cap structurel (couverture de dette insuffisante) -------
  {
    counterpartyKey: "BTP",
    asOfDate: "2025-12-31",
    requestedBy: "seed:analyste.entreprises",
    purposeFr:
      "Score correct mais DSCR < 1 en base : démontre qu'un cap plafonne le grade sans modifier le score brut",
    input: {
      segment: seg("PME"),
      confidence: CONF_GOOD,
      structuralFlags: { companyAgeYears: 11, baseDscrBelow1: true },
      criteria: profile(50, {
        "D1.4": 22, "D1.5": 3.4, "D1.6": 1.1, "D1.8": 55,
        "D2.1": 2.2, "D2.2": 0.95, "D2.3": 4, "D2.5": 0.9,
        "D3.1": 5, "D3.4": 92,
        "D4.3": 38, "D4.4": 28,
        "D6.2": 140, "D6.3": 6,
      }, { "D4.5": q(25), "D2.4": q(25) }),
    },
  },

  // --- 4. TPE avec incidents : signal REFER, sans blocage ------------------
  {
    counterpartyKey: "TEXTILE",
    asOfDate: "2025-12-31",
    requestedBy: "seed:charge.affaires.tpe",
    purposeFr:
      "TPE avec retards de paiement matériels — red flag REFER corroboré par la mesure D3.1",
    input: {
      segment: seg("TPE"),
      confidence: CONF_MEDIUM,
      structuralFlags: { companyAgeYears: 9 },
      redFlags: ["RF07"],
      criteria: profile(50, {
        "D1.4": 14, "D1.5": 3.8, "D1.6": 0.95, "D1.8": 45,
        "D2.1": 1.8, "D2.2": 1.1, "D2.3": 3, "D2.5": 0.95,
        "D3.1": 45, "D3.4": 72,
        "D4.3": 44, "D4.4": 46,
        "D6.2": 200, "D6.3": 8,
      }, { "D3.2": q(25), "D3.5": q(25), "D5.2": q(25) }),
    },
  },

  // --- 5. Fonds propres négatifs : cap G9 + cas spécial --------------------
  {
    counterpartyKey: "TOURISME",
    asOfDate: "2025-12-31",
    requestedBy: "seed:analyste.entreprises",
    purposeFr:
      "Fonds propres tangibles négatifs : cas spécial sur D1.4 et cap structurel CAP02",
    input: {
      segment: seg("PME"),
      confidence: CONF_GOOD,
      structuralFlags: {
        companyAgeYears: 18,
        negativeTangibleEquity: true,
        ebitdaNegativeTwoOfThreeYears: true,
      },
      redFlags: ["RF09"],
      criteria: profile(50, {
        "D1.6": 0.7, "D1.8": 20,
        "D2.1": 1.1, "D2.2": 1.05, "D2.3": 1, "D2.5": 0.75,
        "D3.1": 20, "D3.4": 68,
        "D4.3": 30, "D4.4": 25,
        "D6.2": 160, "D6.3": 7,
      }, {
        "D1.4": { status: "AVAILABLE", specialCase: "NEGATIVE_TANGIBLE_EQUITY" },
        "D1.5": { status: "AVAILABLE", specialCase: "EBITDA_LTE_0" },
        "D7.1": q(25),
      }),
    },
  },

  // --- 6. Concentration client critique -----------------------------------
  {
    counterpartyKey: "AUTO",
    asOfDate: "2025-12-31",
    requestedBy: "seed:analyste.corporate",
    purposeFr:
      "Équipementier mono-donneur d'ordre : concentration mesurée et cap CAP08",
    input: {
      segment: seg("GE"),
      confidence: CONF_GOOD,
      structuralFlags: { companyAgeYears: 14, singleClientDependencyUnmitigated: true },
      redFlags: ["RF13"],
      criteria: profile(75, {
        "D1.4": 26, "D1.5": 2.4, "D1.6": 1.25, "D1.8": 80,
        "D2.1": 5.0, "D2.2": 1.55, "D2.3": 15, "D2.5": 1.25,
        "D3.1": 0, "D3.4": 102,
        "D4.3": 62, // part du premier client : critique
        "D4.4": 30,
        "D6.2": 70, "D6.3": 2,
      }, { "D4.5": q(50), "D4.6": q(50) }),
    },
  },

  // --- 7. Qualité de données insuffisante : aucun grade final -------------
  {
    counterpartyKey: "NEGOCE",
    asOfDate: "2025-12-31",
    requestedBy: "seed:charge.affaires.tpe",
    purposeFr:
      "Information trop pauvre : le score brut est calculé mais aucun grade final n'est produit",
    input: {
      segment: seg("PME"),
      confidence: CONF_LOW,
      structuralFlags: { companyAgeYears: 6 },
      criteria: profile(50, {
        "D1.4": 18, "D1.5": 3.0, "D1.6": 1.05, "D1.8": 50,
        "D2.1": 2.5, "D2.2": 1.2, "D2.3": 6, "D2.5": 1.05,
        "D3.1": 12, "D3.4": 85,
        "D4.3": 33, "D4.4": 35,
        "D6.2": 280, "D6.3": 14,
      }, {
        "D6.1": q(25), "D6.5": q(25),
        // Plusieurs critères non renseignés, sans être critiques.
        "D4.6": { status: "MISSING" },
        "D5.6": { status: "MISSING" },
        "D7.2": { status: "MISSING" },
      }),
    },
  },

  // --- 8. Défaut avéré : grade défaut forcé -------------------------------
  {
    counterpartyKey: "TRANSPORT",
    asOfDate: "2025-12-31",
    requestedBy: "seed:risk.manager",
    purposeFr:
      "Définition de défaut déclenchée : grade DEF1 forcé, score brut conservé pour la surveillance",
    input: {
      segment: seg("TPE"),
      confidence: CONF_GOOD,
      defaultTriggered: true,
      structuralFlags: { companyAgeYears: 12, activeRestructuringForbearance: true },
      redFlags: ["RF06", "RF08"],
      criteria: profile(25, {
        "D1.4": 6, "D1.5": 6.2, "D1.6": 0.65, "D1.8": 15,
        "D2.1": 0.8, "D2.2": 0.7, "D2.3": -3, "D2.5": 0.55,
        "D3.1": 120, "D3.4": 42,
        "D4.3": 40, "D4.4": 38,
        "D6.2": 240, "D6.3": 16,
      }, { "D3.6": q(0), "D3.5": q(0) }),
    },
  },

  // --- 9. Red flag bloquant : aucun score produit -------------------------
  {
    counterpartyKey: "IMMO",
    asOfDate: "2025-12-31",
    requestedBy: "seed:risk.manager",
    purposeFr:
      "Bénéficiaire effectif impossible à établir : la notation s'arrête avant toute agrégation",
    input: {
      segment: seg("PME"),
      confidence: CONF_MEDIUM,
      redFlags: ["RF01"],
      structuralFlags: { companyAgeYears: 8 },
      criteria: profile(50, {}),
    },
  },

  // --- 10. Donnée critique manquante : scoring bloqué ---------------------
  {
    counterpartyKey: "STARTUP",
    asOfDate: "2025-12-31",
    requestedBy: "seed:charge.affaires.tpe",
    purposeFr:
      "Levier non renseigné alors qu'il est critique : blocage explicite nommant le critère",
    input: {
      segment: seg("TPE"),
      confidence: CONF_MEDIUM,
      structuralFlags: { companyAgeYears: 1.5 },
      criteria: profile(50, { "D1.4": 20 }, {
        "D1.5": { status: "MISSING" },
      }),
    },
  },

  // --- 11. Jeune entreprise : cap CAP01 -----------------------------------
  {
    counterpartyKey: "STARTUP",
    asOfDate: "2026-06-30",
    requestedBy: "seed:charge.affaires.tpe",
    purposeFr:
      "Dossier complété : entreprise de moins de deux ans sans support groupe, cap CAP01 à G7",
    input: {
      segment: seg("TPE"),
      confidence: CONF_MEDIUM,
      structuralFlags: { companyAgeYears: 1.8, hasStrongGroupSupport: false },
      criteria: profile(75, {
        "D1.4": 34, "D1.5": 1.1, "D1.6": 1.7, "D1.8": 88,
        "D2.1": 6.0, "D2.2": 1.7, "D2.3": 22, "D2.5": 1.45,
        "D3.1": 0, "D3.4": 112,
        "D4.3": 26, "D4.4": 18,
        "D6.2": 95, "D6.3": 2,
      }, { "D5.2": q(25), "D4.5": q(50) }),
    },
  },

  // --- 12. Segment indéterminable : scoring bloqué ------------------------
  {
    counterpartyKey: "NEGOCE",
    asOfDate: "2026-06-30",
    requestedBy: "seed:analyste.entreprises",
    purposeFr:
      "Chiffre d'affaires groupe absent : le segment ne peut être déterminé, aucun segment par défaut n'est appliqué",
    input: {
      segmentationData: {},
      confidence: CONF_GOOD,
      criteria: profile(75, {}),
    },
  },
];

// ---------------------------------------------------------------------------
// Dérogations
// ---------------------------------------------------------------------------

export const OVERRIDES: SeedOverride[] = [
  {
    counterpartyKey: "AGRO",
    asOfDate: "2025-12-31",
    toGrade: "G3",
    reasonCode: "RECENT_EVENT_POSITIVE",
    comment:
      "Contrat pluriannuel signé postérieurement à la date d'arrêté, sécurisant environ 40 % du chiffre d'affaires prévisionnel. L'information n'est reflétée par aucun critère du modèle à cette date.",
    evidence: "GED/DEMO/2026-02-14/contrat-cadre-signe.pdf",
    requestedBy: "seed:analyste.entreprises",
    decidedBy: "seed:risk.manager",
    decision: "APPROVED",
    decisionComment:
      "Contrat vérifié, contrepartie de premier rang. Relèvement d'un cran approuvé, à revoir au prochain arrêté.",
  },
  {
    counterpartyKey: "BTP",
    asOfDate: "2025-12-31",
    toGrade: "G7",
    reasonCode: "TEMPORARY_SHOCK",
    comment:
      "Le demandeur estime le déficit de couverture de dette temporaire, lié au décalage d'encaissement d'un marché public.",
    evidence: "GED/DEMO/2026-01-20/situation-creances-publiques.pdf",
    requestedBy: "seed:analyste.entreprises",
    decidedBy: "seed:risk.manager",
    decision: "REJECTED",
    decisionComment:
      "Le décalage d'encaissement est récurrent sur les trois derniers exercices : il relève du modèle d'affaires, non d'un choc temporaire. Cap maintenu.",
  },
  {
    counterpartyKey: "AUTO",
    asOfDate: "2025-12-31",
    toGrade: "G6",
    reasonCode: "GROUP_SUPPORT",
    comment:
      "Lettre de soutien de la maison mère étrangère, non juridiquement contraignante mais assortie d'un historique de recapitalisation.",
    evidence: "GED/DEMO/2026-03-02/lettre-soutien-groupe.pdf",
    requestedBy: "seed:analyste.corporate",
    // Volontairement laissée en attente : illustre le circuit maker-checker.
  },
];
