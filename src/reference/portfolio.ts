/**
 * Surveillance du portefeuille : indicateurs de risque (KRI) et de processus
 * (KPI), matrice de migration, concentration, alertes.
 *
 * Calculs purs, sans base : l'écran et l'export lisent les notations qui font
 * foi (validées), les décisions de comité et les dossiers, puis appellent ces
 * fonctions. Les définitions suivent les pratiques usuelles de reporting de
 * risque de crédit (comité des risques, Bâle « Principles for effective risk
 * data aggregation and risk reporting », BCBS 239) :
 *
 *  - une note est connue à la date où elle FAIT FOI (validation), pas à sa date
 *    d'arrêté : une photographie au 31 mars ne montre pas une note validée en
 *    avril sur un bilan de décembre ;
 *  - la matrice de migration est une approche par cohorte : les clients notés
 *    au début ET à la fin de la période, ligne = note de départ ; les sorties
 *    (plus de note) et les entrées (pas de note au départ) sont comptées à part,
 *    pour ne pas biaiser les taux ;
 *  - les parts « risque élevé », « défaut » et « watch list » se lisent en
 *    exposition, la note moyenne est pondérée par l'exposition (performants
 *    seulement : le défaut n'est pas une note de 11).
 *
 * Les seuils d'alerte (vert / orange / rouge) sont paramétrables ; les valeurs
 * par défaut sont des propositions à arrêter en COPIL.
 */

export type KriDirection = "UP_IS_WORSE" | "DOWN_IS_WORSE";
export type KriFamily = "RISQUE" | "PROCESSUS";
export type KriUnit = "PCT" | "GRADE" | "DAYS" | "COUNT";
export type RagStatus = "VERT" | "ORANGE" | "ROUGE" | "NA";

export interface KriDef {
  code: string;
  family: KriFamily;
  labelFr: string;
  definitionFr: string;
  unit: KriUnit;
  direction: KriDirection;
  /** Seuils par défaut (orange, rouge), dans l'unité affichée (% : 0 à 100). */
  amber: number;
  red: number;
  frequencyFr: string;
  ownerFr: string;
}

export const KRI_CATALOG: KriDef[] = [
  {
    code: "NOTE_MOYENNE",
    family: "RISQUE",
    labelFr: "Note moyenne pondérée",
    definitionFr: "Moyenne des notes des clients performants (hors défaut), pondérée par l'exposition.",
    unit: "GRADE",
    direction: "UP_IS_WORSE",
    amber: 6,
    red: 7,
    frequencyFr: "Mensuelle",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "PART_RISQUE_ELEVE",
    family: "RISQUE",
    labelFr: "Exposition en risque élevé",
    definitionFr: "Part de l'exposition notée dans les classes de risque élevé (8 à 10 par défaut), défaut exclu.",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 15,
    red: 25,
    frequencyFr: "Mensuelle",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "PART_DEFAUT",
    family: "RISQUE",
    labelFr: "Exposition en défaut",
    definitionFr: "Part de l'exposition notée en défaut (DEF1 à DEF3).",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 3,
    red: 5,
    frequencyFr: "Mensuelle",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "PART_WATCHLIST",
    family: "RISQUE",
    labelFr: "Exposition en watch list",
    definitionFr: "Part de l'exposition notée portée par des clients inscrits en watch list à la date.",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 5,
    red: 10,
    frequencyFr: "Mensuelle",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "TAUX_DEGRADATION",
    family: "RISQUE",
    labelFr: "Taux de dégradation",
    definitionFr: "Part des clients notés au début et à la fin de la période dont la note s'est dégradée d'au moins un cran (défaut compris).",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 15,
    red: 25,
    frequencyFr: "Trimestrielle (horizon glissant)",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "SOLDE_MIGRATION",
    family: "RISQUE",
    labelFr: "Solde des migrations",
    definitionFr: "Taux de dégradation moins taux d'amélioration sur la cohorte : positif, le portefeuille se dégrade.",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 5,
    red: 10,
    frequencyFr: "Trimestrielle (horizon glissant)",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "CONCENTRATION_TOP10",
    family: "RISQUE",
    labelFr: "Concentration des 10 premiers",
    definitionFr: "Part de l'exposition notée portée par les dix premiers clients.",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 30,
    red: 40,
    frequencyFr: "Mensuelle",
    ownerFr: "Surveillance des risques",
  },
  {
    code: "COUVERTURE",
    family: "PROCESSUS",
    labelFr: "Couverture de la notation",
    definitionFr: "Part des clients actifs dotés d'une note en cours de validité.",
    unit: "PCT",
    direction: "DOWN_IS_WORSE",
    amber: 95,
    red: 90,
    frequencyFr: "Mensuelle",
    ownerFr: "Contre-étude / réseau",
  },
  {
    code: "NOTES_EXPIREES",
    family: "PROCESSUS",
    labelFr: "Notes expirées",
    definitionFr: "Part des clients notés dont la dernière note a dépassé la durée de validité (paramétrage).",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 5,
    red: 10,
    frequencyFr: "Mensuelle",
    ownerFr: "Réseau (chargés d'affaires)",
  },
  {
    code: "TAUX_DEROGATION",
    family: "PROCESSUS",
    labelFr: "Taux de dérogation",
    definitionFr: "Part des notes validées sur la période dont la note finale diffère de la note du modèle.",
    unit: "PCT",
    direction: "UP_IS_WORSE",
    amber: 10,
    red: 20,
    frequencyFr: "Trimestrielle",
    ownerFr: "Validation des modèles",
  },
  {
    code: "DELAI_INSTRUCTION",
    family: "PROCESSUS",
    labelFr: "Délai d'instruction (médiane)",
    definitionFr: "Médiane, en jours calendaires, entre la soumission d'un dossier et sa décision finale sur la période.",
    unit: "DAYS",
    direction: "UP_IS_WORSE",
    amber: 15,
    red: 30,
    frequencyFr: "Mensuelle",
    ownerFr: "Contre-étude",
  },
  {
    code: "WL_EN_RETARD",
    family: "PROCESSUS",
    labelFr: "Watch list : revues ou renotations en retard",
    definitionFr: "Clients inscrits en watch list dont la revue périodique ou la renotation imposée par le niveau a dépassé son délai.",
    unit: "COUNT",
    direction: "UP_IS_WORSE",
    amber: 1,
    red: 5,
    frequencyFr: "Hebdomadaire",
    ownerFr: "Surveillance des risques",
  },
];

export const SURVEILLANCE_KEY = "SURVEILLANCE_SETTINGS";

export interface SurveillanceSettings {
  /** Première classe de risque élevé (1 à 10). */
  highRiskFrom: number;
  /** Horizon de migration par défaut (mois). */
  horizonMonths: number;
  /** Dégradation forte : nombre de crans. */
  strongDowngradeNotches: number;
  /** Seuils par indicateur (unité affichée). */
  thresholds: Record<string, { amber: number; red: number }>;
}

export const DEFAULT_SURVEILLANCE: SurveillanceSettings = {
  highRiskFrom: 8,
  horizonMonths: 12,
  strongDowngradeNotches: 2,
  thresholds: Object.fromEntries(KRI_CATALOG.map((k) => [k.code, { amber: k.amber, red: k.red }])),
};

export function parseSurveillance(raw: string | null | undefined): SurveillanceSettings {
  if (!raw) return DEFAULT_SURVEILLANCE;
  try {
    const v = JSON.parse(raw) as Partial<SurveillanceSettings>;
    const merged: SurveillanceSettings = {
      highRiskFrom: Number(v.highRiskFrom ?? DEFAULT_SURVEILLANCE.highRiskFrom),
      horizonMonths: Number(v.horizonMonths ?? DEFAULT_SURVEILLANCE.horizonMonths),
      strongDowngradeNotches: Number(v.strongDowngradeNotches ?? DEFAULT_SURVEILLANCE.strongDowngradeNotches),
      thresholds: { ...DEFAULT_SURVEILLANCE.thresholds, ...(v.thresholds ?? {}) },
    };
    return checkSurveillance(merged).length ? DEFAULT_SURVEILLANCE : merged;
  } catch {
    return DEFAULT_SURVEILLANCE;
  }
}

export function checkSurveillance(s: SurveillanceSettings): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(s.highRiskFrom) || s.highRiskFrom < 2 || s.highRiskFrom > 10) issues.push("La première classe de risque élevé est comprise entre 2 et 10.");
  if (![3, 6, 12, 24].includes(s.horizonMonths)) issues.push("L'horizon de migration vaut 3, 6, 12 ou 24 mois.");
  if (!Number.isInteger(s.strongDowngradeNotches) || s.strongDowngradeNotches < 1 || s.strongDowngradeNotches > 5) issues.push("Une dégradation forte compte de 1 à 5 crans.");
  for (const k of KRI_CATALOG) {
    const t = s.thresholds[k.code];
    if (!t || !Number.isFinite(t.amber) || !Number.isFinite(t.red) || t.amber < 0 || t.red < 0) {
      issues.push(`${k.labelFr} : seuils orange et rouge requis (nombres positifs).`);
      continue;
    }
    if (k.unit === "PCT" && (t.amber > 100 || t.red > 100)) issues.push(`${k.labelFr} : un pourcentage ne dépasse pas 100.`);
    if (k.direction === "UP_IS_WORSE" && t.red < t.amber) issues.push(`${k.labelFr} : le seuil rouge est au moins égal au seuil orange.`);
    if (k.direction === "DOWN_IS_WORSE" && t.red > t.amber) issues.push(`${k.labelFr} : le seuil rouge est au plus égal au seuil orange (plus bas = pire).`);
  }
  return issues;
}

export function ragOf(def: KriDef, value: number | null, thresholds?: { amber: number; red: number }): RagStatus {
  if (value === null || !Number.isFinite(value)) return "NA";
  const t = thresholds ?? { amber: def.amber, red: def.red };
  if (def.direction === "UP_IS_WORSE") return value >= t.red ? "ROUGE" : value >= t.amber ? "ORANGE" : "VERT";
  return value <= t.red ? "ROUGE" : value <= t.amber ? "ORANGE" : "VERT";
}

// --- Données d'entrée --------------------------------------------------------

/** Une note qui fait foi. */
export interface RatingObs {
  counterpartyId: string;
  name: string;
  entityId: string;
  segment: string | null;
  sectorCode: string | null;
  /** Date d'arrêté (AAAA-MM-JJ). */
  asOfDate: string;
  /** Date à laquelle la note fait foi : validation (AAAA-MM-JJ). */
  effectiveDate: string;
  /** Note finale. */
  grade: string;
  /** Note du modèle avant dérogation (exceptions comprises). */
  modelGrade: string | null;
  /** Exposition dans la devise de base ; inconnue : null (comptée 0 dans les parts en exposition). */
  exposure: number | null;
}

export interface WatchlistEvent {
  counterpartyId: string;
  kind: "WL_ENTREE" | "WL_SORTIE";
  effectiveDate: string;
  level: string | null;
}

export interface PopulationMember {
  counterpartyId: string;
  name: string;
  entityId: string;
  segment: string | null;
  sectorCode: string | null;
  /** Date de création du client (AAAA-MM-JJ). */
  since: string;
}

export interface CaseTiming {
  submittedAt: string | null;
  decidedAt: string | null;
  status: string;
}

/** Échelle : classes performantes de la meilleure à la moins bonne, puis grades de défaut. */
export interface ScaleInfo {
  performing: string[];
  defaults: string[];
}

export const DEFAULT_SCALE_INFO: ScaleInfo = {
  performing: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  defaults: ["DEF1", "DEF2", "DEF3"],
};

/** Rang : 1 = meilleur ; défaut = nombre de classes + 1 ; inconnu : null. */
export function rankOf(scale: ScaleInfo, grade: string | null | undefined): number | null {
  if (!grade) return null;
  const i = scale.performing.indexOf(grade);
  if (i >= 0) return i + 1;
  if (scale.defaults.includes(grade)) return scale.performing.length + 1;
  return null;
}

export const isDefault = (scale: ScaleInfo, grade: string) => scale.defaults.includes(grade);

// --- Dates --------------------------------------------------------------------

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Fins de mois des `count` derniers mois, la dernière étant `end` (incluse, ramenée à sa fin de mois sauf si c'est le mois en cours). */
export function monthEnds(end: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = monthEnd(addMonths(end.slice(0, 8) + "01", -i));
    out.push(d > end ? end : d);
  }
  return out;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

// --- Photographie -------------------------------------------------------------

export interface SnapshotRow {
  counterpartyId: string;
  name: string;
  entityId: string;
  segment: string | null;
  sectorCode: string | null;
  grade: string;
  rank: number;
  isDefault: boolean;
  exposure: number;
  exposureKnown: boolean;
  asOfDate: string;
  effectiveDate: string;
  expired: boolean;
  watchlist: string | null;
}

/** Dernière note qui fait foi à la date, par client. */
export function latestAt(obs: RatingObs[], date: string): Map<string, RatingObs> {
  const out = new Map<string, RatingObs>();
  for (const o of obs) {
    if (o.effectiveDate > date) continue;
    const cur = out.get(o.counterpartyId);
    if (!cur || o.effectiveDate > cur.effectiveDate || (o.effectiveDate === cur.effectiveDate && o.asOfDate > cur.asOfDate)) out.set(o.counterpartyId, o);
  }
  return out;
}

/** Niveau de watch list de chaque client à la date (null : non inscrit). */
export function watchlistAt(events: WatchlistEvent[], date: string): Map<string, string> {
  const sorted = events.filter((e) => e.effectiveDate <= date).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const out = new Map<string, string>();
  for (const e of sorted) {
    if (e.kind === "WL_ENTREE") out.set(e.counterpartyId, e.level ?? "WL");
    else out.delete(e.counterpartyId);
  }
  return out;
}

export function snapshot(obs: RatingObs[], wl: WatchlistEvent[], date: string, scale: ScaleInfo, validityMonths: number): SnapshotRow[] {
  const wlMap = watchlistAt(wl, date);
  const rows: SnapshotRow[] = [];
  for (const o of latestAt(obs, date).values()) {
    const rank = rankOf(scale, o.grade);
    if (rank === null) continue; // note d'une échelle antérieure : hors photographie
    rows.push({
      counterpartyId: o.counterpartyId,
      name: o.name,
      entityId: o.entityId,
      segment: o.segment,
      sectorCode: o.sectorCode,
      grade: o.grade,
      rank,
      isDefault: isDefault(scale, o.grade),
      exposure: o.exposure ?? 0,
      exposureKnown: o.exposure !== null,
      asOfDate: o.asOfDate,
      effectiveDate: o.effectiveDate,
      expired: addMonths(o.effectiveDate, validityMonths) < date,
      watchlist: wlMap.get(o.counterpartyId) ?? null,
    });
  }
  return rows;
}

// --- Indicateurs d'une photographie -------------------------------------------

export interface SnapshotKpis {
  rated: number;
  exposure: number;
  /** Clients sans exposition connue. */
  exposureUnknown: number;
  avgGrade: number | null;
  highRiskPct: number | null;
  defaultPct: number | null;
  watchlistPct: number | null;
  watchlistCount: number;
  top10Pct: number | null;
  expiredPct: number | null;
  expiredCount: number;
  /** Couverture : clients avec note valide / population ; null sans population. */
  coveragePct: number | null;
  population: number | null;
}

const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

export function snapshotKpis(rows: SnapshotRow[], highRiskFrom: number, population?: number | null): SnapshotKpis {
  const exposure = rows.reduce((s, r) => s + r.exposure, 0);
  const performing = rows.filter((r) => !r.isDefault);
  const perfExpo = performing.reduce((s, r) => s + r.exposure, 0);
  // Pondération par l'exposition ; sans aucune exposition connue, moyenne simple.
  const avgGrade = performing.length ? (perfExpo > 0 ? performing.reduce((s, r) => s + r.rank * r.exposure, 0) / perfExpo : performing.reduce((s, r) => s + r.rank, 0) / performing.length) : null;
  const sumWhere = (f: (r: SnapshotRow) => boolean) => rows.filter(f).reduce((s, r) => s + r.exposure, 0);
  const sorted = [...rows].sort((a, b) => b.exposure - a.exposure);
  const expiredCount = rows.filter((r) => r.expired).length;
  const valid = rows.length - expiredCount;
  return {
    rated: rows.length,
    exposure,
    exposureUnknown: rows.filter((r) => !r.exposureKnown).length,
    avgGrade,
    highRiskPct: pct(sumWhere((r) => !r.isDefault && r.rank >= highRiskFrom), exposure),
    defaultPct: pct(sumWhere((r) => r.isDefault), exposure),
    watchlistPct: pct(sumWhere((r) => r.watchlist !== null), exposure),
    watchlistCount: rows.filter((r) => r.watchlist !== null).length,
    top10Pct: pct(sorted.slice(0, 10).reduce((s, r) => s + r.exposure, 0), exposure),
    expiredPct: pct(expiredCount, rows.length),
    expiredCount,
    coveragePct: population ? pct(valid, population) : null,
    population: population ?? null,
  };
}

// --- Migration ------------------------------------------------------------------

export interface MigrationMatrix {
  from: string;
  to: string;
  /** Libellés des lignes et colonnes : classes performantes puis « D » (défaut). */
  labels: string[];
  /** cells[i][j] : clients passés de labels[i] à labels[j]. */
  cells: number[][];
  /** Exposition (fin de période) correspondante. */
  exposure: number[][];
  /** Notés au départ, sans note valide à la fin : sortie du portefeuille, note non renouvelée (expirée) ou échelle changée. */
  withdrawn: number[];
  cohort: number;
  upgrades: number;
  downgrades: number;
  stable: number;
  newDefaults: number;
  strongDowngrades: number;
  entrants: number;
  withdrawnTotal: number;
  upgradePct: number | null;
  downgradePct: number | null;
  stablePct: number | null;
  /** Dégradations moins améliorations, en % de la cohorte. */
  netPct: number | null;
  /** Variation moyenne en crans (positif : dégradation). */
  avgNotch: number | null;
  /** Clients de la cohorte (notés au début et à la fin). */
  cohortIds: string[];
  /** Mouvements individuels, pour les listes et l'export. */
  moves: Array<{ counterpartyId: string; name: string; fromGrade: string; toGrade: string; notches: number; exposure: number; segment: string | null; sectorCode: string | null; entityId: string }>;
}

export interface MigrationOptions {
  strongNotches?: number;
  /** Durée de validité (mois) : une note expirée à la fin compte en « non renouvelée », pas en « stable ». */
  validityMonths?: number;
  /** Clients actifs à la fin ; absent : tous. Un client inactif compte en sortie. */
  active?: Set<string>;
}

export function migrationMatrix(obs: RatingObs[], from: string, to: string, scale: ScaleInfo, opts: MigrationOptions = {}): MigrationMatrix {
  const strongNotches = opts.strongNotches ?? 2;
  const labels = [...scale.performing, "D"];
  const n = labels.length;
  const cells = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const exposure = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const withdrawn = new Array<number>(n).fill(0);
  const start = latestAt(obs, from);
  const end = latestAt(obs, to);
  let upgrades = 0;
  let downgrades = 0;
  let stable = 0;
  let newDefaults = 0;
  let strong = 0;
  let notchSum = 0;
  let notchN = 0;
  let entrants = 0;
  let cohort = 0;
  const cohortIds: string[] = [];
  const moves: MigrationMatrix["moves"] = [];
  for (const [id, s] of start) {
    const r0 = rankOf(scale, s.grade);
    if (r0 === null) continue;
    const e = end.get(id);
    const r1 = e ? rankOf(scale, e.grade) : null;
    const expired = !!e && opts.validityMonths !== undefined && addMonths(e.effectiveDate, opts.validityMonths) < to;
    if (!e || r1 === null || expired || (opts.active && !opts.active.has(id))) {
      withdrawn[r0 - 1]++;
      continue;
    }
    cohort++;
    cohortIds.push(id);
    cells[r0 - 1][r1 - 1]++;
    exposure[r0 - 1][r1 - 1] += e.exposure ?? 0;
    const d = r1 - r0;
    if (d > 0) downgrades++;
    else if (d < 0) upgrades++;
    else stable++;
    if (r1 === n && r0 < n) newDefaults++;
    if (d >= strongNotches) strong++;
    if (r0 < n && r1 < n) {
      notchSum += d;
      notchN++;
    }
    if (d !== 0) moves.push({ counterpartyId: id, name: e.name, fromGrade: s.grade, toGrade: e.grade, notches: d, exposure: e.exposure ?? 0, segment: e.segment, sectorCode: e.sectorCode, entityId: e.entityId });
  }
  for (const [id, e] of end) if (!start.has(id) && rankOf(scale, e.grade) !== null) entrants++;
  moves.sort((a, b) => b.notches - a.notches || b.exposure - a.exposure);
  return {
    from,
    to,
    labels,
    cells,
    exposure,
    withdrawn,
    cohort,
    upgrades,
    downgrades,
    stable,
    newDefaults,
    strongDowngrades: strong,
    entrants,
    withdrawnTotal: withdrawn.reduce((a, b) => a + b, 0),
    upgradePct: pct(upgrades, cohort),
    downgradePct: pct(downgrades, cohort),
    stablePct: pct(stable, cohort),
    netPct: cohort ? (100 * (downgrades - upgrades)) / cohort : null,
    avgNotch: notchN ? notchSum / notchN : null,
    cohortIds,
    moves,
  };
}

// --- Ventilations ------------------------------------------------------------------

export interface BreakdownRow {
  key: string;
  count: number;
  exposure: number;
  sharePct: number | null;
  avgGrade: number | null;
  highRiskPct: number | null;
  defaultPct: number | null;
  watchlistCount: number;
  downgradePct: number | null;
  cohort: number;
}

export function breakdown(rows: SnapshotRow[], keyOf: (r: SnapshotRow) => string, highRiskFrom: number, migration?: MigrationMatrix): BreakdownRow[] {
  const total = rows.reduce((s, r) => s + r.exposure, 0);
  const groups = new Map<string, SnapshotRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const cohortIds = migration ? new Set(migration.cohortIds) : null;
  const moveBy = new Map<string, number>();
  if (migration) for (const m of migration.moves) if (m.notches > 0) moveBy.set(m.counterpartyId, m.notches);
  const out: BreakdownRow[] = [];
  for (const [key, list] of groups) {
    const k = snapshotKpis(list, highRiskFrom);
    // Cohorte du segment : clients de la ventilation présents dans la matrice.
    const cohort = cohortIds ? list.filter((r) => cohortIds.has(r.counterpartyId)).length : 0;
    const down = list.filter((r) => moveBy.has(r.counterpartyId)).length;
    out.push({
      key,
      count: list.length,
      exposure: k.exposure,
      sharePct: pct(k.exposure, total),
      avgGrade: k.avgGrade,
      highRiskPct: k.highRiskPct,
      defaultPct: k.defaultPct,
      watchlistCount: k.watchlistCount,
      downgradePct: migration ? pct(down, cohort) : null,
      cohort,
    });
  }
  return out.sort((a, b) => b.exposure - a.exposure || a.key.localeCompare(b.key));
}

// --- Série mensuelle ---------------------------------------------------------------

export interface SeriesPoint extends SnapshotKpis {
  date: string;
  /** Notes validées dans le mois. */
  validated: number;
}

export function monthlySeries(
  obs: RatingObs[],
  wl: WatchlistEvent[],
  population: PopulationMember[] | null,
  end: string,
  months: number,
  scale: ScaleInfo,
  validityMonths: number,
  highRiskFrom: number
): SeriesPoint[] {
  return monthEnds(end, months).map((date) => {
    const rows = snapshot(obs, wl, date, scale, validityMonths);
    const pop = population ? population.filter((p) => p.since <= date).length : null;
    const monthStart = date.slice(0, 8) + "01";
    return {
      date,
      ...snapshotKpis(rows, highRiskFrom, pop),
      validated: obs.filter((o) => o.effectiveDate >= monthStart && o.effectiveDate <= date).length,
    };
  });
}

// --- Processus -----------------------------------------------------------------------

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ProcessKpis {
  validatedInPeriod: number;
  overrides: number;
  overridePct: number | null;
  /** Dérogations qui améliorent la note du modèle. */
  favourableOverrides: number;
  decided: number;
  rejected: number;
  rejectionPct: number | null;
  medianLeadDays: number | null;
}

export function processKpis(obs: RatingObs[], cases: CaseTiming[], from: string, to: string, scale: ScaleInfo): ProcessKpis {
  const inPeriod = obs.filter((o) => o.effectiveDate > from && o.effectiveDate <= to);
  let overrides = 0;
  let favourable = 0;
  for (const o of inPeriod) {
    if (!o.modelGrade || o.modelGrade === o.grade) continue;
    overrides++;
    const a = rankOf(scale, o.grade);
    const b = rankOf(scale, o.modelGrade);
    if (a !== null && b !== null && a < b) favourable++;
  }
  const decided = cases.filter((c) => c.decidedAt && c.decidedAt > from && c.decidedAt <= to && (c.status === "VALIDATED" || c.status === "REJECTED"));
  const rejected = decided.filter((c) => c.status === "REJECTED").length;
  const leads = decided.filter((c) => c.submittedAt).map((c) => Math.max(0, daysBetween(c.submittedAt!, c.decidedAt!)));
  return {
    validatedInPeriod: inPeriod.length,
    overrides,
    overridePct: pct(overrides, inPeriod.length),
    favourableOverrides: favourable,
    decided: decided.length,
    rejected,
    rejectionPct: pct(rejected, decided.length),
    medianLeadDays: median(leads),
  };
}

// --- Watch list : retards ---------------------------------------------------------------

export interface WatchlistLevelRule {
  code: string;
  reviewDays: number;
  renotationDays: number;
}

export interface WatchlistLate {
  counterpartyId: string;
  level: string;
  since: string;
  /** Dernière décision de comité (entrée ou changement de niveau). */
  lastDecision: string;
  reviewDue: string;
  renotationDue: string;
  reviewLate: boolean;
  renotationLate: boolean;
}

/**
 * Clients en watch list à la date, avec leurs échéances : revue périodique
 * (depuis la dernière décision) et renotation imposée (une note validée après
 * l'entrée ou le dernier changement de niveau).
 */
export function watchlistDue(events: WatchlistEvent[], obs: RatingObs[], rules: WatchlistLevelRule[], date: string): WatchlistLate[] {
  const byCp = new Map<string, WatchlistEvent[]>();
  for (const e of events.filter((x) => x.effectiveDate <= date).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))) byCp.set(e.counterpartyId, [...(byCp.get(e.counterpartyId) ?? []), e]);
  const out: WatchlistLate[] = [];
  for (const [id, list] of byCp) {
    const last = list[list.length - 1];
    if (last.kind !== "WL_ENTREE") continue;
    let since = last.effectiveDate;
    for (let i = list.length - 1; i >= 0 && list[i].kind === "WL_ENTREE"; i--) since = list[i].effectiveDate;
    const rule = rules.find((r) => r.code === last.level) ?? rules[0];
    if (!rule) continue;
    const reviewDue = addDays(last.effectiveDate, rule.reviewDays);
    const renotationDue = addDays(last.effectiveDate, rule.renotationDays);
    const renoted = obs.some((o) => o.counterpartyId === id && o.effectiveDate >= last.effectiveDate);
    out.push({
      counterpartyId: id,
      level: last.level ?? "WL",
      since,
      lastDecision: last.effectiveDate,
      reviewDue,
      renotationDue,
      reviewLate: reviewDue < date,
      renotationLate: !renoted && renotationDue < date,
    });
  }
  return out.sort((a, b) => a.reviewDue.localeCompare(b.reviewDue));
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

// --- Assemblage -----------------------------------------------------------------------------

export interface KriValue {
  def: KriDef;
  value: number | null;
  /** Valeur au début de l'horizon (tendance). */
  previous: number | null;
  rag: RagStatus;
  noteFr?: string;
}

export function assembleKris(
  s: SurveillanceSettings,
  now: SnapshotKpis,
  before: SnapshotKpis,
  migration: MigrationMatrix,
  proc: ProcessKpis,
  wlLate: number
): KriValue[] {
  const values: Record<string, [number | null, number | null, string?]> = {
    NOTE_MOYENNE: [now.avgGrade, before.avgGrade],
    PART_RISQUE_ELEVE: [now.highRiskPct, before.highRiskPct],
    PART_DEFAUT: [now.defaultPct, before.defaultPct],
    PART_WATCHLIST: [now.watchlistPct, before.watchlistPct, `${now.watchlistCount} client(s)`],
    TAUX_DEGRADATION: [migration.downgradePct, null, `${migration.downgrades} sur ${migration.cohort} client(s) de la cohorte`],
    SOLDE_MIGRATION: [migration.netPct, null, migration.avgNotch !== null ? `variation moyenne ${migration.avgNotch > 0 ? "+" : ""}${migration.avgNotch.toFixed(2)} cran` : undefined],
    CONCENTRATION_TOP10: [now.top10Pct, before.top10Pct],
    COUVERTURE: [now.coveragePct, before.coveragePct, now.population !== null ? `${now.rated - now.expiredCount} sur ${now.population} client(s)` : undefined],
    NOTES_EXPIREES: [now.expiredPct, before.expiredPct, `${now.expiredCount} client(s)`],
    TAUX_DEROGATION: [proc.overridePct, null, `${proc.overrides} sur ${proc.validatedInPeriod} note(s), dont ${proc.favourableOverrides} favorable(s)`],
    DELAI_INSTRUCTION: [proc.medianLeadDays, null, `${proc.decided} décision(s), ${proc.rejected} rejet(s)`],
    WL_EN_RETARD: [wlLate, null],
  };
  return KRI_CATALOG.map((def) => {
    const [value, previous, noteFr] = values[def.code] ?? [null, null];
    return { def, value, previous, rag: ragOf(def, value, s.thresholds[def.code]), noteFr };
  });
}
