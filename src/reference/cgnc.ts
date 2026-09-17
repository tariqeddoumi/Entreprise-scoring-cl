/**
 * Dictionnaire comptable CGNC et règles de retraitement (constat H06).
 *
 * Le diagnostic relevait que les grilles importaient des libellés de
 * référentiels étrangers — EBITDA, current ratio, dette nette — sans les relier
 * au Code Général de Normalisation Comptable marocain ni aux pratiques de
 * financement réellement observées chez les TPE et PME marocaines. Deux
 * analystes pouvaient donc calculer deux ratios différents sur le même bilan.
 *
 * Ce module fixe une définition unique par grandeur. Il est consommé par les
 * critères (champ `cgncEntry`) et restitué à l'analyste dans le formulaire :
 * la définition est visible au moment de la saisie, pas enfouie dans une note.
 *
 * STATUT — proposition à valider conjointement Finance et Risques. Les
 * conventions marquées « à arbitrer » attendent une décision formelle.
 */

export interface CgncEntry {
  key: string;
  labelFr: string;
  /** Formule de référence, exprimée sur les postes CGNC. */
  formulaFr: string;
  /** Postes inclus, exclus et retraitements obligatoires. */
  includesFr: string[];
  excludesFr: string[];
  /** Contrôle de cohérence à exécuter avant d'accepter la valeur. */
  reconciliationFr: string;
  status: "PROPOSITION_A_VALIDER" | "VALIDE";
}

export const CGNC_DICTIONARY_VERSION = "CGNC-2026.1";

export const CGNC_ENTRIES: CgncEntry[] = [
  {
    key: "EBE_EBITDA",
    labelFr: "Excédent brut d'exploitation retraité (équivalent EBITDA)",
    formulaFr:
      "EBE CGNC = Production de l'exercice + Marge brute sur ventes en l'état − Consommations de l'exercice − Charges de personnel − Impôts et taxes (hors IS). Retraitements : + redevances de crédit-bail réintégrées, − éléments non récurrents, ± transactions avec parties liées ramenées aux conditions de marché.",
    includesFr: [
      "Redevances de crédit-bail réintégrées en dotation et charge financière (sinon l'EBE est artificiellement bas et le levier faussement élevé).",
      "Charges de personnel du dirigeant ramenées à une rémunération normative lorsque l'écart est matériel et documenté.",
    ],
    excludesFr: [
      "Produits et charges non courants (comptes 65/75) : plus-values de cession, indemnités, subventions d'équilibre.",
      "Reprises de provisions sans flux de trésorerie associé.",
      "Refacturations intra-groupe non assorties d'une contrepartie économique démontrée.",
    ],
    reconciliationFr:
      "Rapprocher EBE retraité et capacité d'autofinancement : un écart durable non expliqué signale un retraitement erroné ou une qualité de résultat dégradée.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "COMPTES_COURANTS_ASSOCIES",
    labelFr: "Comptes courants d'associés — trois catégories",
    formulaFr:
      "Classer chaque solde en : (1) remboursable à vue ; (2) bloqué mais non subordonné ; (3) contractuellement subordonné et bloqué. Seule la catégorie 3 est assimilée aux quasi-fonds propres.",
    includesFr: [
      "Catégorie 3 — convention écrite de blocage et de subordination, durée résiduelle supérieure à l'horizon de notation, absence de retraits sur les trois derniers exercices : assimilée aux fonds propres pour D1.4 et retirée de la dette pour D1.5.",
      "Catégorie 2 — blocage sans subordination : maintenue en dette, mais son échéance n'est pas comptée dans le service de dette exigible à 12 mois.",
      "Catégorie 1 — remboursable à vue : dette financière à part entière, comptée dans le service de dette.",
    ],
    excludesFr: [
      "Toute assimilation aux fonds propres sans convention écrite produite, quelle que soit l'ancienneté du solde.",
    ],
    reconciliationFr:
      "Vérifier l'historique des mouvements du compte sur trois exercices : des retraits réguliers contredisent une convention de blocage, quel que soit son libellé. Ce poste représente 44,5 % du financement des micro-entreprises et 30,7 % de celui des TPE au Maroc : son classement détermine à lui seul le levier et la solvabilité affichés.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "DETTE_FINANCIERE_ECONOMIQUE",
    labelFr: "Dette financière nette économique",
    formulaFr:
      "Dettes de financement + crédits de trésorerie + encours de crédit-bail actualisé + affacturage AVEC recours + financements participatifs selon leur substance + comptes courants d'associés catégorie 1 − trésorerie libre disponible.",
    includesFr: [
      "Crédit-bail : encours actualisé au taux implicite, ou à défaut somme des loyers résiduels hors charges.",
      "Affacturage avec recours : la créance cédée reste un financement ; sans recours, elle sort du bilan mais la concentration client reste à apprécier.",
      "Financements participatifs (mourabaha, ijara) : retenus selon leur substance économique de financement, indépendamment de leur qualification juridique.",
      "Dette système issue de la Centrale des Risques lorsqu'elle excède la dette comptabilisée — l'écart est lui-même un signal.",
    ],
    excludesFr: [
      "Trésorerie nantie, bloquée ou affectée à une garantie : elle ne réduit pas la dette nette.",
      "Dettes fournisseurs d'exploitation, traitées en BFR.",
    ],
    reconciliationFr:
      "Rapprocher la dette comptable, l'échéancier bancaire interne et la dette système. Tout écart supérieur au seuil de matérialité est instruit avant notation.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "SERVICE_DETTE",
    labelFr: "Service de la dette exigible à 12 mois",
    formulaFr:
      "Intérêts cash + amortissement contractuel du principal + loyers de crédit-bail + remboursements de comptes courants catégorie 1 exigibles + échéances in fine tombant dans les 12 mois.",
    includesFr: [
      "Échéances ballon et in fine : comptées intégralement dans l'année de tombée, sans lissage.",
      "Lignes revolving : convention de conversion documentée et appliquée uniformément.",
    ],
    excludesFr: [
      "Remboursements volontaires anticipés non contractuels.",
    ],
    reconciliationFr:
      "L'échéancier complet doit être produit. Un DSCR calculé sur un service de dette partiel est la première cause de surestimation de la capacité de remboursement.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "CREANCES_PUBLIQUES_TVA",
    labelFr: "Créances sur l'État, marchés publics et crédit de TVA",
    formulaFr:
      "Isoler les créances publiques et le crédit de TVA du reste du poste clients, avec leur ancienneté et le délai de règlement observé.",
    includesFr: [
      "Application d'une décote de liquidité fonction de l'ancienneté et du délai historiquement observé sur le donneur d'ordre.",
      "Traitement séparé dans le calcul de liquidité court terme : une créance certaine n'est pas un encaissement disponible.",
    ],
    excludesFr: [
      "Comptabilisation de ces créances en actif liquide immédiat sans décote.",
    ],
    reconciliationFr:
      "Confronter la balance âgée, les certificats de service fait et les délais de paiement observés sur les 24 derniers mois.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "FONDS_PROPRES_TANGIBLES",
    labelFr: "Fonds propres tangibles",
    formulaFr:
      "Capitaux propres CGNC + comptes courants d'associés catégorie 3 − immobilisations en non-valeurs − immobilisations incorporelles non cessibles − écarts de réévaluation non liquides − créances sur associés.",
    includesFr: [
      "Subventions d'investissement nettes d'impôt différé, lorsqu'elles sont acquises.",
    ],
    excludesFr: [
      "Frais préliminaires et charges à répartir (immobilisations en non-valeurs).",
      "Réévaluations libres d'actifs non cessibles.",
      "Créances sur associés et dirigeants, qui constituent une sortie de ressources, non un fonds propre.",
    ],
    reconciliationFr:
      "Recalculer le ratio avant et après retraitement : l'écart mesure la part de fonds propres purement comptables.",
    status: "PROPOSITION_A_VALIDER",
  },
  {
    key: "FLUX_BANCAIRES_NETTOYES",
    labelFr: "Mouvements créditeurs nettoyés et taux de capture bancaire",
    formulaFr:
      "Mouvements créditeurs bruts − décaissements de prêts − virements intra-groupe et circulaires − annulations du jour − apports en compte d'associés − produit d'affacturage − transferts entre banques du même titulaire. Taux de capture = flux nettoyés annualisés / chiffre d'affaires réconcilié (comptable et fiscal).",
    includesFr: [
      "Le taux de capture alimente la FIABILITÉ de l'estimation, pas le score de risque : une faible domiciliation n'est pas une faible activité (constat H07).",
    ],
    excludesFr: [
      "Tout usage du ratio de domiciliation comme mesure directe de part de portefeuille dans le score de risque.",
    ],
    reconciliationFr:
      "Rapprocher flux nettoyés, chiffre d'affaires comptable, chiffre d'affaires déclaré à la DGI et facturation. Un écart inexpliqué supérieur au seuil déclenche une instruction, pas une pénalité automatique.",
    status: "PROPOSITION_A_VALIDER",
  },
];

const BY_KEY = new Map(CGNC_ENTRIES.map((e) => [e.key, e]));

export function cgncEntry(key: string): CgncEntry | undefined {
  return BY_KEY.get(key);
}

/** Clés déclarées par un modèle mais absentes du dictionnaire : anomalie de configuration. */
export function unknownCgncKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => !BY_KEY.has(k));
}
