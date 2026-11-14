import { officialRunHistory } from "./current-ratings";
import { effectiveFacilities } from "@/reference/reconciliation";
import type { PrismaClient } from "@/generated/prisma";
import { loadWatchlistLevels } from "@/lib/classification-store";
import { descendants, loadTree, type EntityNode } from "@/lib/scope";
import { settingInt } from "@/lib/settings";
import type { GradeScaleConfig } from "@/core/types";
import { hasRole, type Role } from "@/lib/auth";
import { loadCircuit } from "@/lib/workflow";
import { hasPermission } from "@/reference/workflow";
import { facilitySettings, loadFacilityTypes } from "@/lib/facilities";
import { facilityTotals, normalizeFacility } from "@/reference/facilities";
import {
  addMonths,
  assembleKris,
  breakdown,
  DEFAULT_SCALE_INFO,
  migrationMatrix,
  monthlySeries,
  processKpis,
  snapshot,
  snapshotKpis,
  watchlistDue,
  type BreakdownRow,
  type KriValue,
  type MigrationMatrix,
  type ProcessKpis,
  type SeriesPoint,
  type SnapshotKpis,
  type SnapshotRow,
  type WatchlistLate,
  type ScaleInfo,
  type FacilityPosition,
  parseSurveillance,
  SURVEILLANCE_KEY,
  type CaseTiming,
  type PopulationMember,
  type RatingObs,
  type SurveillanceSettings,
  type WatchlistEvent,
  type WatchlistLevelRule,
} from "@/reference/portfolio";

/**
 * Données de la surveillance du portefeuille, lues dans le périmètre de la
 * session (client cloisonné) : notes qui font foi, watch list, dossiers.
 *
 * Exposition : conversion consignée au dossier (devise de base), à défaut le
 * montant transmis au moteur. C'est l'engagement déclaré au moment de la note,
 * pas l'encours du jour : un flux d'encours (système de crédit) le remplacera,
 * voir docs/20.
 */

export interface PortfolioFilters {
  entityId?: string;
  segment?: string;
  sector?: string;
}

export interface PortfolioData {
  obs: RatingObs[];
  wl: WatchlistEvent[];
  population: PopulationMember[];
  cases: CaseTiming[];
  tree: EntityNode[];
  segments: string[];
  sectors: string[];
  settings: SurveillanceSettings;
  wlRules: WatchlistLevelRule[];
  validityMonths: number;
  /** Flux d'encours : position des lignes d'engagement par client. */
  positions: Map<string, FacilityPosition>;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);


export async function loadSurveillanceSettings(db: PrismaClient): Promise<SurveillanceSettings> {
  try {
    return parseSurveillance((await db.appSetting.findUnique({ where: { key: SURVEILLANCE_KEY } }))?.value);
  } catch {
    return parseSurveillance(null);
  }
}

export async function loadPortfolio(db: PrismaClient, filters: PortfolioFilters): Promise<PortfolioData> {
  const tree = await loadTree();
  const entityIds = filters.entityId ? descendants(tree, filters.entityId) : null;
  const cpWhere = {
    ...(entityIds ? { entityId: { in: entityIds } } : {}),
    ...(filters.sector ? { sectorCode: filters.sector === "_" ? null : filters.sector } : {}),
  };
  const counterparties = await db.counterparty.findMany({ where: cpWhere, select: { id: true, name: true, entityId: true, segment: true, sectorCode: true, createdAt: true, isActive: true } });
  const [runs, wlRows, caseRows, settings, levels, validityMonths, facilityRows, facTypes, facSettings] = await Promise.all([
    // Clients lus par le client cloisonné : l'historique ne porte que sur eux.
    officialRunHistory(db, counterparties.map((c) => c.id)),
    db.committeeDecision.findMany({
      where: { kind: { in: ["WL_ENTREE", "WL_SORTIE"] }, status: "EFFECTIVE", counterparty: cpWhere },
      select: { counterpartyId: true, kind: true, effectiveDate: true, level: true },
    }),
    db.ratingCase.findMany({
      where: { status: { in: ["VALIDATED", "REJECTED"] }, counterparty: cpWhere },
      select: { counterpartyId: true, status: true, submittedAt: true, decidedAt: true },
    }),
    loadSurveillanceSettings(db),
    loadWatchlistLevels(db),
    settingInt("RATING_VALIDITY_MONTHS"),
    db.creditFacility.findMany({ where: { status: { not: "CLOTUREE" }, counterparty: cpWhere } }),
    loadFacilityTypes(db),
    facilitySettings(),
  ]);

  const cp = new Map(counterparties.map((c) => [c.id, c]));
  // Segment d'analyse : celui de la dernière note qui fait foi (le moteur le
  // détermine), à défaut le segment indicatif du client. Un client garde le même
  // segment sur tout l'historique, sans quoi la cohorte d'une ligne changerait
  // de segment en cours de période.
  const lastSegment = new Map<string, string | null>();
  for (const r of runs) if (r.segment) lastSegment.set(r.counterpartyId, r.segment);
  const segmentOf = (id: string) => lastSegment.get(id) ?? cp.get(id)?.segment ?? null;
  const keep = (id: string) => !filters.segment || (segmentOf(id) ?? "_") === filters.segment;

  const obs: RatingObs[] = [];
  for (const r of runs) {
    const c = cp.get(r.counterpartyId);
    if (!c || !r.finalGrade || !keep(c.id)) continue;
    obs.push({
      counterpartyId: c.id,
      name: c.name,
      entityId: c.entityId,
      segment: segmentOf(c.id),
      sectorCode: c.sectorCode,
      asOfDate: r.asOfDate,
      effectiveDate: day(r.decidedAt) ?? day(r.createdAt)!,
      grade: r.finalGrade,
      modelGrade: r.cappedGrade,
      exposure: r.exposureBase,
    });
  }
  const population: PopulationMember[] = counterparties
    .filter((c) => c.isActive && keep(c.id))
    .map((c) => ({ counterpartyId: c.id, name: c.name, entityId: c.entityId, segment: segmentOf(c.id), sectorCode: c.sectorCode, since: day(c.createdAt)! }));

  // Positions par client : totaux des lignes (base de l'engagement global
  // paramétrée), date = la plus ancienne position des lignes du client.
  const byCp = new Map<string, typeof facilityRows>();
  for (const f of facilityRows) byCp.set(f.counterpartyId, [...(byCp.get(f.counterpartyId) ?? []), f]);
  // Lignes retenues par client (saisie non rapprochée exclue dès que T24 a fourni des lignes).
  for (const [id, rows] of byCp) byCp.set(id, effectiveFacilities(rows).effective);
  const positions = new Map<string, FacilityPosition>();
  for (const [id, rows] of byCp) {
    if (!keep(id)) continue;
    const lines = rows.map((r) =>
      normalizeFacility(
        { ...r, authorized: r.authorized === null ? null : Number(r.authorized), outstanding: r.outstanding === null ? null : Number(r.outstanding), overdue: r.overdue === null ? null : Number(r.overdue) },
        facTypes
      )
    );
    const t = facilityTotals(lines, facTypes, facSettings);
    positions.set(id, {
      counterpartyId: id,
      asOfDate: rows.map((r) => r.asOfDate).sort()[0],
      exposure: t.exposure,
      outstanding: t.outstanding,
      overdue: t.overdue,
      maxOverdueDays: t.maxOverdueDays,
      overrun: lines.some((l) => l.authorized !== null && l.outstanding !== null && l.authorized > 0 && l.outstanding > l.authorized * 1.1),
    });
  }

  return {
    positions,
    obs,
    wl: wlRows.filter((w) => keep(w.counterpartyId)).map((w) => ({ counterpartyId: w.counterpartyId, kind: w.kind as WatchlistEvent["kind"], effectiveDate: w.effectiveDate, level: w.level })),
    population,
    cases: caseRows.filter((c) => keep(c.counterpartyId)).map((c) => ({ status: c.status, submittedAt: day(c.submittedAt), decidedAt: day(c.decidedAt) })),
    tree,
    segments: [...new Set(counterparties.map((c) => segmentOf(c.id) ?? "_"))].sort(),
    sectors: [...new Set(counterparties.map((c) => c.sectorCode ?? "_"))].sort(),
    settings,
    wlRules: levels.filter((l) => l.active).map((l) => ({ code: l.code, reviewDays: l.reviewDays, renotationDays: l.renotationDays })),
    validityMonths,
  };
}

// --- Rapport (écran et export) ------------------------------------------------

export interface SurveillanceReport {
  asOf: string;
  from: string;
  horizon: number;
  settings: SurveillanceSettings;
  validityMonths: number;
  now: SnapshotKpis;
  before: SnapshotKpis;
  kris: KriValue[];
  migration: MigrationMatrix;
  process: ProcessKpis;
  series: SeriesPoint[];
  /** Répartition par classe : part de l'exposition (et effectif) au début et à la fin. */
  distribution: Array<{ label: string; beforePct: number; nowPct: number; beforeCount: number; nowCount: number }>;
  bySegment: BreakdownRow[];
  bySector: BreakdownRow[];
  byEntity: BreakdownRow[];
  top: Array<SnapshotRow & { sharePct: number; cumulativePct: number; entityName: string }>;
  rows: SnapshotRow[];
  alerts: {
    strongDowngrades: MigrationMatrix["moves"];
    newDefaults: MigrationMatrix["moves"];
    expired: SnapshotRow[];
    expiringSoon: SnapshotRow[];
    watchlist: Array<WatchlistLate & { name: string; grade: string | null }>;
    /** Impayés ou dépassements sur les lignes d'engagement. */
    facilities: SnapshotRow[];
  };
  entityName: Record<string, string>;
}

/** Classes de l'échelle maîtresse en vigueur, de la meilleure à la moins bonne, et grades de défaut. */
export function scaleInfo(scale: GradeScaleConfig | null | undefined): ScaleInfo {
  if (!scale?.bands.length) return DEFAULT_SCALE_INFO;
  return { performing: scale.bands.map((b) => b.grade), defaults: scale.defaultGrades.map((d) => d.grade) };
}

export function buildSurveillance(data: PortfolioData, asOf: string, horizon: number, scale: ScaleInfo = DEFAULT_SCALE_INFO, seriesMonths = 24): SurveillanceReport {
  const s = data.settings;
  const from = addMonths(asOf, -horizon);
  const rows = snapshot(data.obs, data.wl, asOf, scale, data.validityMonths, data.positions);
  const rowsBefore = snapshot(data.obs, data.wl, from, scale, data.validityMonths, data.positions);
  const popAt = (d: string) => data.population.filter((p) => p.since <= d).length;
  const now = snapshotKpis(rows, s.highRiskFrom, popAt(asOf));
  const before = snapshotKpis(rowsBefore, s.highRiskFrom, popAt(from));
  const active = new Set(data.population.map((p) => p.counterpartyId));
  const migration = migrationMatrix(data.obs, from, asOf, scale, { strongNotches: s.strongDowngradeNotches, validityMonths: data.validityMonths, active });
  const process = processKpis(data.obs, data.cases, from, asOf, scale);
  const wlDue = watchlistDue(data.wl, data.obs, data.wlRules, asOf);
  const late = wlDue.filter((w) => w.reviewLate || w.renotationLate);
  const kris = assembleKris(s, now, before, migration, process, late.length);
  const series = monthlySeries(data.obs, data.wl, data.population, asOf, seriesMonths, scale, data.validityMonths, s.highRiskFrom, data.positions);

  const labels = [...scale.performing, "D"];
  const share = (list: SnapshotRow[], i: number) => {
    const total = list.reduce((a, r) => a + r.exposure, 0);
    const inClass = list.filter((r) => r.rank === i + 1);
    return { pct: total > 0 ? (100 * inClass.reduce((a, r) => a + r.exposure, 0)) / total : 0, count: inClass.length };
  };
  const distribution = labels.map((label, i) => {
    const b = share(rowsBefore, i);
    const n = share(rows, i);
    return { label, beforePct: b.pct, nowPct: n.pct, beforeCount: b.count, nowCount: n.count };
  });

  const entityName = Object.fromEntries(data.tree.map((e) => [e.id, e.name]));
  const total = now.exposure;
  let cum = 0;
  const top = [...rows]
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 20)
    .map((r) => {
      const sharePct = total > 0 ? (100 * r.exposure) / total : 0;
      cum += sharePct;
      return { ...r, sharePct, cumulativePct: cum, entityName: entityName[r.entityId] ?? r.entityId };
    });

  const soon = addMonths(asOf, 2);
  const nameOf = new Map(data.population.map((p) => [p.counterpartyId, p.name]));
  const gradeOf = new Map(rows.map((r) => [r.counterpartyId, r.grade]));
  return {
    asOf,
    from,
    horizon,
    settings: s,
    validityMonths: data.validityMonths,
    now,
    before,
    kris,
    migration,
    process,
    series,
    distribution,
    bySegment: breakdown(rows, (r) => r.segment ?? "Non déterminé", s.highRiskFrom, migration),
    bySector: breakdown(rows, (r) => r.sectorCode ?? "Non renseigné", s.highRiskFrom, migration),
    byEntity: breakdown(rows, (r) => entityName[r.entityId] ?? r.entityId, s.highRiskFrom, migration),
    top,
    rows,
    alerts: {
      facilities: rows.filter((r) => r.position && (r.position.overdue > 0 || r.position.overrun)).sort((a, b) => (b.position!.overdue - a.position!.overdue) || (b.exposure - a.exposure)),
      strongDowngrades: migration.moves.filter((m) => m.notches >= s.strongDowngradeNotches),
      newDefaults: migration.moves.filter((m) => scale.defaults.includes(m.toGrade) && !scale.defaults.includes(m.fromGrade)),
      expired: rows.filter((r) => r.expired).sort((a, b) => b.exposure - a.exposure),
      expiringSoon: rows.filter((r) => !r.expired && addMonths(r.effectiveDate, data.validityMonths) <= soon).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
      watchlist: wlDue.map((w) => ({ ...w, name: nameOf.get(w.counterpartyId) ?? w.counterpartyId, grade: gradeOf.get(w.counterpartyId) ?? null })),
    },
    entityName,
  };
}

/**
 * Accès à la surveillance : gestionnaire des risques et administrateur, ou
 * fonction métier dotée du droit VOIR_SURVEILLANCE (paramétrage du circuit).
 * Les données restent celles du périmètre de la personne.
 */
export async function canViewSurveillance(identity: { role: Role; jobFunction?: string | null }): Promise<boolean> {
  if (hasRole(identity.role, "RISK_MANAGER")) return true;
  const { circuit } = await loadCircuit();
  return hasPermission(circuit, identity.jobFunction, "VOIR_SURVEILLANCE");
}

/** Paramètres d'URL de l'écran et de l'export. */
export function parseSurveillanceParams(p: Record<string, string | undefined>, todayIso: string, defaultHorizon: number) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(p.asOf ?? "") && p.asOf! <= todayIso ? p.asOf! : todayIso;
  const h = Number(p.horizon);
  const horizon = [3, 6, 12, 24].includes(h) ? h : defaultHorizon;
  const clean = (v?: string) => (v && /^[\w.\-]{1,64}$/.test(v) ? v : undefined);
  return { asOf, horizon, filters: { entityId: clean(p.entity), segment: clean(p.segment), sector: clean(p.sector) } };
}
