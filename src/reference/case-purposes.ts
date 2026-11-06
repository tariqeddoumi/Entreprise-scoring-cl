/**
 * Motifs d'ouverture d'un dossier de notation — liste paramétrable
 * (Administration › Paramétrage), consignée sur chaque dossier.
 *
 * Les deux événements les plus fréquents d'une entreprise : le renouvellement
 * annuel des crédits de fonctionnement (court terme) et, à tout moment de
 * l'année, une demande de crédit d'investissement.
 */

export interface CasePurpose {
  code: string;
  labelFr: string;
  active: boolean;
  /** Exercice proposé par défaut à l'ouverture : suivant si disponible, ou conserver. */
  defaultExercise?: "SUIVANT" | "CONSERVE";
}

export const CASE_PURPOSES_KEY = "CASE_PURPOSES";

export type ExerciseChoice = "CONSERVE" | "SUIVANT";

export const DEFAULT_PURPOSES: CasePurpose[] = [
  { code: "RENOUVELLEMENT_CT", labelFr: "Renouvellement annuel des crédits de fonctionnement", active: true, defaultExercise: "SUIVANT" },
  { code: "INVESTISSEMENT", labelFr: "Demande de crédit d'investissement", active: true },
  { code: "NOUVELLE_RELATION", labelFr: "Entrée en relation", active: true },
  { code: "REVISION", labelFr: "Révision sur événement (alerte, incident, information nouvelle)", active: true },
  { code: "AUTRE", labelFr: "Autre motif", active: true },
];

export function checkPurposes(list: CasePurpose[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (!list.some((p) => p.active)) errors.push("Au moins un motif actif.");
  for (const p of list) {
    if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(p.code)) errors.push(`Code de motif non admis : « ${p.code} » (majuscules, chiffres, _).`);
    if (seen.has(p.code)) errors.push(`Motif en double : ${p.code}.`);
    seen.add(p.code);
    if (!p.labelFr.trim() || p.labelFr.length > 200) errors.push(`Motif ${p.code} : libellé de 1 à 200 caractères.`);
  }
  return errors;
}

export function parsePurposes(raw: string | null | undefined): CasePurpose[] {
  if (!raw) return DEFAULT_PURPOSES;
  try {
    const list = JSON.parse(raw) as CasePurpose[];
    return Array.isArray(list) && checkPurposes(list).length === 0 ? list : DEFAULT_PURPOSES;
  } catch {
    return DEFAULT_PURPOSES;
  }
}

/** Date de clôture un an plus tard (fin de mois conservée : 2024-12-31 → 2025-12-31). */
export function nextClosing(closing: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(closing);
  if (!m) return "";
  const y = Number(m[1]) + 1;
  const month = Number(m[2]);
  const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), last);
  const lastPrev = new Date(Date.UTC(y - 1, month, 0)).getUTCDate();
  return `${y}-${m[2]}-${String(Number(m[3]) === lastPrev ? last : day).padStart(2, "0")}`;
}

/** Exercice proposé par défaut : suivant si sa clôture est passée à la date d'arrêté. */
export function suggestedExercise(lastClosing: string | null | undefined, asOfDate: string, purpose?: CasePurpose): ExerciseChoice {
  if (purpose?.defaultExercise === "CONSERVE") return "CONSERVE";
  if (!lastClosing) return "CONSERVE";
  const next = nextClosing(lastClosing);
  return next && next <= asOfDate ? "SUIVANT" : "CONSERVE";
}

