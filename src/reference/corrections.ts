/**
 * Corrections motivées d'un rapport lu (rapport de solvabilité, fiche
 * InfoRisque) : le contenu tel que lu par l'OCR intelligent ou reçu par API
 * reste intact ; chaque correction est un ajout daté, motivé, attribué, avec
 * sa pièce justificative éventuelle. La vue corrigée s'obtient en appliquant
 * les corrections dans l'ordre. Une correction se défait par une nouvelle
 * correction, jamais par suppression.
 */

export type FieldKind = "number" | "text" | "date" | "boolean" | "enum";

export interface FieldSpec {
  kind: FieldKind;
  labelFr: string;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  /** Montant pouvant être négatif (résultat, capitaux propres). */
  allowNegative?: boolean;
}

export interface Correction {
  id: string;
  /** Chemin du champ, ex. « lines.2.overdue », « identity.rc ». */
  path: string;
  labelFr: string;
  before: unknown;
  after: unknown;
  motif: string;
  documentId: string | null;
  documentName: string | null;
  by: string;
  at: string;
}

export const MIN_MOTIF = 10;

export function parseCorrections(raw: string | null | undefined): Correction[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v.filter((c) => c && typeof c === "object" && typeof (c as Correction).path === "string") as Correction[]) : [];
  } catch {
    return [];
  }
}

const SEG = /^(?:[A-Za-z][A-Za-z0-9]*|\d+)$/;

export function getAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Copie profonde avec la valeur remplacée ; un chemin inexistant laisse l'objet inchangé. */
export function setAt<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  if (!keys.every((k) => SEG.test(k)) || keys.some((k) => k === "__proto__" || k === "constructor" || k === "prototype")) return obj;
  const root = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    if (next === null || typeof next !== "object") return obj;
    cur = next as Record<string, unknown>;
  }
  if (!(keys[keys.length - 1] in cur)) return obj;
  cur[keys[keys.length - 1]] = value;
  return root as T;
}

export function applyCorrections<T>(data: T, corrections: Correction[]): T {
  return corrections.reduce((acc, c) => setAt(acc, c.path, c.after), data);
}

/** Valeur saisie convertie selon le type du champ ; message d'erreur sinon. */
export function coerce(spec: FieldSpec, raw: unknown): { ok: true; value: unknown } | { ok: false; errorFr: string } {
  const s = typeof raw === "string" ? raw.trim() : raw;
  switch (spec.kind) {
    case "number": {
      if (s === "" || s === null || s === undefined) return { ok: true, value: null };
      const n = parseAmountLoose(String(s));
      if (n === null) return { ok: false, errorFr: `${spec.labelFr} : montant ou nombre attendu.` };
      if (n < 0 && !spec.allowNegative) return { ok: false, errorFr: `${spec.labelFr} : valeur négative refusée.` };
      return { ok: true, value: n };
    }
    case "boolean":
      if (s === true || s === "true" || s === "oui") return { ok: true, value: true };
      if (s === false || s === "false" || s === "non") return { ok: true, value: false };
      return { ok: false, errorFr: `${spec.labelFr} : oui ou non.` };
    case "date":
      if (s === "") return { ok: true, value: "" };
      return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? { ok: true, value: s } : { ok: false, errorFr: `${spec.labelFr} : date AAAA-MM-JJ.` };
    case "enum":
      return typeof s === "string" && spec.options?.includes(s) ? { ok: true, value: s } : { ok: false, errorFr: `${spec.labelFr} : valeur non admise.` };
    default:
      return typeof s === "string" && s.length <= 300 ? { ok: true, value: s } : { ok: false, errorFr: `${spec.labelFr} : texte de 300 caractères au plus.` };
  }
}

/**
 * Lecture d'un montant quel que soit le format imprimé : « 1 234 567,89 »,
 * « 1.234.567,89 », « 1,234,567.89 », « 1234567 », « 12 500 DH ».
 */
export function parseAmountLoose(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[\s  ]/g, "").replace(/(MAD|DH|DHS|Dhs|MDH|€|EUR)$/i, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-+]/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Le dernier séparateur est décimal, l'autre sépare les milliers.
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    s = s.split(dec === "," ? "." : ",").join("").replace(dec, ".");
  } else if (hasComma) {
    // Format marocain : la virgule est décimale ; plusieurs virgules = milliers.
    s = (s.match(/,/g) ?? []).length > 1 ? s.split(",").join("") : s.replace(",", ".");
  } else if (hasDot) {
    // « 1.234.567 » ou « 1.234 » (trois chiffres après le point) : milliers.
    const parts = s.split(".");
    if (parts.length > 2 || parts[1].length === 3) s = parts.join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export interface CorrectionInput {
  path: string;
  value: unknown;
  motif: string;
}

/** Contrôle d'une demande de correction contre la liste des champs corrigibles. */
export function checkCorrection(
  input: CorrectionInput,
  specFor: (path: string) => FieldSpec | null,
  current: unknown
): { ok: true; spec: FieldSpec; value: unknown; before: unknown } | { ok: false; errorFr: string } {
  const spec = specFor(input.path);
  if (!spec) return { ok: false, errorFr: "Ce champ ne se corrige pas." };
  const before = getAt(current, input.path);
  if (before === undefined) return { ok: false, errorFr: "Champ introuvable dans le rapport." };
  if ((input.motif ?? "").trim().length < MIN_MOTIF) return { ok: false, errorFr: `Motif requis (${MIN_MOTIF} caractères au moins).` };
  const c = coerce(spec, input.value);
  if (!c.ok) return c;
  if (JSON.stringify(c.value) === JSON.stringify(before)) return { ok: false, errorFr: "La valeur proposée est identique à la valeur actuelle." };
  return { ok: true, spec, value: c.value, before };
}
