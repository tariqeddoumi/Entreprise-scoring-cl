/**
 * Engagements du client chez la banque, ligne par ligne : autorisations de
 * fonctionnement, crédits à moyen et long terme, crédit-bail, engagements par
 * signature. Rapatriés de T24 (limites du client) ou saisis.
 *
 * Usages dans l'outil (calculs purs, testés) :
 *  - engagement global du dossier (base paramétrable : autorisé, encours, ou
 *    le plus grand des deux ; pondération des engagements par signature) ;
 *  - constats : dépassements, lignes échues encore utilisées, impayés ;
 *  - critères BAM proposés à vérifier sur les impayés (E04, E12, E19) ;
 *  - rapprochement avec l'encours déclaré au crédit bureau.
 */

export type Nature = "BILAN" | "HORS_BILAN";
export type Term = "CT" | "MLT";

export interface FacilityType {
  code: string;
  labelFr: string;
  nature: Nature;
  term: Term;
  active: boolean;
}

export const FACILITY_TYPES_KEY = "FACILITY_TYPES";

export const DEFAULT_FACILITY_TYPES: FacilityType[] = [
  { code: "FACILITE_CAISSE", labelFr: "Facilité de caisse", nature: "BILAN", term: "CT", active: true },
  { code: "DECOUVERT", labelFr: "Découvert autorisé", nature: "BILAN", term: "CT", active: true },
  { code: "ESCOMPTE", labelFr: "Escompte commercial", nature: "BILAN", term: "CT", active: true },
  { code: "AVANCE_CREANCES", labelFr: "Avances sur créances, affacturage", nature: "BILAN", term: "CT", active: true },
  { code: "AVANCE_MARCHES", labelFr: "Avances sur marchés publics", nature: "BILAN", term: "CT", active: true },
  { code: "PREFINANCEMENT_EXPORT", labelFr: "Préfinancement, avance export", nature: "BILAN", term: "CT", active: true },
  { code: "CREDIT_SPOT", labelFr: "Crédit spot, avance à court terme", nature: "BILAN", term: "CT", active: true },
  { code: "CMT", labelFr: "Crédit à moyen terme", nature: "BILAN", term: "MLT", active: true },
  { code: "CLT", labelFr: "Crédit à long terme", nature: "BILAN", term: "MLT", active: true },
  { code: "CREDIT_BAIL", labelFr: "Crédit-bail", nature: "BILAN", term: "MLT", active: true },
  { code: "CAUTION_MARCHES", labelFr: "Cautions sur marchés", nature: "HORS_BILAN", term: "CT", active: true },
  { code: "CAUTION_ADMIN", labelFr: "Cautions administratives et douanières", nature: "HORS_BILAN", term: "CT", active: true },
  { code: "CREDOC", labelFr: "Crédit documentaire", nature: "HORS_BILAN", term: "CT", active: true },
  { code: "AVAL", labelFr: "Avals et acceptations", nature: "HORS_BILAN", term: "CT", active: true },
  { code: "AUTRE", labelFr: "Autre engagement", nature: "BILAN", term: "CT", active: true },
];

export const NATURE_LABELS: Record<Nature, string> = { BILAN: "Bilan", HORS_BILAN: "Hors bilan (signature)" };
export const TERM_LABELS: Record<Term, string> = { CT: "Court terme", MLT: "Moyen et long terme" };

export function checkFacilityTypes(list: FacilityType[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  if (!list.some((t) => t.active)) issues.push("Au moins un type actif.");
  for (const t of list) {
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(t.code)) issues.push(`Code non admis : « ${t.code} ».`);
    if (seen.has(t.code)) issues.push(`Code en double : ${t.code}.`);
    seen.add(t.code);
    if (!t.labelFr.trim() || t.labelFr.length > 120) issues.push(`${t.code} : libellé de 1 à 120 caractères.`);
    if (t.nature !== "BILAN" && t.nature !== "HORS_BILAN") issues.push(`${t.code} : nature bilan ou hors bilan.`);
    if (t.term !== "CT" && t.term !== "MLT") issues.push(`${t.code} : durée court terme ou moyen et long terme.`);
  }
  if (!list.some((t) => t.code === "AUTRE")) issues.push("Le type AUTRE est requis (lignes non reconnues de T24).");
  return issues;
}

export function parseFacilityTypes(raw: string | null | undefined): FacilityType[] {
  if (!raw) return DEFAULT_FACILITY_TYPES;
  try {
    const v = JSON.parse(raw) as FacilityType[];
    return Array.isArray(v) && checkFacilityTypes(v).length === 0 ? v : DEFAULT_FACILITY_TYPES;
  } catch {
    return DEFAULT_FACILITY_TYPES;
  }
}

export type ExposureBasis = "AUTORISE" | "MAX" | "ENCOURS";

export interface FacilitySettings {
  basis: ExposureBasis;
  /** Pondération des engagements par signature dans l'engagement global (%). */
  offBalanceWeightPct: number;
}

export const DEFAULT_FACILITY_SETTINGS: FacilitySettings = { basis: "MAX", offBalanceWeightPct: 100 };

export type FacilityStatus = "ACTIVE" | "ECHUE" | "CLOTUREE";
export const FACILITY_STATUS_LABELS: Record<FacilityStatus, string> = { ACTIVE: "En vigueur", ECHUE: "Échue", CLOTUREE: "Clôturée" };

export interface Facility {
  reference: string;
  typeCode: string;
  labelFr: string;
  authorized: number | null;
  outstanding: number | null;
  overdue: number | null;
  overdueDays: number | null;
  startDate: string;
  maturityDate: string;
  guarantees: string;
  guaranteeValue: number | null;
  status: FacilityStatus;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const isoDate = (v: unknown) => {
  const s = str(v, 10);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

export function normalizeFacility(raw: unknown, types: FacilityType[] = DEFAULT_FACILITY_TYPES): Facility {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const code = str(x.typeCode, 32).toUpperCase();
  const status = str(x.status, 12).toUpperCase();
  const days = num(x.overdueDays);
  return {
    reference: str(x.reference, 60),
    typeCode: types.some((t) => t.code === code) ? code : "AUTRE",
    labelFr: str(x.labelFr, 120),
    authorized: num(x.authorized),
    outstanding: num(x.outstanding),
    overdue: num(x.overdue),
    overdueDays: days === null ? null : Math.max(0, Math.round(days)),
    startDate: isoDate(x.startDate),
    maturityDate: isoDate(x.maturityDate),
    guarantees: str(x.guarantees, 300),
    guaranteeValue: num(x.guaranteeValue),
    status: status === "ECHUE" || status === "CLOTUREE" ? status : "ACTIVE",
  };
}

export function checkFacilities(lines: Facility[]): string[] {
  const issues: string[] = [];
  lines.forEach((l, i) => {
    const n = `Ligne ${i + 1}${l.reference ? ` (${l.reference})` : ""}`;
    if (l.authorized === null && l.outstanding === null) issues.push(`${n} : autorisé ou encours requis.`);
    for (const [k, v] of [["autorisé", l.authorized], ["encours", l.outstanding], ["impayé", l.overdue], ["valeur des garanties", l.guaranteeValue]] as const)
      if (v !== null && v < 0) issues.push(`${n} : montant ${k} négatif.`);
    if (l.startDate && l.maturityDate && l.maturityDate < l.startDate) issues.push(`${n} : échéance antérieure à la mise en place.`);
  });
  if (lines.length > 200) issues.push("200 lignes au plus.");
  return issues;
}

export interface FacilityTotals {
  lines: number;
  authorized: number;
  outstanding: number;
  overdue: number;
  bilan: { authorized: number; outstanding: number };
  horsBilan: { authorized: number; outstanding: number };
  shortTerm: { authorized: number; outstanding: number };
  longTerm: { authorized: number; outstanding: number };
  /** Engagement global selon la base paramétrée (devise du client). */
  exposure: number;
  utilisationPct: number | null;
  guaranteeValue: number;
  maxOverdueDays: number;
}

const amt = (v: number | null) => v ?? 0;

export function lineExposure(l: Facility, basis: ExposureBasis): number {
  if (basis === "AUTORISE") return amt(l.authorized);
  if (basis === "ENCOURS") return amt(l.outstanding);
  return Math.max(amt(l.authorized), amt(l.outstanding));
}

export function facilityTotals(lines: Facility[], types: FacilityType[] = DEFAULT_FACILITY_TYPES, s: FacilitySettings = DEFAULT_FACILITY_SETTINGS): FacilityTotals {
  const live = lines.filter((l) => l.status !== "CLOTUREE");
  const typeOf = (l: Facility) => types.find((t) => t.code === l.typeCode) ?? DEFAULT_FACILITY_TYPES.find((t) => t.code === "AUTRE")!;
  const pick = (f: (l: Facility) => boolean) => {
    const ls = live.filter(f);
    return { authorized: ls.reduce((a, l) => a + amt(l.authorized), 0), outstanding: ls.reduce((a, l) => a + amt(l.outstanding), 0) };
  };
  const authorized = live.reduce((a, l) => a + amt(l.authorized), 0);
  const outstanding = live.reduce((a, l) => a + amt(l.outstanding), 0);
  const exposure = live.reduce((a, l) => a + lineExposure(l, s.basis) * (typeOf(l).nature === "HORS_BILAN" ? s.offBalanceWeightPct / 100 : 1), 0);
  return {
    lines: live.length,
    authorized,
    outstanding,
    overdue: live.reduce((a, l) => a + amt(l.overdue), 0),
    bilan: pick((l) => typeOf(l).nature === "BILAN"),
    horsBilan: pick((l) => typeOf(l).nature === "HORS_BILAN"),
    shortTerm: pick((l) => typeOf(l).term === "CT"),
    longTerm: pick((l) => typeOf(l).term === "MLT"),
    exposure: Math.round(exposure * 100) / 100,
    utilisationPct: authorized > 0 ? (100 * outstanding) / authorized : null,
    guaranteeValue: live.reduce((a, l) => a + amt(l.guaranteeValue), 0),
    maxOverdueDays: Math.max(0, ...live.map((l) => (amt(l.overdue) > 0 ? (l.overdueDays ?? 0) : 0))),
  };
}

export const FACILITY_SIGNALS = {
  FAC_IMPAYE_90: "Impayé de plus de 90 jours sur une ligne de la banque",
  FAC_IMPAYE_180: "Impayé de plus de 180 jours sur une ligne de la banque",
  FAC_IMPAYE_360: "Impayé de plus de 360 jours sur une ligne de la banque",
} as const;
export type FacilitySignal = keyof typeof FACILITY_SIGNALS;

export interface FacilityFinding {
  level: "INFO" | "ATTENTION" | "ALERTE";
  textFr: string;
}

const fmt = (v: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);

export function analyseFacilities(
  lines: Facility[],
  today: string,
  opts: { types?: FacilityType[]; settings?: FacilitySettings; bureauOwnOutstanding?: number | null; declaredExposure?: number | null; positionDate?: string | null } = {}
): { totals: FacilityTotals; findings: FacilityFinding[]; signals: FacilitySignal[] } {
  const totals = facilityTotals(lines, opts.types, opts.settings);
  const findings: FacilityFinding[] = [];
  const signals: FacilitySignal[] = [];
  const live = lines.filter((l) => l.status !== "CLOTUREE");
  const label = (l: Facility) => l.labelFr || l.typeCode;
  for (const l of live) {
    if (l.authorized && l.outstanding && l.outstanding > l.authorized * 1.1)
      findings.push({
        level: "ALERTE",
        textFr: `${label(l)}${l.reference ? ` (${l.reference})` : ""} : dépassement de ${Math.round((100 * (l.outstanding - l.authorized)) / l.authorized)} % de l'autorisation. Au-delà de 90 jours, critère E03 à vérifier.`,
      });
    if (amt(l.outstanding) > 0 && (l.status === "ECHUE" || (l.maturityDate && l.maturityDate < today)))
      findings.push({ level: "ATTENTION", textFr: `${label(l)}${l.reference ? ` (${l.reference})` : ""} : ligne échue (${l.maturityDate || "date inconnue"}) encore utilisée : renouvellement à instruire.` });
  }
  if (totals.overdue > 0) findings.push({ level: "ALERTE", textFr: `Impayés sur les lignes de la banque : ${fmt(totals.overdue)}${totals.maxOverdueDays ? `, le plus ancien à ${totals.maxOverdueDays} jours` : ""}.` });
  if (totals.maxOverdueDays > 360) signals.push("FAC_IMPAYE_360");
  else if (totals.maxOverdueDays > 180) signals.push("FAC_IMPAYE_180");
  else if (totals.maxOverdueDays > 90) signals.push("FAC_IMPAYE_90");
  if (opts.bureauOwnOutstanding !== undefined && opts.bureauOwnOutstanding !== null && totals.outstanding > 0) {
    const gap = Math.abs(opts.bureauOwnOutstanding - totals.outstanding) / totals.outstanding;
    if (gap > 0.1)
      findings.push({
        level: "ATTENTION",
        textFr: `Encours de la banque au crédit bureau (${fmt(opts.bureauOwnOutstanding)}) différent de l'encours des lignes (${fmt(totals.outstanding)}) : écart de ${Math.round(gap * 100)} %, à expliquer (date de déclaration, ligne manquante).`,
      });
  }
  if (opts.declaredExposure !== undefined && opts.declaredExposure !== null && totals.lines > 0 && Math.abs(opts.declaredExposure - totals.exposure) > Math.max(1, totals.exposure * 0.01))
    findings.push({ level: "INFO", textFr: `Engagement global saisi au dossier (${fmt(opts.declaredExposure)}) différent de celui des lignes (${fmt(totals.exposure)}).` });
  if (opts.positionDate) {
    const age = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(opts.positionDate + "T00:00:00Z")) / 86_400_000);
    if (age > 31) findings.push({ level: "ATTENTION", textFr: `Position des engagements datée du ${opts.positionDate} (${age} jours) : à actualiser.` });
  }
  return { totals, findings, signals };
}

// --- T24 : limites du client ----------------------------------------------------------

export const FACILITY_FIELDS = ["reference", "product", "labelFr", "authorized", "outstanding", "overdue", "overdueDays", "startDate", "maturityDate", "guarantees", "guaranteeValue", "status"] as const;
export type FacilityFieldMap = Record<(typeof FACILITY_FIELDS)[number], string[]> & { items: string[]; products: Record<string, string> };

/**
 * Correspondance par défaut de l'API Transact (limites du client) ; la liste
 * des lignes est cherchée à `items`, chaque champ à ses chemins candidats ; les
 * codes produit de T24 se traduisent en types de l'outil par `products`.
 */
export const DEFAULT_FACILITY_FIELD_MAP: FacilityFieldMap = {
  items: ["body", "body.limits", "limits", "items"],
  reference: ["limitId", "limitReference", "arrangementId", "id"],
  product: ["limitProduct", "productId", "product", "typeCode"],
  labelFr: ["limitProductName", "productName", "description", "labelFr"],
  authorized: ["internalAmount", "approvedAmount", "limitAmount", "authorized"],
  outstanding: ["utilisedAmount", "totalOutstanding", "outstandingAmount", "outstanding"],
  overdue: ["overdueAmount", "pastDueAmount", "overdue"],
  overdueDays: ["overdueDays", "daysPastDue"],
  startDate: ["approvalDate", "startDate", "valueDate"],
  maturityDate: ["expiryDate", "maturityDate"],
  guarantees: ["collateralDescription", "guarantees"],
  guaranteeValue: ["collateralAmount", "guaranteeValue"],
  status: ["limitStatus", "status"],
  products: {},
};

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(k)) cur = cur[Number(k)];
    else if (typeof cur === "object" && !Array.isArray(cur)) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

export function parseFacilityFieldMap(raw: string | null | undefined): FacilityFieldMap {
  if (!raw) return DEFAULT_FACILITY_FIELD_MAP;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: FacilityFieldMap = { ...DEFAULT_FACILITY_FIELD_MAP, products: { ...DEFAULT_FACILITY_FIELD_MAP.products } };
    for (const f of [...FACILITY_FIELDS, "items"] as const) {
      const p = v[f];
      if (Array.isArray(p) && p.every((x) => typeof x === "string" && /^[\w.]{1,120}$/.test(x))) (out as Record<string, unknown>)[f] = (p as string[]).slice(0, 10);
    }
    if (v.products && typeof v.products === "object")
      for (const [k, code] of Object.entries(v.products as Record<string, unknown>)) if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(code)) out.products[k] = code;
    return out;
  } catch {
    return DEFAULT_FACILITY_FIELD_MAP;
  }
}

export function mapT24Facilities(json: unknown, types: FacilityType[] = DEFAULT_FACILITY_TYPES, map: FacilityFieldMap = DEFAULT_FACILITY_FIELD_MAP): Facility[] {
  let items: unknown[] = [];
  for (const p of map.items) {
    const v = at(json, p);
    if (Array.isArray(v)) {
      items = v;
      break;
    }
  }
  return items.slice(0, 200).map((it) => {
    const get = (f: (typeof FACILITY_FIELDS)[number]) => {
      for (const p of map[f]) {
        const v = at(it, p);
        if (v !== undefined && v !== null && v !== "") return v;
      }
      return undefined;
    };
    const product = str(get("product"), 40);
    const typeCode = map.products[product] ?? (types.some((t) => t.code === product.toUpperCase()) ? product.toUpperCase() : "AUTRE");
    const status = str(get("status"), 20).toUpperCase();
    return normalizeFacility(
      {
        reference: get("reference"),
        typeCode,
        labelFr: get("labelFr") ?? (typeCode === "AUTRE" ? product : ""),
        authorized: get("authorized"),
        outstanding: get("outstanding"),
        overdue: get("overdue"),
        overdueDays: get("overdueDays"),
        startDate: get("startDate"),
        maturityDate: get("maturityDate"),
        guarantees: get("guarantees"),
        guaranteeValue: get("guaranteeValue"),
        status: /CLOS|CLOT|CLOSED|CANCEL/.test(status) ? "CLOTUREE" : /EXPIR|ECHU|MATUR/.test(status) ? "ECHUE" : "ACTIVE",
      },
      types
    );
  });
}
