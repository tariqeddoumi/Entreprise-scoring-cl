import { canonText, matchOption, type EntryLists } from "./entry-lists";
import type { CounterpartyFromT24 } from "./core-banking";

/**
 * Passage de la saisie manuelle aux données de T24.
 *
 * Fiche client : chaque champ saisi est comparé à T24 avant tout
 * enregistrement. T24 fait foi par défaut ; garder la valeur saisie à la place
 * d'une valeur T24 différente exige un motif. La saisie d'origine est conservée
 * (instantané), les champs gardés ne sont pas écrasés par les actualisations
 * suivantes tant qu'ils diffèrent de T24.
 *
 * Engagements : les lignes saisies sont appariées aux lignes T24 (référence,
 * type, montants, échéance). Tant qu'une ligne saisie n'est pas rapprochée,
 * gardée ou écartée, elle sort des totaux dès que T24 a fourni des lignes :
 * jamais de double comptage.
 */

export type FieldMatch = "IDENTIQUE" | "A_COMPLETER" | "ECART" | "SAISIE_SEULE";

export interface FieldComparison {
  field: keyof CounterpartyFromT24;
  labelFr: string;
  manual: string | null;
  t24: string | null;
  status: FieldMatch;
  /** Choix proposé : la valeur de T24, ou la valeur saisie (T24 vide). */
  proposed: "T24" | "SAISIE";
}

export const RECONCILE_LABELS: Record<keyof CounterpartyFromT24, string> = {
  name: "Intitulé",
  legalForm: "Forme juridique",
  ice: "ICE",
  rc: "Registre de commerce",
  fiscalId: "Identifiant fiscal",
  sectorCode: "Secteur d'activité",
  commercialSegment: "Segment commercial",
  city: "Ville",
  country: "Pays",
  currency: "Devise",
  accountOfficer: "Gestionnaire",
};

export const MATCH_LABELS: Record<FieldMatch, string> = {
  IDENTIQUE: "identique",
  A_COMPLETER: "complété par T24",
  ECART: "écart",
  SAISIE_SEULE: "absent de T24",
};

/** Deux valeurs sont équivalentes au texte près, ou par la liste de saisie (« Société anonyme » = SA). */
function same(field: keyof CounterpartyFromT24, a: string, b: string, lists?: EntryLists): boolean {
  if (canonText(a) === canonText(b)) return true;
  if (!lists) return false;
  if (field === "legalForm") return matchOption(lists.legalForms, b) === a || matchOption(lists.legalForms, a) === b;
  if (field === "sectorCode") return matchOption(lists.sectors, b) === a || matchOption(lists.sectors, a) === b;
  if (field === "city") return canonText(matchOption(lists.cities, b, "label")) === canonText(a);
  return false;
}

export function compareWithT24(
  current: Partial<Record<keyof CounterpartyFromT24, string | null>>,
  fromT24: CounterpartyFromT24,
  lists?: EntryLists
): FieldComparison[] {
  const out: FieldComparison[] = [];
  for (const field of Object.keys(RECONCILE_LABELS) as Array<keyof CounterpartyFromT24>) {
    const manual = (current[field] ?? "").trim() || null;
    const t24 = (fromT24[field] ?? "").trim() || null;
    if (!manual && !t24) continue;
    const base = { field, labelFr: RECONCILE_LABELS[field], manual, t24 };
    if (!manual) out.push({ ...base, status: "A_COMPLETER", proposed: "T24" });
    else if (!t24) out.push({ ...base, status: "SAISIE_SEULE", proposed: "SAISIE" });
    else if (same(field, manual, t24, lists)) out.push({ ...base, status: "IDENTIQUE", proposed: "T24" });
    else out.push({ ...base, status: "ECART", proposed: "T24" });
  }
  return out;
}

export interface KeptField {
  value: string;
  t24: string;
  reason: string;
  by: string;
  at: string;
}

/** Saisie manuelle conservée au rattachement à T24 (colonne counterparties.manualEntry). */
export interface ManualEntryRecord {
  snapshot: Partial<Record<keyof CounterpartyFromT24, string | null>>;
  snapshotAt: string;
  snapshotBy: string;
  /** Valeurs saisies gardées à la place de T24, avec leur motif. */
  kept: Partial<Record<keyof CounterpartyFromT24, KeptField>>;
}

export function parseManualEntry(raw: string | null | undefined): ManualEntryRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ManualEntryRecord;
    return v && typeof v === "object" && v.snapshot ? { ...v, kept: v.kept ?? {} } : null;
  } catch {
    return null;
  }
}

export const MIN_KEEP_REASON = 10;

/**
 * Application des choix : valeurs à écrire et champs gardés. Une valeur saisie
 * gardée face à une valeur T24 différente exige un motif.
 */
export function applyReconciliation(
  rows: FieldComparison[],
  decisions: Partial<Record<keyof CounterpartyFromT24, "T24" | "SAISIE">>,
  reasons: Partial<Record<keyof CounterpartyFromT24, string>>,
  who: { by: string; at: string }
): { update: Partial<Record<keyof CounterpartyFromT24, string>>; kept: Partial<Record<keyof CounterpartyFromT24, KeptField>>; issues: string[] } {
  const update: Partial<Record<keyof CounterpartyFromT24, string>> = {};
  const kept: Partial<Record<keyof CounterpartyFromT24, KeptField>> = {};
  const issues: string[] = [];
  for (const r of rows) {
    const choice = r.status === "SAISIE_SEULE" ? "SAISIE" : decisions[r.field] ?? r.proposed;
    if (choice === "T24" && r.t24 !== null) {
      if (r.t24 !== r.manual) update[r.field] = r.t24;
      continue;
    }
    if (r.status === "ECART") {
      const reason = (reasons[r.field] ?? "").trim();
      if (reason.length < MIN_KEEP_REASON) {
        issues.push(`${r.labelFr} : motif requis pour garder la valeur saisie (${MIN_KEEP_REASON} caractères au moins).`);
        continue;
      }
      kept[r.field] = { value: r.manual!, t24: r.t24!, reason: reason.slice(0, 500), ...who };
    }
  }
  return { update, kept, issues };
}

// --- Engagements ---------------------------------------------------------------------------

export type FacilityReconciliation = "RAPPROCHEE" | "CONSERVEE" | "ECARTEE";

export const RECONCILIATION_LABELS: Record<FacilityReconciliation, string> = {
  RAPPROCHEE: "rapprochée d'une ligne T24",
  CONSERVEE: "gardée (absente de T24)",
  ECARTEE: "écartée",
};

export interface MatchableLine {
  id: string;
  source: "API" | "SAISIE";
  reference: string;
  typeCode: string;
  authorized: number | null;
  outstanding: number | null;
  maturityDate: string;
  reconciliation?: FacilityReconciliation | null;
}

const near = (a: number | null, b: number | null, pct: number) => a !== null && b !== null && (a === b || Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * pct);

/** Score de ressemblance d'une ligne saisie et d'une ligne T24, avec ses raisons. */
export function matchScore(m: MatchableLine, a: MatchableLine): { score: number; why: string[] } {
  const why: string[] = [];
  let score = 0;
  if (m.reference && a.reference && canonText(m.reference) === canonText(a.reference)) {
    score += 100;
    why.push("même référence");
  }
  if (m.typeCode === a.typeCode) {
    score += 40;
    why.push("même type");
  }
  if (near(m.authorized, a.authorized, 0.05)) {
    score += 30;
    why.push("autorisé proche");
  } else if (near(m.authorized, a.authorized, 0.15)) {
    score += 15;
    why.push("autorisé voisin");
  }
  if (near(m.outstanding, a.outstanding, 0.05)) {
    score += 20;
    why.push("encours proche");
  } else if (near(m.outstanding, a.outstanding, 0.15)) {
    score += 10;
    why.push("encours voisin");
  }
  if (m.maturityDate && m.maturityDate === a.maturityDate) {
    score += 10;
    why.push("même échéance");
  }
  return { score, why };
}

/** Seuil d'appariement proposé (même type + montants proches, ou même référence). */
export const MATCH_THRESHOLD = 60;

export interface MatchProposal {
  manualId: string;
  apiId: string | null;
  score: number;
  why: string[];
}

/** Appariement proposé : chaque ligne T24 sert au plus une fois, les meilleurs scores d'abord. */
export function proposeFacilityMatches(lines: MatchableLine[]): MatchProposal[] {
  const manual = lines.filter((l) => l.source === "SAISIE" && !l.reconciliation);
  const api = lines.filter((l) => l.source === "API");
  // Rien à rapprocher tant que T24 n'a fourni aucune ligne.
  if (!api.length) return [];
  const candidates = manual.flatMap((m) => api.map((a) => ({ m, a, ...matchScore(m, a) }))).filter((c) => c.score >= MATCH_THRESHOLD);
  candidates.sort((x, y) => y.score - x.score);
  const usedM = new Set<string>();
  const usedA = new Set<string>();
  const out: MatchProposal[] = [];
  for (const c of candidates) {
    if (usedM.has(c.m.id) || usedA.has(c.a.id)) continue;
    usedM.add(c.m.id);
    usedA.add(c.a.id);
    out.push({ manualId: c.m.id, apiId: c.a.id, score: c.score, why: c.why });
  }
  for (const m of manual) if (!usedM.has(m.id)) out.push({ manualId: m.id, apiId: null, score: 0, why: [] });
  return out;
}

/**
 * Lignes retenues dans les totaux. Sans ligne T24 : toutes les lignes saisies.
 * Avec des lignes T24 : celles-ci, plus les lignes saisies gardées ; une ligne
 * saisie non encore rapprochée est « à rapprocher » et ne compte pas.
 */
export function effectiveFacilities<T extends { source: string; reconciliation?: string | null }>(lines: T[]): { effective: T[]; pending: T[] } {
  if (!lines.some((l) => l.source === "API")) return { effective: lines, pending: [] };
  return {
    effective: lines.filter((l) => l.source === "API" || l.reconciliation === "CONSERVEE"),
    pending: lines.filter((l) => l.source === "SAISIE" && !l.reconciliation),
  };
}
