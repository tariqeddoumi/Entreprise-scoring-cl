import type { ModelConfig } from "./types";

/**
 * Inventaire phénomène → règle (constat C08).
 *
 * Le diagnostic a montré qu'une même faiblesse pouvait agir jusqu'à quatre
 * fois : score élémentaire, domaine transparence, cap de confiance, cap
 * structurel et red flag. La conséquence n'est pas seulement une
 * surpénalisation : elle rend la calibration impossible, parce que l'effet
 * marginal de chaque règle n'est plus isolable.
 *
 * Ce registre est la source de vérité du traitement retenu pour chaque
 * phénomène. Il est CONTRÔLÉ AU CHARGEMENT du modèle : une exception non
 * compensatoire qui ne déclare pas le critère portant sa contribution centrale
 * fait échouer la validation. Ajouter un cap redevient donc un acte explicite,
 * qui oblige à dire pourquoi la contribution centrale ne suffit pas.
 */

export interface PhenomenonEntry {
  code: string;
  labelFr: string;
  /** Critère unique portant la contribution centrale du phénomène. */
  centralCriterion: string;
  /** Exception non compensatoire conservée, le cas échéant. */
  nonCompensatoryRule: string | null;
  /** Red flag conservé — il route un traitement, il ne score jamais. */
  redFlag: string | null;
  /** Règles retirées en V3, et pourquoi. */
  removedFr: string[];
  rationaleFr: string;
}

export const PHENOMENON_REGISTRY: PhenomenonEntry[] = [
  {
    code: "NEGATIVE_EQUITY",
    labelFr: "Fonds propres tangibles négatifs",
    centralCriterion: "D1.4",
    nonCompensatoryRule: null,
    redFlag: "RF09",
    removedFr: [
      "CAP02 (plafond G9) retiré : le cas spécial du critère D1.4 impose déjà un score nul, et RF09 impose une revue. Un troisième effet plafonnant n'ajoutait aucune information et rendait l'effet marginal des fonds propres négatifs impossible à mesurer.",
    ],
    rationaleFr:
      "Le score nul sur un critère de 4 à 5 % du total déplace déjà fortement la note. La recapitalisation éventuelle est une condition de décision, pas une composante du risque intrinsèque.",
  },
  {
    code: "DSCR_BELOW_1",
    labelFr: "Couverture du service de la dette inférieure à 1",
    centralCriterion: "D2.2",
    nonCompensatoryRule: "NC01",
    redFlag: null,
    removedFr: [
      "CAP07 (DSCR < 1 en stress seulement) retiré : le critère D2.5 mesure déjà la résistance au stress. Plafonner en plus revenait à compter deux fois le même scénario.",
    ],
    rationaleFr:
      "Une incapacité à couvrir le service de la dette en scénario de BASE est un fait non compensable par une bonne gouvernance ou un secteur porteur : l'exception est conservée à ce seul cas, et son effet incrémental devra être testé sur défauts observés.",
  },
  {
    code: "FORBEARANCE",
    labelFr: "Restructuration pour difficultés financières",
    centralCriterion: "D3.6",
    nonCompensatoryRule: null,
    redFlag: "RF08",
    removedFr: [
      "CAP09 (plafond G8) retiré : la restructuration relève de la définition du défaut et du staging IFRS 9, tous deux évalués par des moteurs séparés. Le rating conserve sa contribution centrale ; le reste appartient aux moteurs réglementaire et comptable.",
    ],
    rationaleFr:
      "Pénaliser quatre fois une forbearance — critère, cap, red flag et classification — produisait une note qui n'était plus interprétable.",
  },
  {
    code: "CLIENT_CONCENTRATION",
    labelFr: "Dépendance à un client unique",
    centralCriterion: "D4.3",
    nonCompensatoryRule: null,
    redFlag: "RF13",
    removedFr: [
      "CAP08 (plafond G8) retiré : le barème de D4.3 est déjà continu et sévère au-delà de 50 % du chiffre d'affaires ; RF13 route la perte avérée d'un client vital vers une revue immédiate.",
    ],
    rationaleFr:
      "Un score continu et un déclencheur dur au seul cas extrême suffisent. Le cap intermédiaire créait une falaise arbitraire.",
  },
  {
    code: "STALE_OR_INCOHERENT_ACCOUNTS",
    labelFr: "Comptes anciens ou incohérents",
    centralCriterion: "D6.2",
    nonCompensatoryRule: null,
    redFlag: "RF16",
    removedFr: [
      "CAP04 (aucun grade si comptes trop anciens) retiré en tant que cap : l'ancienneté de l'information relève désormais du moteur unique de qualité de données — couverture et classe de confiance. Sous le seuil de couverture, aucun grade n'est produit, ce qui traite le cas de façon homogène avec toutes les autres insuffisances d'information.",
      "Le cap de confiance G4/G7 est supprimé (constat H02) : il déplaçait 55 à 65 % des dossiers de deux grades et détruisait la granularité de l'échelle.",
    ],
    rationaleFr:
      "Une seule porte pour la qualité de l'information : la couverture et la classe de confiance. Le risque économique n'est pas contaminé par la qualité de sa mesure.",
  },
  {
    code: "KYC_SANCTIONS",
    labelFr: "Identité, bénéficiaire effectif et sanctions",
    centralCriterion: "D6.5",
    nonCompensatoryRule: null,
    redFlag: "RF01",
    removedFr: [
      "Le blocage total du scoring par un red flag de conformité est retiré (constat C06) : il empêchait de noter une exposition déjà au bilan, donc de la surveiller et de la provisionner. La conformité porte désormais son propre statut.",
    ],
    rationaleFr:
      "Un contrôle de conformité interdit une entrée en relation ou une opération ; il ne rend pas le risque de crédit d'un encours existant inconnaissable. Le critère D6.5 ne conserve que la transparence économique résiduelle.",
  },
  {
    code: "YOUNG_COMPANY",
    labelFr: "Entreprise de moins de deux ans",
    centralCriterion: "B3.2",
    nonCompensatoryRule: null,
    redFlag: null,
    removedFr: [
      "CAP01 (plafond G7) retiré : le diagnostic relevait qu'un cap tenait lieu de modèle de millésime. Les jeunes entreprises représentent 98,5 % des créations au Maroc ; les traiter par un plafond revient à refuser de les analyser. Elles sont désormais ROUTÉES hors des deux grilles publiées.",
    ],
    rationaleFr:
      "Une route dédiée rend le traitement visible et met la banque devant la décision de construire une grille jeune entreprise, au lieu de masquer le problème derrière un grade plafonné.",
  },
  {
    code: "GOING_CONCERN",
    labelFr: "Incertitude matérielle sur la continuité d'exploitation",
    centralCriterion: "D6.1",
    nonCompensatoryRule: "NC02",
    redFlag: "RF12",
    removedFr: [],
    rationaleFr:
      "Conservée : une réserve d'auditeur sur la continuité d'exploitation est un signal dont l'effet sur la probabilité de défaut est non linéaire et largement documenté dans la littérature. L'effet incrémental reste à mesurer sur données observées.",
  },
  {
    code: "EBITDA_NEGATIVE",
    labelFr: "Excédent brut d'exploitation négatif deux années sur trois",
    centralCriterion: "D1.2",
    nonCompensatoryRule: "NC03",
    redFlag: null,
    removedFr: [],
    rationaleFr:
      "Conservée : un modèle économique qui ne dégage pas d'excédent brut sur deux exercices sur trois ne se rattrape pas par les autres domaines. Les cas spéciaux de D1.5 et D1.8 traitent le calcul du ratio, non la persistance du phénomène.",
  },
  {
    code: "GROUP_FILE_INCOMPLETE",
    labelFr: "Dossier groupe incomplet alors que le groupe est matériel",
    centralCriterion: "D5.4",
    nonCompensatoryRule: "NC04",
    redFlag: null,
    removedFr: [],
    rationaleFr:
      "Conservée : l'absence d'information sur un groupe matériel empêche d'apprécier la contagion et les sorties de trésorerie. Contrairement aux autres insuffisances d'information, celle-ci porte sur un périmètre de consolidation, pas sur une variable isolée — la couverture ne la détecte pas.",
  },
];

const BY_RULE = new Map(
  PHENOMENON_REGISTRY.filter((p) => p.nonCompensatoryRule !== null).map((p) => [
    p.nonCompensatoryRule as string,
    p,
  ])
);

export function phenomenonForRule(ruleCode: string): PhenomenonEntry | undefined {
  return BY_RULE.get(ruleCode);
}

/**
 * Contrôle de cohérence entre un modèle et le registre.
 *
 * Renvoie les anomalies, sans lever : l'appelant décide s'il refuse le
 * chargement (validate-model) ou signale seulement (outils de revue).
 */
export function checkDoubleCounting(model: ModelConfig): string[] {
  const errors: string[] = [];
  const criterionCodes = new Set(model.criteria.map((c) => c.code));

  for (const rule of model.nonCompensatoryRules) {
    const entry = BY_RULE.get(rule.code);
    if (!entry) {
      errors.push(
        `${rule.code} : exception non compensatoire absente de l'inventaire phénomène-règle. Toute exception doit déclarer le phénomène qu'elle traite et le critère qui en porte la contribution centrale.`
      );
      continue;
    }
    if (rule.centralCriterion !== entry.centralCriterion) {
      errors.push(
        `${rule.code} : critère central déclaré « ${rule.centralCriterion} » alors que l'inventaire retient « ${entry.centralCriterion} ».`
      );
    }
    if (rule.incrementalRationaleFr.trim().length < 40) {
      errors.push(
        `${rule.code} : justification de l'effet incrémental absente ou trop succincte.`
      );
    }
    if (rule.centralCriterion !== null && !criterionCodes.has(rule.centralCriterion)) {
      // Les deux modèles ne partagent pas leurs codes de critères : une
      // exception dont le critère central n'existe pas dans CE modèle est une
      // erreur de configuration, pas une tolérance.
      errors.push(
        `${rule.code} : critère central ${rule.centralCriterion} absent du modèle ${model.modelId}.`
      );
    }
  }
  return errors;
}
