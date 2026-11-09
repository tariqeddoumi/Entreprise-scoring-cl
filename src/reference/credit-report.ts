/**
 * Rapport de solvabilité du crédit bureau (Creditinfo Maroc, Quantik Maroc,
 * délégataires de Bank Al-Maghrib). La circulaire 1/G/2010 impose de le
 * consulter avant tout octroi.
 *
 * Le rapport arrive soit par API (base des rapports du crédit bureau), soit lu
 * par l'OCR intelligent dans un PDF ou une image, vérifié par l'analyste. Ce module, pur,
 * contrôle son contenu, mesure son ancienneté depuis sa DATE DE MISE À JOUR
 * (pas sa date de chargement) et en tire des constats et des signaux de
 * critères BAM à vérifier. Le rafraîchissement du rapport se fait dans l'outil
 * du crédit bureau, hors de l'outil de notation.
 */

import { parseAmountLoose, type FieldSpec } from "./corrections";

export type Bureau = "CREDITINFO" | "QUANTIK" | "AUTRE";
export type ReportSource = "API" | "DOCUMENT" | "SAISIE";

export const BUREAU_LABELS: Record<Bureau, string> = { CREDITINFO: "Creditinfo Maroc", QUANTIK: "Quantik Maroc", AUTRE: "Autre" };
export const SOURCE_LABELS: Record<ReportSource, string> = { API: "API du crédit bureau", DOCUMENT: "Lu par l'OCR intelligent (document)", SAISIE: "Saisi" };

export const LINE_STATUSES = ["EN_COURS", "SOLDE", "IMPAYE", "CONTENTIEUX", "RESTRUCTURE"] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];
export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  EN_COURS: "En cours",
  SOLDE: "Soldé",
  IMPAYE: "Impayé",
  CONTENTIEUX: "Contentieux",
  RESTRUCTURE: "Restructuré",
};

export const INCIDENT_KINDS = ["IMPAYE", "CHEQUE", "CONTENTIEUX", "RESTRUCTURATION", "AUTRE"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export const INCIDENT_LABELS: Record<IncidentKind, string> = {
  IMPAYE: "Impayé",
  CHEQUE: "Incident de paiement sur chèque",
  CONTENTIEUX: "Contentieux",
  RESTRUCTURATION: "Restructuration",
  AUTRE: "Autre incident",
};

/** Une ligne de crédit déclarée par un établissement. */
export interface CreditLine {
  institution: string;
  /** Ligne portée par la banque elle-même. */
  ownBank: boolean;
  type: string;
  authorized: number | null;
  outstanding: number | null;
  overdue: number | null;
  /** Ancienneté de l'impayé le plus ancien (jours). */
  overdueDays: number | null;
  status: LineStatus;
  /** Référence ou numéro du contrat, s'il est imprimé. */
  reference: string;
  /** Rôle du client : titulaire, co-emprunteur, caution. */
  role: string;
  startDate: string;
  maturityDate: string;
  /** Échéance périodique. */
  installment: number | null;
  /** Nombre d'échéances impayées. */
  unpaidInstallments: number | null;
  guarantees: string;
}

export interface CreditIncident {
  date: string;
  kind: IncidentKind;
  institution: string;
  amount: number | null;
  regularized: boolean;
  labelFr: string;
}

/** Signalétique de l'entreprise telle qu'imprimée sur le rapport. */
export interface ReportIdentity {
  companyName: string;
  legalForm: string;
  ice: string;
  rc: string;
  /** Tribunal de commerce (nom ou code) qui tient le registre. */
  commercialCourt: string;
  fiscalId: string;
  cnss: string;
  patente: string;
  address: string;
  city: string;
  creationDate: string;
  capital: number | null;
  activity: string;
}

/** Totaux et nombre de lignes tels qu'imprimés : contrôle d'exhaustivité de la lecture. */
export interface PrintedTotals {
  lineCount: number | null;
  authorized: number | null;
  outstanding: number | null;
  overdue: number | null;
}

export interface CreditReportData {
  companyName: string;
  ice: string;
  identity: ReportIdentity;
  printedTotals: PrintedTotals;
  currency: string;
  lines: CreditLine[];
  incidents: CreditIncident[];
  /** Consultations du rapport par des établissements sur 12 mois (si fourni). */
  inquiries12m: number | null;
  /** Score du crédit bureau, tel qu'imprimé. */
  score: string;
}

export const EMPTY_IDENTITY: ReportIdentity = { companyName: "", legalForm: "", ice: "", rc: "", commercialCourt: "", fiscalId: "", cnss: "", patente: "", address: "", city: "", creationDate: "", capital: null, activity: "" };
export const EMPTY_TOTALS: PrintedTotals = { lineCount: null, authorized: null, outstanding: null, overdue: null };
export const EMPTY_REPORT: CreditReportData = { companyName: "", ice: "", identity: EMPTY_IDENTITY, printedTotals: EMPTY_TOTALS, currency: "MAD", lines: [], incidents: [], inquiries12m: null, score: "" };

/** Libellé d'une ligne dont l'établissement n'est pas nommé (les rapports masquent souvent les confrères). */
export const UNNAMED_INSTITUTION = "Établissement non nommé";

const num = (v: unknown): number | null => {
  const n = parseAmountLoose(v);
  return n === null ? null : Math.abs(n);
};
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const isoOr = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/** Lecture tolérante d'un contenu JSON (API, IA ou formulaire) ; les valeurs inconnues sont neutralisées. */
export function normalizeReport(raw: unknown): CreditReportData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 300).map((l): CreditLine => {
    const x = (l ?? {}) as Record<string, unknown>;
    const status = str(x.status, 20).toUpperCase();
    const ownBank = x.ownBank === true || x.ownBank === "true";
    return {
      institution: str(x.institution, 120) || (ownBank ? "La banque" : UNNAMED_INSTITUTION),
      ownBank,
      type: str(x.type, 120),
      authorized: num(x.authorized),
      outstanding: num(x.outstanding),
      overdue: num(x.overdue),
      overdueDays: num(x.overdueDays),
      status: (LINE_STATUSES as readonly string[]).includes(status) ? (status as LineStatus) : "EN_COURS",
      reference: str(x.reference, 80),
      role: str(x.role, 60),
      startDate: isoOr(x.startDate),
      maturityDate: isoOr(x.maturityDate),
      installment: num(x.installment),
      unpaidInstallments: num(x.unpaidInstallments),
      guarantees: str(x.guarantees, 200),
    };
  });
  const incidents = (Array.isArray(o.incidents) ? o.incidents : []).slice(0, 200).map((l): CreditIncident => {
    const x = (l ?? {}) as Record<string, unknown>;
    const kind = str(x.kind, 20).toUpperCase();
    return {
      date: isoOr(x.date),
      kind: (INCIDENT_KINDS as readonly string[]).includes(kind) ? (kind as IncidentKind) : "AUTRE",
      institution: str(x.institution, 120),
      amount: num(x.amount),
      regularized: x.regularized === true || x.regularized === "true",
      labelFr: str(x.labelFr, 300),
    };
  });
  const id = (o.identity && typeof o.identity === "object" ? o.identity : {}) as Record<string, unknown>;
  const pt = (o.printedTotals && typeof o.printedTotals === "object" ? o.printedTotals : {}) as Record<string, unknown>;
  const identity: ReportIdentity = {
    companyName: str(id.companyName, 300) || str(o.companyName, 300),
    legalForm: str(id.legalForm, 60),
    ice: (str(id.ice, 20) || str(o.ice, 20)).replace(/\s/g, ""),
    rc: str(id.rc, 40),
    commercialCourt: str(id.commercialCourt, 80),
    fiscalId: str(id.fiscalId, 30).replace(/\s/g, ""),
    cnss: str(id.cnss, 30).replace(/\s/g, ""),
    patente: str(id.patente, 30).replace(/\s/g, ""),
    address: str(id.address, 300),
    city: str(id.city, 80),
    creationDate: isoOr(id.creationDate),
    capital: num(id.capital),
    activity: str(id.activity, 200),
  };
  const lc = num(pt.lineCount);
  return {
    companyName: identity.companyName,
    ice: identity.ice,
    identity,
    printedTotals: { lineCount: lc === null ? null : Math.round(lc), authorized: num(pt.authorized), outstanding: num(pt.outstanding), overdue: num(pt.overdue) },
    currency: /^[A-Z]{3}$/.test(str(o.currency, 3).toUpperCase()) ? str(o.currency, 3).toUpperCase() : "MAD",
    lines,
    incidents,
    inquiries12m: num(o.inquiries12m),
    score: str(o.score, 40),
  };
}

export function checkReport(reportDate: string, data: CreditReportData, today: string): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) issues.push("Date de mise à jour du rapport requise (elle fait foi pour son ancienneté).");
  else if (reportDate > today) issues.push("La date de mise à jour du rapport ne peut pas être future.");
  for (const [i, l] of data.lines.entries()) {
    for (const [k, v] of [["autorisé", l.authorized], ["encours", l.outstanding], ["impayé", l.overdue]] as const)
      if (v !== null && v < 0) issues.push(`Ligne ${i + 1} : montant ${k} négatif.`);
  }
  for (const [i, x] of data.incidents.entries()) if (x.date && x.date > today) issues.push(`Incident ${i + 1} : date future.`);
  return issues;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export interface Freshness {
  ageDays: number;
  stale: boolean;
  maxAgeDays: number;
  messageFr: string;
}

export function reportFreshness(reportDate: string, today: string, maxAgeDays: number): Freshness {
  const ageDays = Math.max(0, daysBetween(reportDate, today));
  const stale = ageDays > maxAgeDays;
  return {
    ageDays,
    stale,
    maxAgeDays,
    messageFr: stale
      ? `Attention : rapport mis à jour il y a ${ageDays} jours (au-delà de ${maxAgeDays}). Rafraîchissez-le dans l'outil du crédit bureau, puis récupérez-le à nouveau.`
      : `Rapport mis à jour il y a ${ageDays} jour(s) (limite : ${maxAgeDays}).`,
  };
}

/** Signaux de critères BAM à vérifier (clés d'alerte des critères déclaratifs). */
export const BUREAU_SIGNALS = {
  BUREAU_NEGATIF: "Information négative du crédit bureau (impayé ou incident non régularisé)",
  BUREAU_CHEQUES: "Incident de paiement sur chèque non régularisé",
  BUREAU_IMPAYE_90: "Impayé de plus de 90 jours au crédit bureau",
  BUREAU_IMPAYE_180: "Impayé de plus de 180 jours au crédit bureau",
  BUREAU_IMPAYE_360: "Impayé de plus de 360 jours au crédit bureau",
  BUREAU_CONTENTIEUX: "Ligne ou incident en contentieux au crédit bureau",
} as const;
export type BureauSignal = keyof typeof BUREAU_SIGNALS;

export interface Finding {
  level: "INFO" | "ATTENTION" | "ALERTE";
  textFr: string;
}

export interface ReportAnalysis {
  totals: {
    authorized: number;
    outstanding: number;
    overdue: number;
    ownOutstanding: number;
    othersOutstanding: number;
    institutions: number;
  };
  maxOverdueDays: number;
  openIncidents: number;
  signals: BureauSignal[];
  findings: Finding[];
}

export function analyseReport(data: CreditReportData, opts: { declaredExposure?: number | null } = {}): ReportAnalysis {
  const active = data.lines.filter((l) => l.status !== "SOLDE");
  const sum = (f: (l: CreditLine) => number | null, ls = active) => ls.reduce((s, l) => s + (f(l) ?? 0), 0);
  const totals = {
    authorized: sum((l) => l.authorized),
    outstanding: sum((l) => l.outstanding),
    overdue: sum((l) => l.overdue),
    ownOutstanding: sum((l) => l.outstanding, active.filter((l) => l.ownBank)),
    othersOutstanding: sum((l) => l.outstanding, active.filter((l) => !l.ownBank)),
    institutions: new Set(active.map((l) => l.institution.toLowerCase())).size,
  };
  const maxOverdueDays = Math.max(0, ...active.map((l) => (l.overdue && l.overdue > 0 ? (l.overdueDays ?? 0) : 0)));
  const open = data.incidents.filter((i) => !i.regularized);
  const signals = new Set<BureauSignal>();
  const findings: Finding[] = [];
  if (totals.overdue > 0 || open.some((i) => i.kind === "IMPAYE" || i.kind === "CONTENTIEUX")) signals.add("BUREAU_NEGATIF");
  if (open.some((i) => i.kind === "CHEQUE")) signals.add("BUREAU_CHEQUES");
  if (maxOverdueDays > 360) signals.add("BUREAU_IMPAYE_360");
  else if (maxOverdueDays > 180) signals.add("BUREAU_IMPAYE_180");
  else if (maxOverdueDays > 90) signals.add("BUREAU_IMPAYE_90");
  if (active.some((l) => l.status === "CONTENTIEUX") || open.some((i) => i.kind === "CONTENTIEUX")) signals.add("BUREAU_CONTENTIEUX");
  if (signals.has("BUREAU_CHEQUES") && !signals.has("BUREAU_NEGATIF")) signals.add("BUREAU_NEGATIF");

  if (totals.overdue > 0) findings.push({ level: "ALERTE", textFr: `Impayés déclarés : ${fmt(totals.overdue)} ${data.currency}${maxOverdueDays ? `, le plus ancien à ${maxOverdueDays} jours` : ""}.` });
  if (open.length) findings.push({ level: "ALERTE", textFr: `${open.length} incident(s) non régularisé(s) : ${[...new Set(open.map((i) => INCIDENT_LABELS[i.kind].toLowerCase()))].join(", ")}.` });
  if (active.some((l) => l.status === "RESTRUCTURE") || data.incidents.some((i) => i.kind === "RESTRUCTURATION"))
    findings.push({ level: "ATTENTION", textFr: "Crédit restructuré déclaré : vérifier la période d'observation (critère R01)." });
  if (totals.othersOutstanding > 0)
    findings.push({
      level: "INFO",
      textFr: `Endettement auprès des confrères : ${fmt(totals.othersOutstanding)} ${data.currency} sur ${totals.institutions - (active.some((l) => l.ownBank) ? 1 : 0)} établissement(s) ; encours total ${fmt(totals.outstanding)} ${data.currency}.`,
    });
  if (data.inquiries12m !== null && data.inquiries12m >= 5)
    findings.push({ level: "ATTENTION", textFr: `${data.inquiries12m} consultations du rapport en 12 mois : recherche active de financement.` });
  const declared = opts.declaredExposure;
  if (declared && declared > 0 && totals.ownOutstanding > 0) {
    const gap = Math.abs(totals.ownOutstanding - declared) / declared;
    if (gap > 0.1)
      findings.push({
        level: "ATTENTION",
        textFr: `Encours chez la banque selon le crédit bureau (${fmt(totals.ownOutstanding)}) différent de l'engagement déclaré au dossier (${fmt(declared)}) : écart de ${Math.round(gap * 100)} %.`,
      });
  }
  if (!data.lines.length && !data.incidents.length) findings.push({ level: "INFO", textFr: "Aucun engagement ni incident déclaré au crédit bureau." });
  return { totals, maxOverdueDays, openIncidents: open.length, signals: [...signals], findings };
}

function fmt(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
}

/** Schéma JSON de l'extraction par l'OCR intelligent (même structure que l'API). */
const S = { type: "string" } as const;
const N = { type: ["number", "null"] } as const;

export const REPORT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bureau", "reportDate", "reference", "identity", "currency", "printedTotals", "lines", "incidents", "inquiries12m", "score"],
  properties: {
    bureau: { type: "string", enum: ["CREDITINFO", "QUANTIK", "AUTRE"] },
    reportDate: S,
    reference: S,
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["companyName", "legalForm", "ice", "rc", "commercialCourt", "fiscalId", "cnss", "patente", "address", "city", "creationDate", "capital", "activity"],
      properties: { companyName: S, legalForm: S, ice: S, rc: S, commercialCourt: S, fiscalId: S, cnss: S, patente: S, address: S, city: S, creationDate: S, capital: N, activity: S },
    },
    currency: S,
    printedTotals: {
      type: "object",
      additionalProperties: false,
      required: ["lineCount", "authorized", "outstanding", "overdue"],
      properties: { lineCount: N, authorized: N, outstanding: N, overdue: N },
    },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["institution", "ownBank", "type", "reference", "role", "authorized", "outstanding", "overdue", "overdueDays", "unpaidInstallments", "installment", "startDate", "maturityDate", "guarantees", "status"],
        properties: {
          institution: S,
          ownBank: { type: "boolean" },
          type: S,
          reference: S,
          role: S,
          authorized: N,
          outstanding: N,
          overdue: N,
          overdueDays: N,
          unpaidInstallments: N,
          installment: N,
          startDate: S,
          maturityDate: S,
          guarantees: S,
          status: { type: "string", enum: [...LINE_STATUSES] },
        },
      },
    },
    incidents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "kind", "institution", "amount", "regularized", "labelFr"],
        properties: {
          date: S,
          kind: { type: "string", enum: [...INCIDENT_KINDS] },
          institution: S,
          amount: N,
          regularized: { type: "boolean" },
          labelFr: S,
        },
      },
    },
    inquiries12m: N,
    score: S,
  },
} as const;

// --- Contrôles de la lecture ------------------------------------------------------------

/** Exhaustivité : lignes et totaux lus comparés à ceux imprimés sur le rapport. */
export function readingControls(data: CreditReportData): Finding[] {
  const out: Finding[] = [];
  const t = data.printedTotals;
  if (t.lineCount !== null && t.lineCount !== data.lines.length)
    out.push({ level: "ALERTE", textFr: `Lecture incomplète : ${data.lines.length} ligne(s) lue(s) sur ${t.lineCount} annoncée(s) par le rapport. Relancez la lecture ou complétez par une correction.` });
  const all = (f: (l: CreditLine) => number | null) => data.lines.reduce((s, l) => s + (f(l) ?? 0), 0);
  const cmp = (label: string, printed: number | null, read: number) => {
    if (printed === null || printed === 0) return;
    const gap = Math.abs(read - printed) / printed;
    if (gap > 0.01) out.push({ level: "ATTENTION", textFr: `Total ${label} : ${read.toLocaleString("fr-FR")} lu ligne à ligne, ${printed.toLocaleString("fr-FR")} imprimé (écart de ${(gap * 100).toFixed(1)} %).` });
  };
  cmp("autorisé", t.authorized, all((l) => l.authorized));
  cmp("des encours", t.outstanding, all((l) => l.outstanding));
  cmp("des impayés", t.overdue, all((l) => l.overdue));
  if (!out.length && (t.lineCount !== null || t.outstanding !== null))
    out.push({ level: "INFO", textFr: `Lecture complète : ${data.lines.length} ligne(s), totaux concordants avec le rapport.` });
  return out;
}

// --- Signalétique : rapport ↔ fiche client ------------------------------------------------

export const IDENTITY_FIELDS = [
  ["ice", "ICE"],
  ["rc", "Registre de commerce"],
  ["commercialCourt", "Tribunal de commerce"],
  ["fiscalId", "Identifiant fiscal (IF)"],
  ["cnss", "Numéro CNSS"],
  ["patente", "Taxe professionnelle (patente)"],
  ["legalForm", "Forme juridique"],
  ["city", "Ville"],
] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number][0];

/** Champ de la fiche client correspondant à chaque rubrique de la signalétique. */
export const CLIENT_FIELD: Record<IdentityField, string> = {
  ice: "ice",
  rc: "rc",
  commercialCourt: "commercialCourt",
  fiscalId: "fiscalId",
  cnss: "cnssNumber",
  patente: "patente",
  legalForm: "legalForm",
  city: "city",
};

export interface IdentityCheck {
  field: IdentityField;
  labelFr: string;
  report: string;
  client: string;
  status: "IDENTIQUE" | "MANQUANT_FICHE" | "DIFFERENT";
}

const canon = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+(?=\d)/, "");

/** Compare la signalétique lue sur un rapport à la fiche du client. */
export function compareIdentity(report: Partial<Record<IdentityField, string>>, client: Partial<Record<IdentityField, string | null>>): IdentityCheck[] {
  return IDENTITY_FIELDS.flatMap(([field, labelFr]) => {
    const r = (report[field] ?? "").trim();
    if (!r) return [];
    const c = (client[field] ?? "").trim();
    const status: IdentityCheck["status"] = !c ? "MANQUANT_FICHE" : canon(r) === canon(c) ? "IDENTIQUE" : "DIFFERENT";
    return [{ field, labelFr, report: r, client: c, status }];
  });
}

// --- Champs corrigibles ---------------------------------------------------------------------

const LINE_FIELDS: Record<string, FieldSpec> = {
  institution: { kind: "text", labelFr: "Établissement" },
  type: { kind: "text", labelFr: "Type de crédit" },
  authorized: { kind: "number", labelFr: "Autorisé" },
  outstanding: { kind: "number", labelFr: "Encours" },
  overdue: { kind: "number", labelFr: "Impayé" },
  overdueDays: { kind: "number", labelFr: "Ancienneté de l'impayé (jours)" },
  unpaidInstallments: { kind: "number", labelFr: "Échéances impayées" },
  status: { kind: "enum", labelFr: "Statut", options: LINE_STATUSES, optionLabels: LINE_STATUS_LABELS },
  ownBank: { kind: "boolean", labelFr: "Ligne de la banque" },
};
const INCIDENT_FIELDS: Record<string, FieldSpec> = {
  regularized: { kind: "boolean", labelFr: "Régularisé" },
  amount: { kind: "number", labelFr: "Montant" },
  date: { kind: "date", labelFr: "Date" },
  kind: { kind: "enum", labelFr: "Nature", options: INCIDENT_KINDS, optionLabels: INCIDENT_LABELS },
};
const IDENTITY_SPECS: Record<string, FieldSpec> = Object.fromEntries(IDENTITY_FIELDS.map(([f, l]) => [f, { kind: "text", labelFr: l } as FieldSpec]));

/** Champs d'un rapport de solvabilité que l'analyste peut corriger, avec motif. */
export function reportFieldSpec(path: string): FieldSpec | null {
  const m = /^(lines|incidents)\.(\d+)\.([A-Za-z]+)$/.exec(path);
  if (m) {
    const spec = (m[1] === "lines" ? LINE_FIELDS : INCIDENT_FIELDS)[m[3]];
    return spec ? { ...spec, labelFr: `${m[1] === "lines" ? "Ligne" : "Incident"} ${Number(m[2]) + 1} — ${spec.labelFr}` } : null;
  }
  const id = /^identity\.([A-Za-z]+)$/.exec(path);
  if (id) return IDENTITY_SPECS[id[1]] ? { ...IDENTITY_SPECS[id[1]], labelFr: `Signalétique — ${IDENTITY_SPECS[id[1]].labelFr}` } : null;
  if (path === "inquiries12m") return { kind: "number", labelFr: "Consultations sur 12 mois" };
  if (path === "score") return { kind: "text", labelFr: "Score du bureau" };
  return null;
}

export const REPORT_LINE_FIELDS = LINE_FIELDS;
export const REPORT_INCIDENT_FIELDS = INCIDENT_FIELDS;
