/**
 * Contrat de calibration : transformation d'un grade en probabilité de défaut.
 *
 * La calibration est une donnée VERSIONNÉE ET SÉPARÉE du modèle. Deux raisons :
 *
 *  - le barème (poids, bandes, caps) et la calibration (grade → PD) évoluent à
 *    des rythmes différents : on recalibre annuellement sans toucher au barème ;
 *  - une notation doit rester rejouable. Le résultat porte donc l'identifiant de
 *    la calibration appliquée, au même titre que la version de modèle et celle
 *    du moteur.
 *
 * `dataSource` n'est pas décoratif : il distingue une calibration établie sur
 * des défauts OBSERVÉS d'une calibration établie sur des données SIMULÉES. La
 * seconde ne vaut que comme validation de la chaîne de traitement — elle ne
 * doit jamais alimenter un calcul de provision ou d'exigence en fonds propres.
 */
export type CalibrationDataSource = "OBSERVED" | "SYNTHETIC";

export interface GradePd {
  grade: string;
  /** PD à 12 mois, en probabilité (0,0123 = 1,23 %). */
  pd: number;
  /** Effectif de l'échantillon de développement affecté à ce grade. */
  count: number;
  /** Taux de défaut observé dans l'échantillon de développement. */
  observedRate: number | null;
}

export interface CalibrationConfig {
  calibrationId: string;
  /**
   * Empreinte SHA-256 du contenu, horodatage exclu. Deux calibrations produites
   * par la même graine et les mêmes hypothèses portent la même empreinte : c'est
   * elle, et non la date de génération, qui atteste de l'identité.
   */
  contentHash: string;
  modelId: string;
  modelVersion: string;
  dataSource: CalibrationDataSource;
  createdAt: string;
  horizonMonths: number;
  methodFr: string;
  /** Graine du simulateur — nulle pour une calibration sur données observées. */
  seed: number | null;
  /** Plancher de PD appliqué, en probabilité. */
  floor: number;
  /** Marge de prudence appliquée, en relatif (0,10 = +10 %). */
  marginOfConservatism: number;
  /** Tendance centrale de long terme du taux de défaut du portefeuille. */
  centralTendency: number;
  /** Courbe logistique score → PD, avant affectation par grade. */
  curve: { intercept: number; slope: number };
  gradePd: GradePd[];
  /** PD des grades de défaut : 1 par définition. */
  defaultGradePd: number;
  sampleSize: number;
  /** Avertissement à afficher partout où la PD est restituée. */
  limitationsFr: string;
}

/**
 * PD à 12 mois d'un grade final. Renvoie null si le grade est inconnu de la
 * calibration — mieux vaut aucune PD qu'une PD inventée par défaut.
 */
export function pdForGrade(
  calibration: CalibrationConfig,
  grade: string | null,
  isDefaultGrade: boolean
): number | null {
  if (isDefaultGrade) return calibration.defaultGradePd;
  if (grade === null) return null;
  const band = calibration.gradePd.find((g) => g.grade === grade);
  return band ? band.pd : null;
}

/**
 * Contrôles d'intégrité d'une calibration. Une calibration non monotone ou
 * hors bornes ne doit jamais être chargée : elle produirait des PD qui
 * contredisent l'ordre des grades.
 */
export function validateCalibration(c: CalibrationConfig): string[] {
  const errors: string[] = [];
  if (!/^[0-9a-f]{64}$/.test(c.contentHash)) errors.push("empreinte de contenu absente ou malformée");
  if (c.gradePd.length === 0) errors.push("aucun grade calibré");
  for (const g of c.gradePd) {
    if (!(g.pd > 0 && g.pd < 1)) errors.push(`${g.grade} : PD hors ]0,1[ (${g.pd})`);
    if (g.pd < c.floor - 1e-12) errors.push(`${g.grade} : PD sous le plancher déclaré`);
  }
  for (let i = 1; i < c.gradePd.length; i += 1) {
    if (c.gradePd[i].pd < c.gradePd[i - 1].pd - 1e-12) {
      errors.push(
        `monotonie rompue entre ${c.gradePd[i - 1].grade} et ${c.gradePd[i].grade} : ${c.gradePd[i - 1].pd} puis ${c.gradePd[i].pd}`
      );
    }
  }
  if (c.defaultGradePd !== 1) errors.push("la PD d'un grade de défaut doit valoir 1");
  if (c.horizonMonths !== 12) errors.push("horizon attendu : 12 mois");
  return errors;
}
