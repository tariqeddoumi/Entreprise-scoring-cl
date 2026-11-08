/**
 * Rapport de solvabilité du crédit bureau (Creditinfo Maroc, Quantik Maroc,
 * délégataires de Bank Al-Maghrib). La circulaire 1/G/2010 impose de le
 * consulter avant tout octroi.
 *
 * Le rapport arrive soit par API (base des rapports du crédit bureau), soit lu
 * par l'IA dans un PDF ou une image, vérifié par l'analyste. Ce module, pur,
 * contrôle son contenu, mesure son ancienneté depuis sa DATE DE MISE À JOUR
 * (pas sa date de chargement) et en tire des constats et des signaux de
 * critères BAM à vérifier. Le rafraîchissement du rapport se fait dans l'outil
 * du crédit bureau, hors de l'outil de notation.
 */

export type Bureau = "CREDITINFO" | "QUANTIK" | "AUTRE";
export type ReportSource = "API" | "DOCUMENT" | "SAISIE";

export const BUREAU_LABELS: Record<Bureau, string> = { CREDITINFO: "Creditinfo Maroc", QUANTIK: "Quantik Maroc", AUTRE: "Autre" };
export const SOURCE_LABELS: Record<ReportSource, string> = { API: "API du crédit bureau", DOCUMENT: "Lu par l'IA (document)", SAISIE: "Saisi" };

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
}

export interface CreditIncident {
  date: string;
  kind: IncidentKind;
  institution: string;
  amount: number | null;
  regularized: boolean;
  labelFr: string;
}

export interface CreditReportData {
  companyName: string;
  ice: string;
  currency: string;
  lines: CreditLine[];
  incidents: CreditIncident[];
  /** Consultations du rapport par des établissements sur 12 mois (si fourni). */
  inquiries12m: number | null;
  /** Score du crédit bureau, tel qu'imprimé. */
  score: string;
}

export const EMPTY_REPORT: CreditReportData = { companyName: "", ice: "", currency: "MAD", lines: [], incidents: [], inquiries12m: null, score: "" };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const isoOr = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

/** Lecture tolérante d'un contenu JSON (API, IA ou formulaire) ; les valeurs inconnues sont neutralisées. */
export function normalizeReport(raw: unknown): CreditReportData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 200).map((l): CreditLine => {
    const x = (l ?? {}) as Record<string, unknown>;
    const status = str(x.status, 20).toUpperCase();
    return {
      institution: str(x.institution, 120),
      ownBank: x.ownBank === true || x.ownBank === "true",
      type: str(x.type, 120),
      authorized: num(x.authorized),
      outstanding: num(x.outstanding),
      overdue: num(x.overdue),
      overdueDays: num(x.overdueDays),
      status: (LINE_STATUSES as readonly string[]).includes(status) ? (status as LineStatus) : "EN_COURS",
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
  return {
    companyName: str(o.companyName, 300),
    ice: str(o.ice, 20).replace(/\s/g, ""),
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
    if (!l.institution) issues.push(`Ligne ${i + 1} : établissement requis.`);
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

/** Schéma JSON de l'extraction par l'IA (même structure que l'API). */
export const REPORT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bureau", "reportDate", "reference", "companyName", "ice", "currency", "lines", "incidents", "inquiries12m", "score"],
  properties: {
    bureau: { type: "string", enum: ["CREDITINFO", "QUANTIK", "AUTRE"] },
    reportDate: { type: "string" },
    reference: { type: "string" },
    companyName: { type: "string" },
    ice: { type: "string" },
    currency: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["institution", "ownBank", "type", "authorized", "outstanding", "overdue", "overdueDays", "status"],
        properties: {
          institution: { type: "string" },
          ownBank: { type: "boolean" },
          type: { type: "string" },
          authorized: { type: ["number", "null"] },
          outstanding: { type: ["number", "null"] },
          overdue: { type: ["number", "null"] },
          overdueDays: { type: ["number", "null"] },
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
          date: { type: "string" },
          kind: { type: "string", enum: [...INCIDENT_KINDS] },
          institution: { type: "string" },
          amount: { type: ["number", "null"] },
          regularized: { type: "boolean" },
          labelFr: { type: "string" },
        },
      },
    },
    inquiries12m: { type: ["number", "null"] },
    score: { type: "string" },
  },
} as const;
