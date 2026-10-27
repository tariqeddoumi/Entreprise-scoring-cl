import type {
  CriterionConfig,
  CriterionInput,
  DataStatus,
  GroupSupportInput,
  MaterialityFlags,
  ModelConfig,
  Segment,
} from "@/core/types";
import { CAP_TRIGGER_TO_FLAG, RETIRED_CAP_OBSERVATIONS } from "@/core/structural-flags";

/**
 * Saisie d'un dossier de notation — module PUR, partagé par l'écran (aperçu et
 * enregistrement), le serveur (soumission) et l'IA (propositions).
 *
 * Le brouillon garde la saisie telle que l'analyste la voit (chaînes, cases,
 * montants dans la devise de la contrepartie). La conversion en requête de
 * notation se fait ici, en un seul endroit : l'aperçu à l'écran et la notation
 * enregistrée à la soumission reçoivent exactement la même requête.
 */

export interface CriterionDraft {
  status: DataStatus;
  value: string;
  score: string;
  specialCase: string;
}

export type MaterialityFlag = keyof MaterialityFlags;

export interface CaseDraft {
  version: 1;
  /** Segment imposé par l'analyste ; vide : calculé à partir des montants. */
  segment: Segment | "";
  asOfDate: string;
  criteria: Record<string, CriterionDraft>;
  confidence: { completeness: number; freshness: number; reliability: number; provenance: number };
  flags: Record<string, boolean>;
  companyAgeYears: string;
  hasStrongGroupSupport: boolean;
  redFlags: string[];
  defaultTriggered: boolean;
  defaultGrade: "DEF1" | "DEF2" | "DEF3";
  materiality: Partial<Record<MaterialityFlag, boolean>>;
  groupSupport: GroupSupportInput;
  /** Montants dans la devise de la contrepartie (convertis à la soumission). */
  amounts: { annualTurnover: string; groupAnnualTurnover: string; globalBankExposure: string };
}

export const DATA_STATUSES: DataStatus[] = ["AVAILABLE", "MISSING", "NOT_APPLICABLE", "INVALID", "STALE", "ESTIMATED"];
export const DEFAULT_CONFIDENCE = { completeness: 100, freshness: 100, reliability: 75, provenance: 75 };
export const ANCHOR_SCORES = [0, 25, 50, 75, 100] as const;

export function emptyDraft(model: ModelConfig, asOfDate: string): CaseDraft {
  return {
    version: 1,
    // Segment imposé par défaut (PME si le modèle le couvre) : un dossier reste
    // calculable avant la saisie des montants ; l'analyste peut choisir
    // « déterminé par les montants ».
    segment: model.segments.includes("PME" as Segment) ? ("PME" as Segment) : model.segments[0],
    asOfDate,
    criteria: Object.fromEntries(
      model.criteria.map((c) => [c.code, { status: "AVAILABLE" as DataStatus, value: "", score: "50", specialCase: "" }])
    ),
    confidence: { ...DEFAULT_CONFIDENCE },
    flags: {},
    companyAgeYears: "",
    hasStrongGroupSupport: false,
    redFlags: [],
    defaultTriggered: false,
    defaultGrade: "DEF1",
    materiality: {},
    groupSupport: { claimed: false },
    amounts: { annualTurnover: "", groupAnnualTurnover: "", globalBankExposure: "" },
  };
}

/** Relecture tolérante d'un brouillon enregistré : un champ absent reprend sa valeur par défaut. */
export function parseDraft(raw: string | null | undefined, model: ModelConfig, asOfDate: string): CaseDraft {
  const base = emptyDraft(model, asOfDate);
  if (!raw) return base;
  try {
    const d = JSON.parse(raw) as Partial<CaseDraft>;
    return {
      ...base,
      ...d,
      criteria: { ...base.criteria, ...(d.criteria ?? {}) },
      confidence: { ...base.confidence, ...(d.confidence ?? {}) },
      amounts: { ...base.amounts, ...(d.amounts ?? {}) },
      groupSupport: d.groupSupport ?? base.groupSupport,
      materiality: d.materiality ?? {},
      flags: d.flags ?? {},
      redFlags: d.redFlags ?? [],
      version: 1,
    };
  } catch {
    return base;
  }
}

/** Statuts pour lesquels le moteur lit la valeur saisie. */
export function carriesValue(status: DataStatus): boolean {
  return status === "AVAILABLE" || status === "ESTIMATED";
}

/** Critère écarté faute de matérialité déclarée. */
export function isGatedOut(criterion: CriterionConfig, materiality: CaseDraft["materiality"]): boolean {
  return !!criterion.materialityGate && materiality[criterion.materialityGate.flag] !== true;
}

/** Segment effectif pour l'affichage des poids : imposé, sinon le premier du modèle. */
export function displaySegment(draft: CaseDraft, model: ModelConfig): Segment {
  return (draft.segment || model.segments[0]) as Segment;
}

const toNumber = (s: string): number | undefined => {
  if (s.trim() === "") return undefined;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

export function draftAmounts(draft: CaseDraft): Record<string, number | undefined> {
  return {
    annualTurnover: toNumber(draft.amounts.annualTurnover),
    groupAnnualTurnover: toNumber(draft.amounts.groupAnnualTurnover),
    globalBankExposure: toNumber(draft.amounts.globalBankExposure),
  };
}

/**
 * Requête de notation (forme du schéma `ratingRequestSchema`, sans
 * counterpartyId). `baseAmounts` : montants déjà convertis dans la devise de
 * base ; absents, la segmentation repose sur le segment imposé.
 */
export function draftToRequest(
  draft: CaseDraft,
  model: ModelConfig,
  baseAmounts?: Record<string, number>
): Record<string, unknown> {
  const segment = displaySegment(draft, model);
  const criteria: Record<string, CriterionInput> = {};
  for (const c of model.criteria) {
    if ((c.weightsBps[segment] ?? 0) === 0 && draft.segment) continue;
    // Critère écarté : rien n'est transmis, pour que l'instantané d'entrée ne
    // porte pas une valeur que le moteur n'a pas lue.
    if (isGatedOut(c, draft.materiality)) continue;
    const state = draft.criteria[c.code];
    if (!state) continue;
    const entry: CriterionInput = { status: state.status };
    if (carriesValue(state.status)) {
      if (state.specialCase) {
        entry.specialCase = state.specialCase;
      } else if (c.type === "QUANTITATIVE") {
        const n = toNumber(state.value);
        if (n === undefined) entry.status = "MISSING";
        else entry.value = n;
      } else {
        entry.score = Number(state.score) as CriterionInput["score"];
      }
    }
    criteria[c.code] = entry;
  }

  const age = toNumber(draft.companyAgeYears);
  const segmentationData =
    baseAmounts && Object.keys(baseAmounts).length > 0 ? { segmentationData: baseAmounts } : {};
  return {
    modelId: model.modelId,
    ...(draft.segment ? { segment: draft.segment } : {}),
    ...segmentationData,
    asOfDate: draft.asOfDate,
    criteria,
    confidence: draft.confidence,
    structuralFlags: {
      ...Object.fromEntries(Object.entries(draft.flags).filter(([, v]) => v)),
      ...(age !== undefined ? { companyAgeYears: age } : {}),
      ...(draft.hasStrongGroupSupport ? { hasStrongGroupSupport: true } : {}),
    },
    redFlags: draft.redFlags,
    defaultTriggered: draft.defaultTriggered,
    ...(draft.defaultTriggered ? { defaultGrade: draft.defaultGrade } : {}),
    materiality: Object.fromEntries(Object.entries(draft.materiality).filter(([, v]) => v)),
    ...(draft.groupSupport.claimed ? { groupSupport: draft.groupSupport } : {}),
  };
}

// --- Champs que l'IA peut proposer -------------------------------------------
//
// Une proposition porte sur une clé de cette liste et une valeur texte ; elle
// est revérifiée contre la grille avant d'être présentée, et appliquée
// seulement après décision humaine.

export type FieldKind = "number" | "anchor" | "status" | "boolean";

export interface ProposableField {
  key: string;
  kind: FieldKind;
  labelFr: string;
  /** Aide transmise à l'IA : définition, barème ou repères. */
  guideFr: string;
}

const GROUP_SUPPORT_LABELS: Record<string, string> = {
  claimed: "Support groupe invoqué",
  capacityDocumented: "Capacité financière du garant documentée",
  willingnessDocumented: "Volonté de soutien démontrée",
  legallyBinding: "Engagement juridiquement contraignant",
  fundsTransferable: "Transférabilité effective des fonds",
};

const MATERIALITY_LABELS: Record<string, string> = {
  esgPhysicalMaterial: "Risque climatique physique matériel",
  esgTransitionMaterial: "Risque de transition matériel",
};

export function proposableFields(model: ModelConfig): ProposableField[] {
  const out: ProposableField[] = [];
  for (const c of model.criteria) {
    const head = `${c.code} — ${c.labelFr}`;
    if (c.type === "QUANTITATIVE") {
      const bins = c.binsBySegment?.ALL ?? Object.values(c.binsBySegment ?? {})[0];
      out.push({
        key: `criteria.${c.code}.value`,
        kind: "number",
        labelFr: head,
        guideFr: `${c.descriptionFr ?? ""}${c.unit ? ` Unité : ${c.unit.trim()}.` : ""}${
          bins ? ` Barème indicatif : ${bins.map((b) => `${b.min ?? "-∞"}..${b.max ?? "+∞"}→${b.score}`).join(", ")}.` : ""
        }`.trim(),
      });
    } else {
      out.push({
        key: `criteria.${c.code}.score`,
        kind: "anchor",
        labelFr: head,
        guideFr: (c.anchors ?? []).map((a) => `${a.score} = ${a.labelFr}`).join(" | "),
      });
    }
    out.push({
      key: `criteria.${c.code}.status`,
      kind: "status",
      labelFr: `${head} (statut de la donnée)`,
      guideFr: "AVAILABLE si la pièce établit la valeur ; ESTIMATED si elle est estimée ; MISSING si aucune pièce ne la donne ; STALE si les comptes sont périmés.",
    });
  }
  for (const rule of model.nonCompensatoryRules) {
    const flag = CAP_TRIGGER_TO_FLAG[rule.trigger];
    if (flag) out.push({ key: `structuralFlags.${flag}`, kind: "boolean", labelFr: `${rule.code} — ${rule.labelFr}`, guideFr: rule.labelFr });
  }
  for (const o of RETIRED_CAP_OBSERVATIONS) {
    out.push({ key: `structuralFlags.${o.flag}`, kind: "boolean", labelFr: o.labelFr, guideFr: o.treatmentFr });
  }
  out.push({ key: "structuralFlags.companyAgeYears", kind: "number", labelFr: "Ancienneté de l'entreprise (années)", guideFr: "Depuis la date de création." });
  for (const rf of model.redFlags) {
    out.push({ key: `redFlags.${rf.code}`, kind: "boolean", labelFr: `${rf.code} — ${rf.labelFr}`, guideFr: rf.treatmentFr });
  }
  for (const flag of new Set(model.criteria.map((c) => c.materialityGate?.flag).filter(Boolean) as string[])) {
    out.push({ key: `materiality.${flag}`, kind: "boolean", labelFr: MATERIALITY_LABELS[flag] ?? flag, guideFr: "Exposition matérielle établie par le secteur et la localisation des sites." });
  }
  for (const [k, l] of Object.entries(GROUP_SUPPORT_LABELS)) {
    out.push({ key: `groupSupport.${k}`, kind: "boolean", labelFr: l, guideFr: "Uniquement si une pièce l'établit." });
  }
  out.push({ key: "amounts.annualTurnover", kind: "number", labelFr: "Chiffre d'affaires HT (devise de la contrepartie)", guideFr: "Dernier exercice clos." });
  out.push({ key: "amounts.groupAnnualTurnover", kind: "number", labelFr: "Chiffre d'affaires du groupe", guideFr: "Si la contrepartie appartient à un groupe." });
  out.push({ key: "defaultTriggered", kind: "boolean", labelFr: "Défaut avéré", guideFr: "Impayé au-delà du seuil de défaut, restructuration en difficulté, procédure collective." });
  return out;
}

/** Valeur normalisée d'une proposition, ou null si elle n'est pas admise. */
export function normalizeProposal(field: ProposableField, raw: string): string | null {
  const v = raw.trim();
  switch (field.kind) {
    case "number": {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? String(n) : null;
    }
    case "anchor":
      return (ANCHOR_SCORES as readonly number[]).includes(Number(v)) ? String(Number(v)) : null;
    case "status":
      return (DATA_STATUSES as string[]).includes(v) ? v : null;
    case "boolean":
      return v === "true" || v === "false" ? v : null;
  }
}

/** Applique une proposition acceptée au brouillon (copie). */
export function applyField(draft: CaseDraft, key: string, value: string): CaseDraft {
  const d: CaseDraft = JSON.parse(JSON.stringify(draft));
  const [head, a] = key.split(".");
  const bool = value === "true";
  switch (head) {
    case "criteria": {
      // Les codes de critère contiennent un point (D1.4) : la partie modifiée est
      // le dernier segment de la clé.
      const code = key.slice("criteria.".length, key.lastIndexOf("."));
      const part = key.slice(key.lastIndexOf(".") + 1);
      const c = d.criteria[code] ?? { status: "AVAILABLE", value: "", score: "50", specialCase: "" };
      if (part === "value") {
        c.value = value;
        c.specialCase = "";
        if (!carriesValue(c.status)) c.status = "AVAILABLE";
      } else if (part === "score") {
        c.score = value;
        if (!carriesValue(c.status)) c.status = "AVAILABLE";
      } else if (part === "status") {
        c.status = value as DataStatus;
      }
      d.criteria[code] = c;
      return d;
    }
    case "structuralFlags":
      if (a === "companyAgeYears") d.companyAgeYears = value;
      else d.flags[a] = bool;
      return d;
    case "redFlags":
      d.redFlags = bool ? [...new Set([...d.redFlags, a])] : d.redFlags.filter((r) => r !== a);
      return d;
    case "materiality":
      d.materiality[a as MaterialityFlag] = bool;
      return d;
    case "groupSupport":
      (d.groupSupport as unknown as Record<string, boolean>)[a] = bool;
      if (a !== "claimed" && bool) d.groupSupport.claimed = true;
      return d;
    case "amounts":
      (d.amounts as Record<string, string>)[a] = value;
      return d;
    case "defaultTriggered":
      d.defaultTriggered = bool;
      return d;
  }
  return d;
}
