/**
 * Référentiel sectoriel NMA 2010 × région et bibliothèque de scénarios
 * (constats H04 et H08).
 *
 * Le diagnostic relevait que les grilles renvoyaient à des percentiles
 * sectoriels et à un grade de secteur qui n'étaient alimentés par aucune
 * source. Une grille qui compare une marge à « P75 sectoriel » sans référentiel
 * ne compare rien : chaque analyste substitue son intuition.
 *
 * Ce module fournit la STRUCTURE et les contrôles, pas les valeurs. Il est
 * délibérément livré NON ALIMENTÉ : le peuplement suppose les données OMTPME,
 * les distributions du portefeuille de la banque et une gouvernance sectorielle
 * — trois éléments qui n'appartiennent pas au code. Tant qu'il est vide, le
 * moteur traite le grade sectoriel comme une donnée indisponible et applique la
 * catégorie prudente du critère, ce qui rend l'absence visible au lieu de la
 * laisser se dissoudre dans un score moyen.
 */

export type MoroccanRegion =
  | "TANGER_TETOUAN_AL_HOCEIMA"
  | "ORIENTAL"
  | "FES_MEKNES"
  | "RABAT_SALE_KENITRA"
  | "BENI_MELLAL_KHENIFRA"
  | "CASABLANCA_SETTAT"
  | "MARRAKECH_SAFI"
  | "DRAA_TAFILALET"
  | "SOUSS_MASSA"
  | "GUELMIM_OUED_NOUN"
  | "LAAYOUNE_SAKIA_EL_HAMRA"
  | "DAKHLA_OUED_ED_DAHAB"
  | "NATIONAL";

/** Grade sectoriel interne : S1 (très résilient) à S5 (crise structurelle). */
export type SectorGrade = "S1" | "S2" | "S3" | "S4" | "S5";

export interface SectorEntry {
  /** Code de la Nomenclature Marocaine des Activités 2010. */
  nma2010: string;
  labelFr: string;
  region: MoroccanRegion;
  grade: SectorGrade;
  /** Effectif ayant servi à établir le grade. Sous le minimum, l'entrée est non crédible. */
  sampleSize: number;
  observationPeriodFr: string;
  sourceFr: string;
  effectiveFrom: string;
  /** Percentiles de marge et de levier, alimentés depuis les distributions observées. */
  benchmarks?: {
    ebitdaMarginP25: number;
    ebitdaMarginP50: number;
    ebitdaMarginP75: number;
    leverageP50: number;
    leverageP75: number;
  };
  /** Risques ESG matériels du secteur (H09) : conditionne l'évaluation des critères D7/B7. */
  materiality: {
    physicalClimate: boolean;
    transition: boolean;
    environmentalCompliance: boolean;
  };
}

/** Effectif minimal pour qu'un grade sectoriel soit opposable. */
export const SECTOR_MIN_SAMPLE_SIZE = 30;

export const SECTOR_REFERENCE_VERSION = "SECT-2026.0";
export const SECTOR_REFERENCE_STATUS = "NOT_POPULATED" as const;

/**
 * Entrées du référentiel.
 *
 * Vide par construction. Le peuplement est une porte de programme (P2) : il
 * suppose la publication des distributions par NMA 2010 et région, la fixation
 * de la période d'observation et la mise en place du comité sectoriel.
 */
export const SECTOR_ENTRIES: SectorEntry[] = [];

export function lookupSector(
  nma2010: string,
  region: MoroccanRegion
): SectorEntry | undefined {
  const exact = SECTOR_ENTRIES.find(
    (e) => e.nma2010 === nma2010 && e.region === region && e.sampleSize >= SECTOR_MIN_SAMPLE_SIZE
  );
  if (exact) return exact;
  // Repli national explicite : une moyenne nationale vaut mieux qu'une valeur
  // régionale non crédible, à condition que le repli soit visible.
  return SECTOR_ENTRIES.find(
    (e) => e.nma2010 === nma2010 && e.region === "NATIONAL" && e.sampleSize >= SECTOR_MIN_SAMPLE_SIZE
  );
}

/** Score de critère correspondant à un grade sectoriel. */
export function sectorGradeToScore(grade: SectorGrade): 0 | 25 | 50 | 75 | 100 {
  switch (grade) {
    case "S1":
      return 100;
    case "S2":
      return 75;
    case "S3":
      return 50;
    case "S4":
      return 25;
    case "S5":
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Bibliothèque de scénarios de stress (H08)
// ---------------------------------------------------------------------------

export interface StressScenario {
  code: string;
  labelFr: string;
  /** Secteurs concernés, en codes NMA 2010 ou familles déclarées. */
  appliesToFr: string;
  shocksFr: string[];
  sourceFr: string;
  status: "SEED_A_CALIBRER" | "VALIDE";
}

export const SCENARIO_LIBRARY_VERSION = "SCEN-2026.1";

/**
 * Scénarios seed, différenciés par exposition marocaine réelle.
 *
 * Le dispositif V2 appliquait un choc combiné unique à toutes les contreparties
 * — chiffre d'affaires −10 %, marge −2 points, taux +200 pb. Un tel choc ne
 * décrit ni une sécheresse pour un agriculteur du Souss, ni une saison
 * touristique manquée à Marrakech, ni un retard de certification sur un marché
 * public. La sévérité de chaque choc reste à calibrer sur l'historique.
 */
export const STRESS_SCENARIOS: StressScenario[] = [
  {
    code: "SC_HYDRIQUE",
    labelFr: "Stress hydrique et rendement agricole",
    appliesToFr: "Agriculture, agro-industrie, activités dépendantes de l'irrigation",
    shocksFr: [
      "Baisse de rendement liée à une campagne déficitaire (sévérité à calibrer sur l'historique pluviométrique du bassin).",
      "Hausse du coût des intrants et de l'énergie de pompage.",
      "Allongement du délai d'encaissement des coopératives et donneurs d'ordre.",
    ],
    sourceFr: "Bassin hydrique et historique de campagne — source officielle à homologuer.",
    status: "SEED_A_CALIBRER",
  },
  {
    code: "SC_TOURISME",
    labelFr: "Choc de demande touristique",
    appliesToFr: "Hôtellerie, restauration, transport touristique, artisanat d'exportation",
    shocksFr: [
      "Recul du taux d'occupation sur la haute saison.",
      "Effet de change sur les marchés émetteurs et concentration sur un tour-opérateur ou une plateforme.",
      "Maintien des charges fixes et du service de dette pendant la basse saison.",
    ],
    sourceFr: "Statistiques d'arrivées et d'occupation par région.",
    status: "SEED_A_CALIBRER",
  },
  {
    code: "SC_MARCHES_PUBLICS",
    labelFr: "Allongement des délais sur marchés publics",
    appliesToFr: "BTP, ingénierie, fournitures et services aux administrations",
    shocksFr: [
      "Allongement du délai entre service fait, certification et règlement.",
      "Retenues de garantie et pénalités appliquées.",
      "Financement du besoin en fonds de roulement par découvert au taux courant.",
    ],
    sourceFr: "Délais de paiement observés par donneur d'ordre.",
    status: "SEED_A_CALIBRER",
  },
  {
    code: "SC_IMPORT_CHANGE",
    labelFr: "Choc de change et d'énergie pour les activités importatrices",
    appliesToFr: "Industries importatrices d'intrants, distribution d'équipements",
    shocksFr: [
      "Dépréciation du dirham contre devise de facturation, nette des couvertures juridiquement efficaces.",
      "Hausse du coût de l'énergie et du fret.",
      "Capacité de répercussion sur les prix de vente, appréciée contractuellement.",
    ],
    sourceFr: "Exposition nette après couverture et clauses d'indexation.",
    status: "SEED_A_CALIBRER",
  },
  {
    code: "SC_TRANSITION_EXPORT",
    labelFr: "Contrainte carbone à l'export",
    appliesToFr: "Exportateurs vers marchés à réglementation carbone, activités énergo-intensives",
    shocksFr: [
      "Coût de conformité carbone et exigences de traçabilité imposées par les clients.",
      "Investissement d'adaptation non financé.",
      "Perte de référencement chez un donneur d'ordre exigeant.",
    ],
    sourceFr: "Intensité énergétique et exigences clients documentées.",
    status: "SEED_A_CALIBRER",
  },
];
