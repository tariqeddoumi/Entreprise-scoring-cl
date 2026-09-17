import type { RatingInput, Segment } from "@/core/types";

/**
 * Référentiel de segmentation — effectif-daté et versionné (constat C04).
 *
 * Le diagnostic reprochait trois choses au dispositif V2 : des seuils sans
 * source ni date d'effet, une confusion entre segmentations de finalités
 * différentes, et un routage de modèle que l'appelant pouvait choisir. Les
 * trois sont traitées ici.
 *
 * SIX AXES DISTINCTS — ne jamais en dériver un d'un autre :
 *
 *  1. Taille économique (OMTPME / NMA 2010) — analyse et benchmark ;
 *  2. Segment commercial — organisation du réseau et délégations ;
 *  3. Catégorie prudentielle PME — approche standard BAM et reporting ;
 *  4. Portefeuille IFRS 9 — homogénéité de risque pour l'ECL ;
 *  5. Segment modèle — choix de la grille (le seul objet de ce module) ;
 *  6. Groupe économique — contagion, concentration, support.
 *
 * Ce module ne produit que l'axe 5. Les autres appartiennent à leurs moteurs
 * respectifs et ne doivent pas être inférés d'un seuil de chiffre d'affaires
 * fixé ici.
 */

export interface SegmentationRuleset {
  rulesetId: string;
  /** Date d'effet métier. Un rejeu historique doit retrouver le jeu applicable à sa date. */
  effectiveFrom: string;
  effectiveTo: string | null;
  /**
   * Statut de la source. UNCONFIRMED_SEED tant que la lecture du corpus BAM
   * applicable n'a pas été validée conjointement Risques–Conformité–Juridique.
   * Aucun seuil de ce module n'est opposable en l'état.
   */
  sourceStatus: "UNCONFIRMED_SEED" | "CONFIRMED";
  sourceFr: string;
  currency: string;
  /** Seuil CA HT (MAD) au-delà duquel la contrepartie relève du segment GE. */
  geTurnoverThreshold: number;
  /** Seuil CA HT (MAD) séparant TPE et PME. */
  smeTurnoverThreshold: number;
  /** Exposition globale banque/groupe (MAD) faisant basculer une TPE en PME. */
  smeExposureThreshold: number;
  /** Le CA du groupe prime sur celui de l'entité lorsqu'il est disponible. */
  groupTurnoverPrevails: boolean;
}

/**
 * Jeux de règles connus, du plus ancien au plus récent.
 *
 * Un seul est actif à une date donnée. L'ajout d'un jeu ne réécrit jamais le
 * précédent : c'est la condition du rejeu d'une notation historique avec la
 * règle qui était alors en vigueur.
 */
export const SEGMENTATION_RULESETS: SegmentationRuleset[] = [
  {
    rulesetId: "SEG-2026.1",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceStatus: "UNCONFIRMED_SEED",
    sourceFr:
      "Seed expert inspiré des pratiques de place et des catégories OMTPME. Seuils, définition du chiffre d'affaires retenu et traitement du groupe À CONFIRMER sur le corpus Bank Al-Maghrib applicable, avec date d'effet et dispositions transitoires, avant tout usage opposable.",
    currency: "MAD",
    geTurnoverThreshold: 175_000_000,
    smeTurnoverThreshold: 10_000_000,
    smeExposureThreshold: 2_000_000,
    groupTurnoverPrevails: true,
  },
];

export function rulesetById(rulesetId: string): SegmentationRuleset {
  const found = SEGMENTATION_RULESETS.find((r) => r.rulesetId === rulesetId);
  if (!found) throw new Error(`Jeu de règles de segmentation inconnu : ${rulesetId}`);
  return found;
}

/** Jeu de règles applicable à une date d'arrêté donnée. */
export function rulesetForDate(asOfDate: string): SegmentationRuleset {
  const found = SEGMENTATION_RULESETS.find(
    (r) => asOfDate >= r.effectiveFrom && (r.effectiveTo === null || asOfDate < r.effectiveTo)
  );
  if (!found) {
    throw new Error(`Aucun jeu de règles de segmentation en vigueur au ${asOfDate}`);
  }
  return found;
}

export interface SegmentationResult {
  segment: Segment | null;
  source: "PROVIDED" | "COMPUTED" | "UNDETERMINED";
  rulesetId: string;
  explanationFr: string;
}

/**
 * Détermine le segment modèle.
 *
 * Le segment fourni par l'appelant reste accepté — il provient du référentiel
 * amont de la banque — mais il est confronté au calcul lorsque les données le
 * permettent : une divergence est signalée plutôt que silencieusement acceptée.
 * Sans cela, le choix du segment revient à choisir ses pondérations.
 */
export function determineSegment(
  input: RatingInput,
  ruleset: SegmentationRuleset
): SegmentationResult {
  const computed = computeSegment(input, ruleset);

  if (input.segment) {
    const divergence =
      computed.segment !== null && computed.segment !== input.segment
        ? ` Divergence avec le calcul (${computed.segment}) : à instruire, le référentiel amont fait foi mais l'écart est tracé.`
        : "";
    return {
      segment: input.segment,
      source: "PROVIDED",
      rulesetId: ruleset.rulesetId,
      explanationFr: `Segment ${input.segment} fourni par le référentiel amont (jeu ${ruleset.rulesetId}).${divergence}`,
    };
  }
  return computed;
}

function computeSegment(
  input: RatingInput,
  rule: SegmentationRuleset
): SegmentationResult {
  const data = input.segmentationData;
  const turnover =
    rule.groupTurnoverPrevails && data?.groupAnnualTurnover !== undefined
      ? Math.max(data.groupAnnualTurnover, data.annualTurnover ?? 0)
      : data?.annualTurnover;

  if (turnover === undefined || turnover === null || !Number.isFinite(turnover) || turnover < 0) {
    return {
      segment: null,
      source: "UNDETERMINED",
      rulesetId: rule.rulesetId,
      explanationFr:
        "Segment indéterminable : chiffre d'affaires entreprise/groupe absent ou invalide. Aucun segment par défaut n'est appliqué — le segment détermine les pondérations et les barèmes.",
    };
  }

  if (turnover > rule.geTurnoverThreshold) {
    return {
      segment: "GE",
      source: "COMPUTED",
      rulesetId: rule.rulesetId,
      explanationFr: `GE : CA HT ${fmtMad(turnover)} > ${fmtMad(rule.geTurnoverThreshold)} (jeu ${rule.rulesetId}, source ${rule.sourceStatus}).`,
    };
  }

  if (turnover > rule.smeTurnoverThreshold) {
    return {
      segment: "PME",
      source: "COMPUTED",
      rulesetId: rule.rulesetId,
      explanationFr: `PME : CA HT ${fmtMad(turnover)} compris entre ${fmtMad(rule.smeTurnoverThreshold)} et ${fmtMad(rule.geTurnoverThreshold)} (jeu ${rule.rulesetId}).`,
    };
  }

  const exposure = data?.globalBankExposure;
  if (exposure === undefined || exposure === null || !Number.isFinite(exposure) || exposure < 0) {
    return {
      segment: null,
      source: "UNDETERMINED",
      rulesetId: rule.rulesetId,
      explanationFr:
        "Segment indéterminable : CA sous le seuil TPE/PME mais exposition globale banque/groupe absente.",
    };
  }

  if (exposure > rule.smeExposureThreshold) {
    return {
      segment: "PME",
      source: "COMPUTED",
      rulesetId: rule.rulesetId,
      explanationFr: `PME : CA HT ${fmtMad(turnover)} ≤ ${fmtMad(rule.smeTurnoverThreshold)} mais exposition globale ${fmtMad(exposure)} > ${fmtMad(rule.smeExposureThreshold)} (jeu ${rule.rulesetId}).`,
    };
  }

  return {
    segment: "TPE",
    source: "COMPUTED",
    rulesetId: rule.rulesetId,
    explanationFr: `TPE : CA HT ${fmtMad(turnover)} ≤ ${fmtMad(rule.smeTurnoverThreshold)} et exposition globale ${fmtMad(exposure)} ≤ ${fmtMad(rule.smeExposureThreshold)} (jeu ${rule.rulesetId}).`,
  };
}

/**
 * Routage de modèle déterministe (C04).
 *
 * Le modèle applicable découle du segment et de la disponibilité des données,
 * jamais d'un choix de l'utilisateur : sans cette règle, un dossier refusé par
 * une grille peut être représenté à l'autre jusqu'à obtenir le grade souhaité.
 */
export interface RoutingInput {
  segment: Segment;
  /** Comptes annuels exploitables disponibles (au moins deux exercices). */
  reliableFinancialStatements: boolean;
  /** Mois d'historique de compte exploitable. */
  behavioralHistoryMonths: number;
}

export interface RoutingDecision {
  modelId: string | null;
  explanationFr: string;
}

export const BEHAVIORAL_MIN_HISTORY_MONTHS = 12;

export function routeModel(input: RoutingInput): RoutingDecision {
  if (input.segment !== "TPE") {
    return {
      modelId: "CORP_STD_V1",
      explanationFr: `Segment ${input.segment} : modèle standard obligatoire. Le modèle comportemental n'est publié que pour la TPE.`,
    };
  }
  if (input.reliableFinancialStatements) {
    return {
      modelId: "CORP_STD_V1",
      explanationFr:
        "TPE disposant d'états financiers exploitables : modèle standard. Le modèle comportemental est réservé aux TPE dont les comptes ne sont pas suffisamment fiables.",
    };
  }
  if (input.behavioralHistoryMonths >= BEHAVIORAL_MIN_HISTORY_MONTHS) {
    return {
      modelId: "CORP_TPE_BEHAV_V1",
      explanationFr: `TPE sans comptes exploitables mais ${input.behavioralHistoryMonths} mois d'historique de compte : modèle comportemental.`,
    };
  }
  return {
    modelId: null,
    explanationFr: `Aucun modèle publié applicable : ni comptes exploitables, ni ${BEHAVIORAL_MIN_HISTORY_MONTHS} mois d'historique comportemental. Dossier à router vers le traitement jeune entreprise / analyse à dire d'expert.`,
  };
}

function fmtMad(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR")} MMAD`;
  return `${v.toLocaleString("fr-FR")} MAD`;
}
