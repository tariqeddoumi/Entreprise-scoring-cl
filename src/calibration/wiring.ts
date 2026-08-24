/**
 * Câblage de simulation propre à chaque modèle.
 *
 * Le simulateur doit produire des dossiers COHÉRENTS AVEC EUX-MÊMES : un red
 * flag « retards de paiement au-delà du seuil de défaut » ne doit pas coexister
 * avec un critère de retards excellent, sinon on fabrique des incohérences que
 * le moteur signalerait à juste titre, et on calibrerait sur une population qui
 * n'existe pas.
 *
 * Or ce lien — quel critère mesure la chose que tel signal décrit — n'est pas
 * porté par la configuration du modèle : c'est une connaissance métier. Elle est
 * donc déclarée ici, explicitement et par modèle, plutôt que devinée. Une
 * personne du métier peut relire ce fichier et contester une ligne.
 */
import type { CriterionScore, Segment, StructuralFlagsInput } from "../core/types";

/** Cas spécial déclenché dans le bas de la distribution de qualité. */
export interface SpecialCaseWiring {
  criterion: string;
  code: string;
  /** Déclenché seulement si la qualité latente est sous ce seuil. */
  qBelow: number;
  probability: number;
  /** Flag structurel qui accompagne le cas spécial, le cas échéant. */
  flag?: keyof StructuralFlagsInput;
}

/** Signal dérivé du niveau atteint par un critère. */
export interface DerivedSignal {
  criterion: string;
  /**
   * Niveaux du critère qui déclenchent le signal — une LISTE et non un seuil,
   * parce que certains signaux sont mutuellement exclusifs par définition : un
   * retard de paiement ne peut pas être à la fois au-delà du seuil de défaut
   * (RF06) et compris entre 31 et 89 jours (RF07). Un seuil « au plus » les
   * ferait coexister et fabriquerait un dossier impossible.
   */
  whenLevelIn: CriterionScore[];
  probability: number;
}

export interface FlagWiring extends DerivedSignal {
  flag: keyof StructuralFlagsInput;
}

export interface RedFlagWiring extends Partial<DerivedSignal> {
  code: string;
  probability: number;
  /**
   * Adosse le signal à un flag structurel plutôt qu'au niveau d'un critère.
   * Nécessaire quand le signal décrit une situation que le barème ne distingue
   * pas : un score de 0 sur les fonds propres peut traduire des fonds propres
   * très faibles mais positifs, alors que RF09 vise des fonds propres NÉGATIFS.
   */
  whenFlag?: keyof StructuralFlagsInput;
}

export interface SimulationWiring {
  /** Répartition du portefeuille : un modèle mono-segment vaut 1 sur ce segment. */
  segmentMix: Partial<Record<Segment, number>>;
  specialCases: SpecialCaseWiring[];
  flags: FlagWiring[];
  redFlags: RedFlagWiring[];
  /** Signaux sans lien avec la qualité financière (conformité, fraude). */
  independentRedFlags: { code: string; probability: number }[];
  /** Ancienneté : loi log-normale, paramètres du logarithme. */
  age: { logMean: number; logSd: number };
  /** Probabilité qu'une incertitude sur la continuité soit déclarée, dans la queue basse. */
  goingConcern?: { qBelow: number; probability: number };
}

/**
 * Modèle standard entreprises — 45 critères, sept domaines, dix caps.
 */
export const WIRING_CORP_STD_V1: SimulationWiring = {
  segmentMix: { TPE: 0.55, PME: 0.35, GE: 0.1 },
  specialCases: [
    { criterion: "D1.4", code: "NEGATIVE_TANGIBLE_EQUITY", qBelow: -1.2, probability: 0.35, flag: "negativeTangibleEquity" },
    { criterion: "D1.5", code: "EBITDA_LTE_0", qBelow: -1.4, probability: 0.3, flag: "ebitdaNegativeTwoOfThreeYears" },
  ],
  flags: [
    // Le service de la dette : le flag découle de la mesure, pas d'un tirage parallèle.
    { criterion: "D2.2", whenLevelIn: [0], flag: "baseDscrBelow1", probability: 1 },
    { criterion: "D2.5", whenLevelIn: [0], flag: "stressDscrBelow1", probability: 1 },
    { criterion: "D3.6", whenLevelIn: [0], flag: "activeRestructuringForbearance", probability: 1 },
    { criterion: "D4.3", whenLevelIn: [0], flag: "singleClientDependencyUnmitigated", probability: 0.4 },
  ],
  redFlags: [
    { criterion: "D3.1", whenLevelIn: [0], code: "RF06", probability: 0.55 },
    { criterion: "D3.1", whenLevelIn: [25], code: "RF07", probability: 0.5 },
    { criterion: "D3.6", whenLevelIn: [0], code: "RF08", probability: 0.35 },
    { whenFlag: "negativeTangibleEquity", code: "RF09", probability: 0.5 },
  ],
  independentRedFlags: [{ code: "RF01", probability: 0.0015 }],
  age: { logMean: 2.1, logSd: 0.75 },
  goingConcern: { qBelow: -1.8, probability: 0.15 },
};

/**
 * Modèle TPE comportemental — 24 critères, la mesure porte sur les FLUX
 * BANCAIRES OBSERVÉS et non sur des états financiers.
 *
 * Trois différences structurantes par rapport au modèle standard :
 *
 *  - il n'y a ni fonds propres tangibles ni EBITDA dans la grille : les cas
 *    spéciaux et les caps qui en dépendent (CAP02, CAP05, CAP06, CAP07) n'y
 *    existent pas. Le modèle ne porte que cinq caps ;
 *  - l'ancienneté est un CRITÈRE noté (B3.2) en plus d'être un déclencheur de
 *    cap : une TPE jeune est doublement pénalisée, ce qui est voulu ;
 *  - quatre critères sont critiques sur vingt-quatre, contre trois sur
 *    quarante-cinq : le modèle bloque plus facilement, parce que sans flux
 *    bancaires exploitables il n'a rien d'autre à observer.
 */
export const WIRING_CORP_TPE_BEHAV_V1: SimulationWiring = {
  segmentMix: { TPE: 1 },
  specialCases: [
    // Impayé non régularisé et incapacité probable de payer : deux situations
    // distinctes, toutes deux constitutives d'un examen de défaut.
    { criterion: "B1.1", code: "UNPAID_NOT_CURED", qBelow: -1.3, probability: 0.3 },
    { criterion: "B1.1", code: "UNLIKELY_TO_PAY", qBelow: -1.9, probability: 0.25 },
    // Effondrement des encaissements : le signal le plus précoce sur une TPE.
    { criterion: "B2.2", code: "FLOWS_DOWN_OVER_30PCT", qBelow: -1.5, probability: 0.3 },
    { criterion: "B2.2", code: "FLOWS_DOWN_OVER_15PCT", qBelow: -0.7, probability: 0.2 },
    // Incohérence majeure entre flux, chiffre d'affaires déclaré et liasse.
    { criterion: "B5.2", code: "MAJOR_INCONSISTENCY", qBelow: -1.6, probability: 0.25 },
  ],
  flags: [
    // B3.2 note l'ancienneté et la continuité : son niveau le plus bas traduit
    // une entreprise très jeune sans support, ce que CAP01 plafonne.
    { criterion: "B1.5", whenLevelIn: [0], flag: "activeRestructuringForbearance", probability: 0.5 },
    { criterion: "B6.1", whenLevelIn: [0], flag: "materialGroupFileIncomplete", probability: 0.45 },
  ],
  redFlags: [
    { criterion: "B1.1", whenLevelIn: [0], code: "RF06", probability: 0.55 },
    { criterion: "B1.1", whenLevelIn: [25], code: "RF07", probability: 0.5 },
    { criterion: "B1.5", whenLevelIn: [0], code: "RF08", probability: 0.3 },
    { criterion: "B5.3", whenLevelIn: [0], code: "RF11", probability: 0.4 },
    { criterion: "B5.2", whenLevelIn: [0], code: "RF16", probability: 0.4 },
  ],
  independentRedFlags: [
    { code: "RF01", probability: 0.002 },
    { code: "RF03", probability: 0.001 },
  ],
  // Les TPE bancarisées sont plus jeunes que les PME et GE : médiane ≈ 6 ans.
  age: { logMean: 1.8, logSd: 0.8 },
  goingConcern: { qBelow: -1.9, probability: 0.12 },
};

export const WIRING_BY_MODEL: Record<string, SimulationWiring> = {
  CORP_STD_V1: WIRING_CORP_STD_V1,
  CORP_TPE_BEHAV_V1: WIRING_CORP_TPE_BEHAV_V1,
};

export function wiringFor(modelId: string): SimulationWiring {
  const w = WIRING_BY_MODEL[modelId];
  if (!w) {
    throw new Error(
      `Aucun câblage de simulation déclaré pour ${modelId}. Le simulateur refuse de deviner : il produirait des dossiers incohérents avec eux-mêmes.`
    );
  }
  return w;
}
