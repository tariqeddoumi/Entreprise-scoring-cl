import { parseRefItems, type RefItem } from "./case-purposes";

/**
 * Listes de saisie paramétrables (Administration › Paramétrage) : en saisie
 * manuelle, la fiche client et les lignes d'engagement se remplissent par
 * listes déroulantes, pour figer les valeurs et permettre le rapprochement
 * avec T24. Les codes sont à aligner sur ceux de T24 par la banque.
 *
 * Forme juridique et secteur : le CODE est enregistré (comparé tel quel à
 * T24). Ville, tribunal de commerce, garanties : le LIBELLÉ est enregistré
 * (texte lisible, comparé sans accents ni casse).
 */

export const LEGAL_FORMS_KEY = "ENTRY_LEGAL_FORMS";
export const SECTORS_KEY = "ENTRY_SECTORS";
export const CITIES_KEY = "ENTRY_CITIES";
export const COMMERCIAL_COURTS_KEY = "ENTRY_COMMERCIAL_COURTS";
export const GUARANTEE_TYPES_KEY = "ENTRY_GUARANTEE_TYPES";

export const ENTRY_LIST_KEYS = [LEGAL_FORMS_KEY, SECTORS_KEY, CITIES_KEY, COMMERCIAL_COURTS_KEY, GUARANTEE_TYPES_KEY] as const;
export type EntryListKey = (typeof ENTRY_LIST_KEYS)[number];

/** Listes dont le code est enregistré dans la fiche (et non le libellé). */
export const CODE_STORED: ReadonlySet<EntryListKey> = new Set([LEGAL_FORMS_KEY, SECTORS_KEY]);

const item = (code: string, labelFr: string): RefItem => ({ code, labelFr, active: true });

export const DEFAULT_LEGAL_FORMS: RefItem[] = [
  item("SA", "Société anonyme (SA)"),
  item("SARL", "Société à responsabilité limitée (SARL)"),
  item("SARL_AU", "SARL à associé unique (SARL AU)"),
  item("SAS", "Société par actions simplifiée (SAS)"),
  item("SNC", "Société en nom collectif (SNC)"),
  item("SCS", "Société en commandite simple (SCS)"),
  item("SCA", "Société en commandite par actions (SCA)"),
  item("GIE", "Groupement d'intérêt économique (GIE)"),
  item("COOP", "Coopérative"),
  item("EI", "Entreprise individuelle"),
  item("EP", "Établissement ou entreprise publique"),
  item("SUCCURSALE", "Succursale de société étrangère"),
];

/** Sections de la nomenclature marocaine des activités (NMAE 2010). */
export const DEFAULT_SECTORS: RefItem[] = [
  item("NMAE_A", "A — Agriculture, sylviculture et pêche"),
  item("NMAE_B", "B — Industries extractives"),
  item("NMAE_C", "C — Industrie manufacturière"),
  item("NMAE_D", "D — Électricité, gaz, vapeur et air conditionné"),
  item("NMAE_E", "E — Eau, assainissement, gestion des déchets"),
  item("NMAE_F", "F — Construction"),
  item("NMAE_G", "G — Commerce, réparation d'automobiles et de motocycles"),
  item("NMAE_H", "H — Transports et entreposage"),
  item("NMAE_I", "I — Hébergement et restauration"),
  item("NMAE_J", "J — Information et communication"),
  item("NMAE_K", "K — Activités financières et d'assurance"),
  item("NMAE_L", "L — Activités immobilières"),
  item("NMAE_M", "M — Activités spécialisées, scientifiques et techniques"),
  item("NMAE_N", "N — Activités de services administratifs et de soutien"),
  item("NMAE_P", "P — Enseignement"),
  item("NMAE_Q", "Q — Santé humaine et action sociale"),
  item("NMAE_R", "R — Arts, spectacles et activités récréatives"),
  item("NMAE_S", "S — Autres activités de services"),
];

export const DEFAULT_CITIES: RefItem[] = [
  "Casablanca",
  "Rabat",
  "Salé",
  "Kénitra",
  "Tanger",
  "Tétouan",
  "Fès",
  "Meknès",
  "Marrakech",
  "Agadir",
  "Oujda",
  "Nador",
  "El Jadida",
  "Safi",
  "Béni Mellal",
  "Laâyoune",
  "Dakhla",
  "Mohammedia",
  "Settat",
  "Khouribga",
].map((c) => item(c.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_"), c));

export const DEFAULT_COMMERCIAL_COURTS: RefItem[] = ["Casablanca", "Rabat", "Fès", "Marrakech", "Tanger", "Agadir", "Oujda", "Meknès"].map((c) =>
  item(`TC_${c.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()}`, `Tribunal de commerce de ${c}`)
);

export const DEFAULT_GUARANTEE_TYPES: RefItem[] = [
  item("HYPOTHEQUE", "Hypothèque"),
  item("NANT_FDC", "Nantissement du fonds de commerce"),
  item("NANT_MATERIEL", "Nantissement du matériel"),
  item("NANT_TITRES", "Nantissement de titres ou de dépôts"),
  item("CAUTION_PERSO", "Caution personnelle des dirigeants"),
  item("CAUTION_SOLIDAIRE", "Caution solidaire d'une société"),
  item("TAMWILCOM", "Garantie Tamwilcom"),
  item("DELEG_ASSURANCE", "Délégation d'assurance"),
  item("DOMICILIATION", "Domiciliation de flux ou de marchés"),
  item("AUCUNE", "Sans garantie"),
];

export const ENTRY_LIST_DEFAULTS: Record<EntryListKey, RefItem[]> = {
  [LEGAL_FORMS_KEY]: DEFAULT_LEGAL_FORMS,
  [SECTORS_KEY]: DEFAULT_SECTORS,
  [CITIES_KEY]: DEFAULT_CITIES,
  [COMMERCIAL_COURTS_KEY]: DEFAULT_COMMERCIAL_COURTS,
  [GUARANTEE_TYPES_KEY]: DEFAULT_GUARANTEE_TYPES,
};

export const ENTRY_LIST_TITLES: Record<EntryListKey, string> = {
  [LEGAL_FORMS_KEY]: "Formes juridiques",
  [SECTORS_KEY]: "Secteurs d'activité",
  [CITIES_KEY]: "Villes",
  [COMMERCIAL_COURTS_KEY]: "Tribunaux de commerce",
  [GUARANTEE_TYPES_KEY]: "Types de garantie",
};

export interface EntryLists {
  legalForms: RefItem[];
  sectors: RefItem[];
  cities: RefItem[];
  commercialCourts: RefItem[];
  guaranteeTypes: RefItem[];
}

export function parseEntryLists(raw: Partial<Record<EntryListKey, string | null | undefined>>): EntryLists {
  const p = (k: EntryListKey) => parseRefItems(raw[k], ENTRY_LIST_DEFAULTS[k]);
  return {
    legalForms: p(LEGAL_FORMS_KEY),
    sectors: p(SECTORS_KEY),
    cities: p(CITIES_KEY),
    commercialCourts: p(COMMERCIAL_COURTS_KEY),
    guaranteeTypes: p(GUARANTEE_TYPES_KEY),
  };
}

/** Comparaison tolérante : sans accents, casse, ponctuation ni espaces. */
export function canonText(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/**
 * Contrôle d'une saisie manuelle contre les listes : forme juridique et
 * secteur parmi les codes actifs, ville parmi les libellés actifs. Une valeur
 * déjà présente sur la fiche (`previous`) reste admise en modification.
 */
export function checkAgainstLists(
  e: { legalForm?: string | null; sectorCode?: string | null; city?: string | null },
  lists: EntryLists,
  previous: { legalForm?: string | null; sectorCode?: string | null; city?: string | null } = {}
): string[] {
  const issues: string[] = [];
  const active = (l: RefItem[]) => l.filter((x) => x.active);
  if (e.legalForm && e.legalForm !== previous.legalForm && !active(lists.legalForms).some((x) => x.code === e.legalForm))
    issues.push("Forme juridique : choisissez une valeur de la liste.");
  if (e.sectorCode && e.sectorCode !== previous.sectorCode && !active(lists.sectors).some((x) => x.code === e.sectorCode))
    issues.push("Secteur d'activité : choisissez une valeur de la liste.");
  if (e.city && e.city !== previous.city && !active(lists.cities).some((x) => canonText(x.labelFr) === canonText(e.city)))
    issues.push("Ville : choisissez une valeur de la liste.");
  return issues;
}

/** Libellé d'un code de liste (affichage), le code lui-même s'il est inconnu. */
export function labelOf(list: RefItem[], code: string | null | undefined): string {
  if (!code) return "";
  return list.find((x) => x.code === code)?.labelFr ?? code;
}

/**
 * Valeur d'une liste correspondant à un texte libre (lecture OCR, T24) :
 * code ou libellé identiques sans accents ni ponctuation, ou code entre
 * parenthèses dans le libellé (« Société anonyme (SA) »). Rien sinon.
 */
export function matchOption(list: RefItem[], raw: string | null | undefined, stored: "code" | "label" = "code"): string | null {
  const c = canonText(raw);
  if (!c) return null;
  const hit = list
    .filter((x) => x.active)
    .find(
      (x) =>
        canonText(x.code) === c ||
        canonText(x.labelFr) === c ||
        canonText(x.labelFr.replace(/\s*\([^)]*\)\s*$/, "")) === c ||
        canonText(x.labelFr.match(/\(([^)]+)\)\s*$/)?.[1]) === c
    );
  return hit ? (stored === "code" ? hit.code : hit.labelFr) : null;
}
