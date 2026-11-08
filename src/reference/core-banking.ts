/**
 * Référentiel client T24 (Temenos Transact) : code client, correspondance des
 * champs de l'API, saisie minimale de repli. Calculs purs, sans réseau.
 *
 * Deux façons de créer une fiche :
 *  - **T24** : le chargé d'affaires saisit le code client, l'outil rapatrie le
 *    maximum d'informations (signalétique, segment commercial, secteur,
 *    gestionnaire, centre, groupe d'affaires, données juridiques) ;
 *  - **saisie minimale** : client pas encore créé dans T24, ou API T24
 *    indisponible. Seul le minimum nécessaire au processus de notation est
 *    demandé ; la fiche est marquée « en attente de T24 » et se rattache au code
 *    client dès qu'il existe (les données de T24 remplacent alors la saisie).
 *
 * Le code client T24 est l'identifiant numérique de l'application CUSTOMER
 * (1 à 10 chiffres selon le paramétrage de l'installation) ; le nombre de
 * chiffres admis est paramétrable.
 */

export type DataSource = "T24" | "SAISIE";

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  T24: "Rapatriée de T24",
  SAISIE: "Saisie minimale, en attente de T24",
};

export interface T24CodeRule {
  minDigits: number;
  maxDigits: number;
}

export const DEFAULT_T24_CODE_RULE: T24CodeRule = { minDigits: 1, maxDigits: 10 };

/** Code saisi : espaces retirés. Les zéros de tête sont conservés (ils peuvent porter du sens). */
export function normalizeT24Code(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "");
}

export function checkT24Code(code: string, rule: T24CodeRule = DEFAULT_T24_CODE_RULE): string | null {
  if (!code) return "Code client T24 requis.";
  if (!/^\d+$/.test(code)) return "Le code client T24 est numérique.";
  if (code.length < rule.minDigits || code.length > rule.maxDigits)
    return rule.minDigits === rule.maxDigits
      ? `Le code client T24 compte ${rule.minDigits} chiffres.`
      : `Le code client T24 compte de ${rule.minDigits} à ${rule.maxDigits} chiffres.`;
  return null;
}

/** Fiche client telle que rapatriée de T24 (les champs absents de la réponse restent vides). */
export interface CoreBankingCustomer {
  code: string;
  name: string;
  shortName: string;
  legalForm: string;
  ice: string;
  rc: string;
  fiscalId: string;
  sectorCode: string;
  sectorLabel: string;
  commercialSegment: string;
  city: string;
  address: string;
  country: string;
  currency: string;
  accountOfficer: string;
  businessCenterCode: string;
  economicGroupCode: string;
  economicGroupName: string;
  creationDate: string;
  capital: string;
  status: string;
}

export const CUSTOMER_FIELDS = [
  "name",
  "shortName",
  "legalForm",
  "ice",
  "rc",
  "fiscalId",
  "sectorCode",
  "sectorLabel",
  "commercialSegment",
  "city",
  "address",
  "country",
  "currency",
  "accountOfficer",
  "businessCenterCode",
  "economicGroupCode",
  "economicGroupName",
  "creationDate",
  "capital",
  "status",
] as const satisfies ReadonlyArray<keyof CoreBankingCustomer>;

export const CUSTOMER_FIELD_LABELS: Record<(typeof CUSTOMER_FIELDS)[number], string> = {
  name: "Intitulé",
  shortName: "Nom abrégé (mnémonique)",
  legalForm: "Forme juridique",
  ice: "ICE",
  rc: "Registre de commerce",
  fiscalId: "Identifiant fiscal",
  sectorCode: "Secteur d'activité (code)",
  sectorLabel: "Secteur d'activité",
  commercialSegment: "Segment commercial",
  city: "Ville",
  address: "Adresse",
  country: "Pays",
  currency: "Devise",
  accountOfficer: "Gestionnaire (chargé d'affaires)",
  businessCenterCode: "Centre d'affaires (code)",
  economicGroupCode: "Groupe d'affaires (code)",
  economicGroupName: "Groupe d'affaires",
  creationDate: "Date de création",
  capital: "Capital social",
  status: "Statut T24",
};

/**
 * Correspondance des champs : pour chaque champ de la fiche, chemins candidats
 * dans la réponse JSON de T24 (le premier non vide l'emporte). Les noms par
 * défaut suivent l'API Transact (IRIS) « party/customers » ; ils se
 * remplacent par paramétrage selon les champs locaux de la banque
 * (LOCAL.REF pour l'ICE, le RC, le segment commercial…).
 */
export type FieldMap = Record<(typeof CUSTOMER_FIELDS)[number], string[]>;

export const DEFAULT_T24_FIELD_MAP: FieldMap = {
  name: ["body.customerName", "body.0.customerName", "body.names.0.customerName", "body.name1", "customerName", "name"],
  shortName: ["body.shortName", "body.0.shortName", "body.customerMnemonic", "shortName", "mnemonic"],
  legalForm: ["body.legalForm", "body.0.legalForm", "body.legalEntityType", "legalForm"],
  ice: ["body.ice", "body.0.ice", "body.localRefs.ice", "body.legalId", "ice"],
  rc: ["body.registrationNumber", "body.0.registrationNumber", "body.localRefs.rc", "rc"],
  fiscalId: ["body.taxId", "body.0.taxId", "body.localRefs.fiscalId", "fiscalId"],
  sectorCode: ["body.industryId", "body.0.industryId", "body.industry", "sectorCode"],
  sectorLabel: ["body.industryName", "body.0.industryName", "sectorLabel"],
  commercialSegment: ["body.sectorId", "body.0.sectorId", "body.target", "body.localRefs.segment", "commercialSegment"],
  city: ["body.addresses.0.townCountry", "body.0.townCountry", "body.townCountry", "city"],
  address: ["body.addresses.0.street", "body.0.street", "body.street", "address"],
  country: ["body.residenceId", "body.0.residenceId", "body.nationalityId", "country"],
  currency: ["body.currency", "body.0.currency", "currency"],
  accountOfficer: ["body.accountOfficerId", "body.0.accountOfficerId", "accountOfficer"],
  businessCenterCode: ["body.companyBook", "body.0.companyBook", "body.departmentCode", "businessCenterCode"],
  economicGroupCode: ["body.customerGroupId", "body.0.customerGroupId", "body.relationGroup", "economicGroupCode"],
  economicGroupName: ["body.customerGroupName", "body.0.customerGroupName", "economicGroupName"],
  creationDate: ["body.incorporationDate", "body.0.incorporationDate", "body.dateOfIncorporation", "creationDate"],
  capital: ["body.shareCapital", "body.0.shareCapital", "capital"],
  status: ["body.customerStatus", "body.0.customerStatus", "status"],
};

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(k)) cur = cur[Number(k)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Dates T24 (AAAAMMJJ) ramenées au format ISO. */
function isoDate(v: string): string {
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v;
}

export function mapT24Customer(code: string, json: unknown, map: FieldMap = DEFAULT_T24_FIELD_MAP): CoreBankingCustomer {
  const out = { code } as CoreBankingCustomer;
  for (const f of CUSTOMER_FIELDS) {
    let v = "";
    for (const p of map[f] ?? []) {
      v = asText(at(json, p));
      if (v) break;
    }
    out[f] = v.slice(0, 300);
  }
  out.creationDate = isoDate(out.creationDate);
  out.ice = out.ice.replace(/\s/g, "");
  out.country = /^[A-Za-z]{2}$/.test(out.country) ? out.country.toUpperCase() : out.country;
  out.currency = /^[A-Za-z]{3}$/.test(out.currency) ? out.currency.toUpperCase() : "";
  return out;
}

/** Correspondance paramétrée (JSON) : chaque champ connu, une liste de chemins. Invalide : défaut. */
export function parseFieldMap(raw: string | null | undefined): FieldMap {
  if (!raw) return DEFAULT_T24_FIELD_MAP;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...DEFAULT_T24_FIELD_MAP };
    for (const f of CUSTOMER_FIELDS) {
      const paths = v[f];
      if (Array.isArray(paths) && paths.every((p) => typeof p === "string" && /^[\w.]{1,120}$/.test(p))) out[f] = (paths as string[]).slice(0, 10);
    }
    return out;
  } catch {
    return DEFAULT_T24_FIELD_MAP;
  }
}

// --- Fiche de l'outil ---------------------------------------------------------

/** Colonnes de la fiche client alimentées par T24 (T24 fait foi pour celles-ci). */
export interface CounterpartyFromT24 {
  name: string;
  legalForm: string | null;
  ice: string | null;
  rc: string | null;
  fiscalId: string | null;
  sectorCode: string | null;
  commercialSegment: string | null;
  city: string | null;
  country: string | null;
  currency: string | null;
  accountOfficer: string | null;
}

const orNull = (v: string) => (v ? v : null);

export function counterpartyFieldsFromT24(c: CoreBankingCustomer): CounterpartyFromT24 {
  return {
    name: c.name || c.shortName || `Client T24 ${c.code}`,
    legalForm: orNull(c.legalForm.slice(0, 60)),
    ice: orNull(c.ice.slice(0, 20)),
    rc: orNull(c.rc.slice(0, 30)),
    fiscalId: orNull(c.fiscalId.slice(0, 30)),
    sectorCode: orNull(c.sectorCode.slice(0, 30)),
    commercialSegment: orNull(c.commercialSegment.slice(0, 40)),
    city: orNull(c.city.slice(0, 80)),
    country: /^[A-Z]{2}$/.test(c.country) ? c.country : null,
    currency: orNull(c.currency),
    accountOfficer: orNull(c.accountOfficer.slice(0, 40)),
  };
}

export interface FieldChange {
  field: keyof CounterpartyFromT24;
  labelFr: string;
  before: string | null;
  after: string | null;
}

const FROM_T24_LABELS: Record<keyof CounterpartyFromT24, string> = {
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

/**
 * Écarts entre la fiche et T24. Un champ vide dans T24 ne remplace pas une
 * valeur saisie (T24 incomplet ne doit pas effacer la fiche).
 */
export function diffWithT24(current: Partial<Record<keyof CounterpartyFromT24, string | null>>, fromT24: CounterpartyFromT24): FieldChange[] {
  const out: FieldChange[] = [];
  for (const k of Object.keys(FROM_T24_LABELS) as Array<keyof CounterpartyFromT24>) {
    const after = fromT24[k];
    const before = current[k] ?? null;
    if (after === null || after === "" || after === before) continue;
    out.push({ field: k, labelFr: FROM_T24_LABELS[k], before, after });
  }
  return out;
}

// --- Saisie minimale -----------------------------------------------------------------

/**
 * Minimum pour dérouler la notation sans T24 : raison sociale, un identifiant
 * légal (ICE ou RC), forme juridique, secteur d'activité, segment commercial.
 * Le reste viendra de T24 au rattachement.
 */
export interface MinimalEntry {
  name: string;
  ice?: string | null;
  rc?: string | null;
  legalForm?: string | null;
  sectorCode?: string | null;
  commercialSegment?: string | null;
  /** Pays de l'entité ; l'ICE (15 chiffres) n'est contrôlé qu'au Maroc. */
  country?: string | null;
}

export function checkMinimalEntry(e: MinimalEntry): string[] {
  const issues: string[] = [];
  if (!e.name?.trim()) issues.push("Raison sociale requise.");
  if (!e.ice?.trim() && !e.rc?.trim()) issues.push("ICE ou registre de commerce requis.");
  if ((e.country ?? "MA") === "MA" && e.ice?.trim() && !/^\d{15}$/.test(e.ice.replace(/\s/g, ""))) issues.push("L'ICE compte 15 chiffres.");
  if (!e.legalForm?.trim()) issues.push("Forme juridique requise.");
  if (!e.sectorCode?.trim()) issues.push("Secteur d'activité requis.");
  if (!e.commercialSegment?.trim()) issues.push("Segment commercial requis.");
  return issues;
}
