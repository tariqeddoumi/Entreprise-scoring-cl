/**
 * Fiche juridique du client : identité légale, dirigeants, actionnaires,
 * bénéficiaires effectifs, groupe et filiales, comptes déposés, score et
 * événements légaux.
 *
 * Source principale : rapport InfoRisque (Inforisk, charika.ma, membre du
 * réseau Dun & Bradstreet), lu par l'OCR intelligent dans le PDF puis vérifié ; à défaut
 * T24 ou la saisie. Selon le rapport commandé (Express, Gold, Platinium,
 * Ultimate), certaines rubriques peuvent manquer : elles restent vides, rien
 * n'est inventé.
 *
 * Exploitation dans l'outil (règles pures, testées) :
 *  - contrôle d'identité : raison sociale, ICE, RC, forme juridique comparés à
 *    la fiche (T24 ou saisie) ;
 *  - contrôle des comptes : chiffre d'affaires, résultat net et capitaux
 *    propres déposés au greffe (OMPIC) comparés au bilan remis à la banque ;
 *  - événements légaux : redressement judiciaire, liquidation, dissolution →
 *    critères BAM à vérifier (E15, E28) ; changement de dirigeant ou cession
 *    de parts récents → S14 ;
 *  - ancienneté de l'entreprise (moins de trois ans : jeune entreprise),
 *    réduction de capital, bénéficiaires effectifs non identifiés (KYC),
 *    groupe d'appartenance (à rapprocher du groupe d'affaires).
 */

import { parseAmountLoose, type FieldSpec } from "./corrections";

export type ProfileSource = "INFORISK" | "T24" | "SAISIE";
export const PROFILE_SOURCE_LABELS: Record<ProfileSource, string> = { INFORISK: "Rapport InfoRisque", T24: "T24", SAISIE: "Saisie" };

export const LEGAL_EVENT_KINDS = [
  "CREATION",
  "AUGMENTATION_CAPITAL",
  "REDUCTION_CAPITAL",
  "CHANGEMENT_DIRIGEANT",
  "CESSION_PARTS",
  "TRANSFERT_SIEGE",
  "SAUVEGARDE",
  "REDRESSEMENT",
  "LIQUIDATION",
  "DISSOLUTION",
  "RADIATION",
  "AUTRE",
] as const;
export type LegalEventKind = (typeof LEGAL_EVENT_KINDS)[number];
export const LEGAL_EVENT_LABELS: Record<LegalEventKind, string> = {
  CREATION: "Création",
  AUGMENTATION_CAPITAL: "Augmentation de capital",
  REDUCTION_CAPITAL: "Réduction de capital",
  CHANGEMENT_DIRIGEANT: "Changement de dirigeant",
  CESSION_PARTS: "Cession de parts ou d'actions",
  TRANSFERT_SIEGE: "Transfert de siège",
  SAUVEGARDE: "Procédure de sauvegarde",
  REDRESSEMENT: "Redressement judiciaire",
  LIQUIDATION: "Liquidation judiciaire",
  DISSOLUTION: "Dissolution",
  RADIATION: "Radiation",
  AUTRE: "Autre annonce légale",
};

export interface Person {
  name: string;
  role: string;
  since: string;
}
export interface Holder {
  name: string;
  pct: number | null;
  kind: "PERSONNE" | "SOCIETE" | "";
}
export interface DepositedAccounts {
  year: string;
  revenue: number | null;
  netIncome: number | null;
  equity: number | null;
  totalAssets: number | null;
}
export interface LegalEvent {
  date: string;
  kind: LegalEventKind;
  labelFr: string;
  /** Événement levé par une correction motivée (information qui n'a plus cours). */
  resolved: boolean;
}

export interface LegalProfile {
  source: ProfileSource;
  /** Date du rapport (InfoRisque) ou de la synchronisation (T24). */
  reportDate: string;
  documentName?: string;
  documentSha256?: string;
  recordedBy?: string;
  /** Rapport historisé (legal_reports) dont cette fiche est la vue corrigée. */
  reportId?: string;
  identity: {
    name: string;
    legalForm: string;
    ice: string;
    rc: string;
    /** Tribunal de commerce qui tient le RC. */
    commercialCourt: string;
    fiscalId: string;
    cnss: string;
    patente: string;
    capital: number | null;
    creationDate: string;
    address: string;
    city: string;
    activity: string;
    headcount: number | null;
    status: string;
  };
  managers: Person[];
  shareholders: Holder[];
  beneficialOwners: Holder[];
  group: { name: string; parent: string };
  subsidiaries: Holder[];
  financials: DepositedAccounts[];
  score: { value: string; labelFr: string };
  paymentBehaviour: string;
  legalEvents: LegalEvent[];
}

const num = (v: unknown): number | null => parseAmountLoose(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const iso = (v: unknown) => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};
const arr = (v: unknown, max = 50) => (Array.isArray(v) ? v.slice(0, max) : []).map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
const holder = (x: Record<string, unknown>): Holder => {
  const kind = str(x.kind, 10).toUpperCase();
  return { name: str(x.name, 200), pct: num(x.pct), kind: kind === "PERSONNE" || kind === "SOCIETE" ? kind : "" };
};

/** Lecture tolérante (IA, formulaire, base) ; ce qui est inconnu est neutralisé. */
export function normalizeProfile(raw: unknown, source: ProfileSource = "INFORISK"): LegalProfile {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = (o.identity && typeof o.identity === "object" ? o.identity : {}) as Record<string, unknown>;
  const g = (o.group && typeof o.group === "object" ? o.group : {}) as Record<string, unknown>;
  const sc = (o.score && typeof o.score === "object" ? o.score : {}) as Record<string, unknown>;
  const src = str(o.source, 10).toUpperCase();
  return {
    source: src === "INFORISK" || src === "T24" || src === "SAISIE" ? (src as ProfileSource) : source,
    reportDate: iso(o.reportDate),
    ...(o.documentName ? { documentName: str(o.documentName, 200) } : {}),
    ...(o.documentSha256 ? { documentSha256: str(o.documentSha256, 64) } : {}),
    ...(o.recordedBy ? { recordedBy: str(o.recordedBy, 80) } : {}),
    ...(o.reportId ? { reportId: str(o.reportId, 40) } : {}),
    identity: {
      name: str(id.name, 300),
      legalForm: str(id.legalForm, 60),
      ice: str(id.ice, 20).replace(/\s/g, ""),
      rc: str(id.rc, 30),
      commercialCourt: str(id.commercialCourt, 80),
      fiscalId: str(id.fiscalId, 30).replace(/\s/g, ""),
      cnss: str(id.cnss, 30).replace(/\s/g, ""),
      patente: str(id.patente, 30).replace(/\s/g, ""),
      capital: num(id.capital),
      creationDate: iso(id.creationDate),
      address: str(id.address, 300),
      city: str(id.city, 80),
      activity: str(id.activity, 300),
      headcount: num(id.headcount),
      status: str(id.status, 60),
    },
    managers: arr(o.managers).map((x) => ({ name: str(x.name), role: str(x.role, 80), since: iso(x.since) })),
    shareholders: arr(o.shareholders).map(holder),
    beneficialOwners: arr(o.beneficialOwners).map(holder),
    group: { name: str(g.name), parent: str(g.parent) },
    subsidiaries: arr(o.subsidiaries).map(holder),
    financials: arr(o.financials, 10)
      .map((x) => ({ year: str(x.year, 4), revenue: num(x.revenue), netIncome: num(x.netIncome), equity: num(x.equity), totalAssets: num(x.totalAssets) }))
      .filter((f) => /^\d{4}$/.test(f.year))
      .sort((a, b) => b.year.localeCompare(a.year)),
    score: { value: str(sc.value, 40), labelFr: str(sc.labelFr, 120) },
    paymentBehaviour: str(o.paymentBehaviour, 300),
    legalEvents: arr(o.legalEvents, 100)
      .map((x) => {
        const k = str(x.kind, 30).toUpperCase();
        return { date: iso(x.date), kind: ((LEGAL_EVENT_KINDS as readonly string[]).includes(k) ? k : "AUTRE") as LegalEventKind, labelFr: str(x.labelFr, 300), resolved: x.resolved === true };
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function parseProfile(raw: string | null | undefined): LegalProfile | null {
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function checkProfile(p: LegalProfile, today: string): string[] {
  const issues: string[] = [];
  if (!p.reportDate) issues.push("Date du rapport requise.");
  else if (p.reportDate > today) issues.push("La date du rapport ne peut pas être future.");
  const pct = p.shareholders.reduce((s, h) => s + (h.pct ?? 0), 0);
  if (pct > 100.5) issues.push(`Actionnariat : total de ${Math.round(pct)} %, supérieur à 100 %.`);
  for (const h of [...p.shareholders, ...p.beneficialOwners]) if (h.pct !== null && (h.pct < 0 || h.pct > 100)) issues.push(`${h.name} : pourcentage hors de 0 à 100.`);
  return issues;
}

/** Signaux de critères BAM à vérifier. */
export const LEGAL_SIGNALS = {
  LEGAL_REDRESSEMENT: "Redressement judiciaire publié",
  LEGAL_LIQUIDATION: "Liquidation, dissolution ou radiation publiée",
  LEGAL_DIRIGEANTS: "Changement de dirigeant ou d'actionnaire récent",
} as const;
export type LegalSignal = keyof typeof LEGAL_SIGNALS;

export interface ProfileFinding {
  level: "INFO" | "ATTENTION" | "ALERTE";
  textFr: string;
}

export interface FicheIdentity {
  name: string;
  ice: string | null;
  rc: string | null;
  legalForm: string | null;
}

/** Comptes du bilan remis à la banque (référentiel des bilans du client). */
export interface BankStatement {
  year: string;
  revenue: number | null;
  netIncome: number | null;
  equity: number | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\b(STE|SOCIETE|STE\.|SA|SARL|SARLAU|SARL AU|SAS|SNC)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");

function addYears(iso: string, n: number): string {
  return `${String(Number(iso.slice(0, 4)) + n).padStart(4, "0")}${iso.slice(4)}`;
}

export interface ProfileAnalysis {
  findings: ProfileFinding[];
  signals: LegalSignal[];
  stale: boolean;
  ageDays: number | null;
}

export function analyseProfile(
  p: LegalProfile,
  ctx: { fiche?: FicheIdentity; statements?: BankStatement[]; today: string; maxAgeDays: number; tolerancePct?: number }
): ProfileAnalysis {
  const findings: ProfileFinding[] = [];
  const signals = new Set<LegalSignal>();
  const tol = (ctx.tolerancePct ?? 5) / 100;
  const ageDays = p.reportDate ? Math.round((Date.parse(ctx.today + "T00:00:00Z") - Date.parse(p.reportDate + "T00:00:00Z")) / 86_400_000) : null;
  const stale = ageDays !== null && ageDays > ctx.maxAgeDays;
  if (stale) findings.push({ level: "ATTENTION", textFr: `Fiche juridique datée du ${p.reportDate} (${ageDays} jours) : à actualiser.` });

  // Identité.
  const f = ctx.fiche;
  if (f) {
    if (p.identity.ice && f.ice && p.identity.ice !== f.ice.replace(/\s/g, "")) findings.push({ level: "ALERTE", textFr: `ICE différent de la fiche : ${p.identity.ice} (rapport) contre ${f.ice} (fiche).` });
    if (p.identity.rc && f.rc && norm(p.identity.rc) !== norm(f.rc)) findings.push({ level: "ATTENTION", textFr: `Registre de commerce différent : ${p.identity.rc} (rapport) contre ${f.rc} (fiche).` });
    if (p.identity.name && f.name && norm(p.identity.name) !== norm(f.name)) findings.push({ level: "ATTENTION", textFr: `Raison sociale différente : « ${p.identity.name} » (rapport) contre « ${f.name} » (fiche).` });
    const lf = (x: string) => x.replace(/[\s.]/g, "").toUpperCase();
    if (p.identity.legalForm && f.legalForm && lf(p.identity.legalForm) !== lf(f.legalForm))
      findings.push({ level: "INFO", textFr: `Forme juridique : ${p.identity.legalForm} (rapport) contre ${f.legalForm} (fiche).` });
  }

  // Ancienneté.
  if (p.identity.creationDate) {
    if (addYears(p.identity.creationDate, 3) > ctx.today) findings.push({ level: "ATTENTION", textFr: `Jeune entreprise : créée le ${p.identity.creationDate}, moins de trois ans d'existence.` });
  }
  if (p.identity.status && /radi|liquid|dissou|cess/i.test(p.identity.status)) {
    signals.add("LEGAL_LIQUIDATION");
    findings.push({ level: "ALERTE", textFr: `Statut légal : ${p.identity.status}.` });
  }

  // Événements légaux.
  const recent = addYears(ctx.today, -1);
  for (const e of p.legalEvents) {
    const label = `${LEGAL_EVENT_LABELS[e.kind]}${e.date ? ` (${e.date})` : ""}${e.labelFr ? ` : ${e.labelFr}` : ""}`;
    if (e.resolved) {
      if (["REDRESSEMENT", "LIQUIDATION", "DISSOLUTION", "RADIATION", "SAUVEGARDE", "CHANGEMENT_DIRIGEANT", "CESSION_PARTS", "REDUCTION_CAPITAL"].includes(e.kind))
        findings.push({ level: "INFO", textFr: `${label} : levé par une correction motivée, sans effet.` });
      continue;
    }
    if (e.kind === "REDRESSEMENT") {
      signals.add("LEGAL_REDRESSEMENT");
      findings.push({ level: "ALERTE", textFr: `${label}. Critère E15 à vérifier.` });
    } else if (e.kind === "LIQUIDATION" || e.kind === "DISSOLUTION" || e.kind === "RADIATION") {
      signals.add("LEGAL_LIQUIDATION");
      findings.push({ level: "ALERTE", textFr: `${label}. Critère E28 à vérifier.` });
    } else if (e.kind === "SAUVEGARDE") {
      findings.push({ level: "ALERTE", textFr: `${label} : difficultés reconnues, à apprécier par la contre-étude.` });
    } else if ((e.kind === "CHANGEMENT_DIRIGEANT" || e.kind === "CESSION_PARTS") && e.date >= recent) {
      signals.add("LEGAL_DIRIGEANTS");
      findings.push({ level: "ATTENTION", textFr: `${label}, moins d'un an. Critère S14 à vérifier.` });
    } else if (e.kind === "REDUCTION_CAPITAL" && e.date >= addYears(ctx.today, -3)) {
      findings.push({ level: "ATTENTION", textFr: `${label} : vérifier la situation nette (critère E25).` });
    }
  }

  // Actionnariat et bénéficiaires effectifs.
  if (!p.beneficialOwners.length && p.source === "INFORISK") findings.push({ level: "ATTENTION", textFr: "Bénéficiaires effectifs non renseignés : à obtenir (connaissance client)." });
  if (p.group.name || p.group.parent) findings.push({ level: "INFO", textFr: `Groupe d'appartenance : ${[p.group.name, p.group.parent].filter(Boolean).join(", maison mère ")}. À rapprocher du groupe d'affaires.` });

  // Comptes déposés contre bilan remis à la banque.
  for (const s of ctx.statements ?? []) {
    const d = p.financials.find((x) => x.year === s.year);
    if (!d) continue;
    const gaps: string[] = [];
    for (const [label, a, b] of [
      ["chiffre d'affaires", d.revenue, s.revenue],
      ["résultat net", d.netIncome, s.netIncome],
      ["capitaux propres", d.equity, s.equity],
    ] as const) {
      if (a === null || b === null) continue;
      const base = Math.max(Math.abs(a), Math.abs(b), 1);
      if (Math.abs(a - b) / base > tol) gaps.push(`${label} ${fmt(b)} (banque) contre ${fmt(a)} (greffe)`);
    }
    if (gaps.length) findings.push({ level: "ALERTE", textFr: `Exercice ${s.year} : bilan remis à la banque différent des comptes déposés au greffe — ${gaps.join(" ; ")}.` });
    else findings.push({ level: "INFO", textFr: `Exercice ${s.year} : bilan cohérent avec les comptes déposés au greffe.` });
  }
  if (p.score.value) findings.push({ level: "INFO", textFr: `Score InfoRisque : ${p.score.value}${p.score.labelFr ? ` (${p.score.labelFr})` : ""}.` });
  return { findings, signals: [...signals], stale, ageDays };
}

function fmt(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
}

const holderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "pct", "kind"],
  properties: { name: { type: "string" }, pct: { type: ["number", "null"] }, kind: { type: "string", enum: ["PERSONNE", "SOCIETE", ""] } },
} as const;

/** Schéma JSON de l'extraction par l'OCR intelligent d'un rapport InfoRisque. */
export const PROFILE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reportDate", "identity", "managers", "shareholders", "beneficialOwners", "group", "subsidiaries", "financials", "score", "paymentBehaviour", "legalEvents"],
  properties: {
    reportDate: { type: "string" },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["name", "legalForm", "ice", "rc", "commercialCourt", "fiscalId", "cnss", "patente", "capital", "creationDate", "address", "city", "activity", "headcount", "status"],
      properties: {
        name: { type: "string" },
        legalForm: { type: "string" },
        ice: { type: "string" },
        rc: { type: "string" },
        commercialCourt: { type: "string" },
        fiscalId: { type: "string" },
        cnss: { type: "string" },
        patente: { type: "string" },
        capital: { type: ["number", "null"] },
        creationDate: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        activity: { type: "string" },
        headcount: { type: ["number", "null"] },
        status: { type: "string" },
      },
    },
    managers: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "role", "since"], properties: { name: { type: "string" }, role: { type: "string" }, since: { type: "string" } } },
    },
    shareholders: { type: "array", items: holderSchema },
    beneficialOwners: { type: "array", items: holderSchema },
    group: { type: "object", additionalProperties: false, required: ["name", "parent"], properties: { name: { type: "string" }, parent: { type: "string" } } },
    subsidiaries: { type: "array", items: holderSchema },
    financials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["year", "revenue", "netIncome", "equity", "totalAssets"],
        properties: {
          year: { type: "string" },
          revenue: { type: ["number", "null"] },
          netIncome: { type: ["number", "null"] },
          equity: { type: ["number", "null"] },
          totalAssets: { type: ["number", "null"] },
        },
      },
    },
    score: { type: "object", additionalProperties: false, required: ["value", "labelFr"], properties: { value: { type: "string" }, labelFr: { type: "string" } } },
    paymentBehaviour: { type: "string" },
    legalEvents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "kind", "labelFr"],
        properties: { date: { type: "string" }, kind: { type: "string", enum: [...LEGAL_EVENT_KINDS] }, labelFr: { type: "string" } },
      },
    },
  },
} as const;

// --- Champs corrigibles --------------------------------------------------------------------

const PROFILE_IDENTITY_SPECS: Record<string, FieldSpec> = {
  name: { kind: "text", labelFr: "Raison sociale" },
  legalForm: { kind: "text", labelFr: "Forme juridique" },
  ice: { kind: "text", labelFr: "ICE" },
  rc: { kind: "text", labelFr: "Registre de commerce" },
  commercialCourt: { kind: "text", labelFr: "Tribunal de commerce" },
  fiscalId: { kind: "text", labelFr: "Identifiant fiscal (IF)" },
  cnss: { kind: "text", labelFr: "Numéro CNSS" },
  patente: { kind: "text", labelFr: "Taxe professionnelle (patente)" },
  capital: { kind: "number", labelFr: "Capital social" },
  creationDate: { kind: "date", labelFr: "Date de création" },
  city: { kind: "text", labelFr: "Ville" },
  status: { kind: "text", labelFr: "Statut légal" },
};
const DEPOSIT_SPECS: Record<string, FieldSpec> = {
  revenue: { kind: "number", labelFr: "Chiffre d'affaires déposé" },
  netIncome: { kind: "number", labelFr: "Résultat net déposé", allowNegative: true },
  equity: { kind: "number", labelFr: "Capitaux propres déposés", allowNegative: true },
  totalAssets: { kind: "number", labelFr: "Total du bilan déposé" },
};

/** Champs d'une fiche InfoRisque que l'analyste peut corriger, avec motif. */
export function profileFieldSpec(path: string): FieldSpec | null {
  const id = /^identity\.([A-Za-z]+)$/.exec(path);
  if (id) {
    const sp = PROFILE_IDENTITY_SPECS[id[1]];
    return sp ? { ...sp, labelFr: `Identité — ${sp.labelFr}` } : null;
  }
  const ev = /^legalEvents\.(\d+)\.(resolved|date)$/.exec(path);
  if (ev) return ev[2] === "resolved" ? { kind: "boolean", labelFr: `Événement ${Number(ev[1]) + 1} — levé (n'a plus cours)` } : { kind: "date", labelFr: `Événement ${Number(ev[1]) + 1} — date` };
  const fin = /^financials\.(\d+)\.([A-Za-z]+)$/.exec(path);
  if (fin && DEPOSIT_SPECS[fin[2]]) return { ...DEPOSIT_SPECS[fin[2]], labelFr: `Comptes déposés ${Number(fin[1]) + 1} — ${DEPOSIT_SPECS[fin[2]].labelFr}` };
  if (path === "score.value") return { kind: "text", labelFr: "Score InfoRisque" };
  if (path === "paymentBehaviour") return { kind: "text", labelFr: "Comportement de paiement" };
  return null;
}

export const PROFILE_IDENTITY_FIELDS = PROFILE_IDENTITY_SPECS;
