import { effectiveFacilities, proposeFacilityMatches, type FacilityReconciliation, type MatchProposal } from "@/reference/reconciliation";
import type { PrismaClient } from "@/generated/prisma";
import type { Identity } from "./auth";
import { auditWithin } from "./audit";
import { t24Config } from "./core-banking";
import { canWrite, OutOfScopeError, type Perimeter } from "./scope";
import { loadSettings } from "./settings";
import { today } from "./rating-scale";
import {
  analyseFacilities,
  checkFacilities,
  DEFAULT_FACILITY_TYPES,
  FACILITY_TYPES_KEY,
  mapT24Facilities,
  normalizeFacility,
  parseFacilityFieldMap,
  parseFacilityTypes,
  type ExposureBasis,
  type Facility,
  type FacilityFinding,
  type FacilitySettings,
  type FacilitySignal,
  type FacilityTotals,
  type FacilityType,
} from "@/reference/facilities";

/**
 * Engagements du client ligne par ligne : lecture, saisie (remplace les lignes
 * saisies), rapatriement depuis T24 (remplace les lignes T24). Chaque
 * enregistrement est journalisé ; le jeton T24 reste une variable
 * d'environnement.
 */

export class FacilityError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const T24_FACILITY_FIELD_MAP_KEY = "T24_FACILITY_FIELD_MAP";

export async function loadFacilityTypes(db: PrismaClient): Promise<FacilityType[]> {
  try {
    return parseFacilityTypes((await db.appSetting.findUnique({ where: { key: FACILITY_TYPES_KEY } }))?.value);
  } catch {
    return DEFAULT_FACILITY_TYPES;
  }
}

export async function facilitySettings(): Promise<FacilitySettings> {
  const s = await loadSettings();
  const basis = (["MAX", "AUTORISE", "ENCOURS"].includes(s.FACILITY_EXPOSURE_BASIS) ? s.FACILITY_EXPOSURE_BASIS : "MAX") as ExposureBasis;
  return { basis, offBalanceWeightPct: Number(s.FACILITY_OFF_BALANCE_WEIGHT ?? 100) };
}

export interface StoredFacility extends Facility {
  id: string;
  source: "API" | "SAISIE";
  asOfDate: string;
  recordedBy: string;
  /** Rapprochement d'une ligne saisie avec T24 ; vide = à rapprocher. */
  reconciliation: FacilityReconciliation | null;
  matchedReference: string | null;
}

const dec = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function listFacilities(db: PrismaClient, counterpartyId: string): Promise<StoredFacility[]> {
  const rows = await db.creditFacility.findMany({ where: { counterpartyId }, orderBy: [{ source: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    source: r.source === "API" ? "API" : "SAISIE",
    asOfDate: r.asOfDate,
    recordedBy: r.recordedBy,
    reference: r.reference ?? "",
    typeCode: r.typeCode,
    labelFr: r.labelFr ?? "",
    authorized: dec(r.authorized),
    outstanding: dec(r.outstanding),
    overdue: dec(r.overdue),
    overdueDays: r.overdueDays,
    startDate: r.startDate ?? "",
    maturityDate: r.maturityDate ?? "",
    guarantees: r.guarantees ?? "",
    guaranteeValue: dec(r.guaranteeValue),
    status: (r.status === "ECHUE" || r.status === "CLOTUREE" ? r.status : "ACTIVE") as Facility["status"],
    reconciliation: r.reconciliation === "RAPPROCHEE" || r.reconciliation === "CONSERVEE" || r.reconciliation === "ECARTEE" ? r.reconciliation : null,
    matchedReference: r.matchedReference,
  }));
}

export interface FacilityStatus {
  lines: StoredFacility[];
  /** Lignes saisies à rapprocher des lignes T24 (hors totaux), avec l'appariement proposé. */
  pending: MatchProposal[];
  totals: FacilityTotals;
  findings: FacilityFinding[];
  signals: FacilitySignal[];
  positionDate: string | null;
  settings: FacilitySettings;
  types: FacilityType[];
}

export async function facilityStatus(
  db: PrismaClient,
  counterpartyId: string,
  opts: { bureauOwnOutstanding?: number | null; declaredExposure?: number | null; date?: string } = {}
): Promise<FacilityStatus> {
  const [lines, types, settings] = await Promise.all([listFacilities(db, counterpartyId), loadFacilityTypes(db), facilitySettings()]);
  // Totaux sur les lignes retenues : une ligne saisie non rapprochée ne
  // s'ajoute pas aux lignes T24 (pas de double comptage).
  const { effective } = effectiveFacilities(lines);
  const positionDate = effective.length ? effective.map((l) => l.asOfDate).sort()[0] : null;
  const pending = proposeFacilityMatches(lines);
  const a = analyseFacilities(effective, opts.date ?? today(), { types, settings, bureauOwnOutstanding: opts.bureauOwnOutstanding, declaredExposure: opts.declaredExposure, positionDate });
  if (pending.length)
    a.findings.unshift({
      level: "ATTENTION",
      textFr: `${pending.length} ligne(s) saisie(s) à rapprocher des lignes rapatriées de T24 : elles ne comptent pas dans les totaux tant qu'elles ne sont pas rapprochées, gardées ou écartées.`,
    });
  return { lines, pending, ...a, positionDate, settings, types };
}

async function writable(db: PrismaClient, perimeter: Perimeter, counterpartyId: string) {
  const cp = await db.counterparty.findUnique({ where: { id: counterpartyId } });
  if (!cp) throw new FacilityError(404, "Client introuvable.");
  if (!canWrite(perimeter, cp.entityId)) throw new OutOfScopeError("Client hors de votre périmètre d'écriture.");
  return cp;
}

async function replace(db: PrismaClient, identity: Identity, cp: { id: string; entityId: string }, source: "API" | "SAISIE", lines: Facility[], asOfDate: string, action: string) {
  await db.$transaction(async (tx) => {
    await tx.creditFacility.deleteMany({ where: { counterpartyId: cp.id, source } });
    if (lines.length)
      await tx.creditFacility.createMany({
        data: lines.map((l) => ({
          counterpartyId: cp.id,
          source,
          reference: l.reference || null,
          typeCode: l.typeCode,
          labelFr: l.labelFr || null,
          authorized: l.authorized,
          outstanding: l.outstanding,
          overdue: l.overdue,
          overdueDays: l.overdueDays,
          startDate: l.startDate || null,
          maturityDate: l.maturityDate || null,
          guarantees: l.guarantees || null,
          guaranteeValue: l.guaranteeValue,
          status: l.status,
          asOfDate,
          recordedBy: identity.name,
        })),
      });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action,
      resourceType: "Counterparty",
      resourceId: cp.id,
      entityId: cp.entityId,
      detail: {
        source,
        asOfDate,
        lignes: lines.length,
        autorise: lines.reduce((a, l) => a + (l.authorized ?? 0), 0),
        encours: lines.reduce((a, l) => a + (l.outstanding ?? 0), 0),
      },
    });
  });
}

/** Saisie : remplace les lignes saisies du client (les lignes T24 ne sont pas touchées). */
export async function saveManualFacilities(db: PrismaClient, perimeter: Perimeter, identity: Identity, counterpartyId: string, raw: unknown[], asOfDate: string) {
  const cp = await writable(db, perimeter, counterpartyId);
  const types = await loadFacilityTypes(db);
  const lines = (Array.isArray(raw) ? raw : []).map((l) => normalizeFacility(l, types));
  const issues = checkFacilities(lines);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || asOfDate > today()) issues.push("Date de la position requise, pas dans le futur.");
  if (issues.length) throw new FacilityError(400, issues.join(" "));
  await replace(db, identity, cp, "SAISIE", lines, asOfDate, "FACILITIES_RECORDED");
  return lines.length;
}

export interface ReconcileDecision {
  manualId: string;
  action: FacilityReconciliation;
  /** Ligne T24 retenue (rapprochement). */
  apiId?: string | null;
}

/**
 * Rapprochement des lignes saisies avec les lignes T24 : rapprochée (la ligne
 * T24 la remplace dans les totaux, la saisie reste consultable), gardée
 * (absente de T24) ou écartée. Chaque ligne T24 ne sert qu'une fois.
 */
export async function reconcileFacilities(db: PrismaClient, perimeter: Perimeter, identity: Identity, counterpartyId: string, decisions: ReconcileDecision[]) {
  const cp = await writable(db, perimeter, counterpartyId);
  const rows = await db.creditFacility.findMany({ where: { counterpartyId: cp.id }, select: { id: true, source: true, reference: true, typeCode: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const usedApi = new Set<string>();
  const issues: string[] = [];
  const clean = (Array.isArray(decisions) ? decisions : []).slice(0, 300).filter((d) => d && typeof d.manualId === "string");
  for (const d of clean) {
    const m = byId.get(d.manualId);
    if (!m || m.source !== "SAISIE") issues.push("Ligne saisie introuvable.");
    if (!["RAPPROCHEE", "CONSERVEE", "ECARTEE"].includes(d.action)) issues.push("Choix non admis.");
    if (d.action === "RAPPROCHEE") {
      const a = d.apiId ? byId.get(d.apiId) : undefined;
      if (!a || a.source !== "API") issues.push("Rapprochement : choisissez la ligne T24 correspondante.");
      else if (usedApi.has(a.id)) issues.push(`La ligne T24 ${a.reference ?? a.typeCode} est rapprochée deux fois.`);
      else usedApi.add(a.id);
    }
  }
  if (!clean.length) issues.push("Aucune décision.");
  if (issues.length) throw new FacilityError(400, [...new Set(issues)].join(" "));
  const at = new Date();
  await db.$transaction(async (tx) => {
    for (const d of clean) {
      const a = d.action === "RAPPROCHEE" && d.apiId ? byId.get(d.apiId)! : null;
      await tx.creditFacility.updateMany({
        where: { id: d.manualId, counterpartyId: cp.id, source: "SAISIE" },
        data: { reconciliation: d.action, matchedReference: a ? (a.reference ?? a.typeCode) : null, reconciledBy: identity.name, reconciledAt: at },
      });
    }
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action: "FACILITIES_RECONCILED",
      resourceType: "Counterparty",
      resourceId: cp.id,
      entityId: cp.entityId,
      detail: {
        decisions: clean.map((d) => ({
          ligneSaisie: byId.get(d.manualId)?.reference || byId.get(d.manualId)?.typeCode,
          choix: d.action,
          ...(d.apiId ? { ligneT24: byId.get(d.apiId)?.reference || byId.get(d.apiId)?.typeCode } : {}),
        })),
      },
    });
  });
  return clean.length;
}

/** Rapatriement depuis T24 (limites du client) : remplace les lignes T24. */
export async function syncFacilitiesFromT24(
  db: PrismaClient,
  perimeter: Perimeter,
  identity: Identity,
  counterpartyId: string,
  opts: { timeoutMs?: number } = {}
): Promise<number> {
  const cp = await writable(db, perimeter, counterpartyId);
  const cfg = await t24Config();
  const path = (await loadSettings()).T24_FACILITIES_PATH ?? "";
  if (!cfg.enabled || !path) throw new FacilityError(409, "Rapatriement des engagements depuis T24 non activé : saisissez les lignes.");
  if (!cp.coreBankingId) throw new FacilityError(400, "Client non rattaché à T24 : rattachez d'abord la fiche à son code client.");
  const lines = await fetchT24Facilities(db, cp.coreBankingId, { timeoutMs: opts.timeoutMs });
  await replace(db, identity, cp, "API", lines, today(), "FACILITIES_SYNCED_FROM_T24");
  return lines.length;
}

/**
 * Lecture des lignes d'engagement d'un client dans T24, sans rien enregistrer.
 * ignoreEnabled : test de connexion avant activation (Administration › Raccordements).
 */
export async function fetchT24Facilities(db: PrismaClient, code: string, opts: { timeoutMs?: number; ignoreEnabled?: boolean } = {}): Promise<Facility[]> {
  const cfg = await t24Config();
  const path = (await loadSettings()).T24_FACILITIES_PATH ?? "";
  if (!path || (opts.ignoreEnabled ? !cfg.baseUrl : !cfg.enabled)) throw new FacilityError(409, "Rapatriement des engagements depuis T24 non activé : saisissez les lignes.");
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}${encodeURIComponent(code)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.T24_API_TOKEN) headers.Authorization = `Bearer ${process.env.T24_API_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), cache: "no-store" });
  } catch {
    throw new FacilityError(503, "T24 ne répond pas : saisissez les lignes ou réessayez plus tard.");
  }
  if (res.status === 404) throw new FacilityError(404, `Aucun engagement pour le client T24 ${code}.`);
  if (!res.ok) throw new FacilityError(503, `T24 a répondu en erreur (${res.status}).`);
  const json = await res.json().catch(() => null);
  if (json === null) throw new FacilityError(503, "Réponse de T24 illisible.");
  const types = await loadFacilityTypes(db);
  const mapRaw = (await db.appSetting.findUnique({ where: { key: T24_FACILITY_FIELD_MAP_KEY } }).catch(() => null))?.value;
  return mapT24Facilities(json, types, parseFacilityFieldMap(mapRaw));
}
