import { prisma } from "./prisma";

/**
 * Paramétrage de l'outil, modifiable à l'écran par un administrateur du groupe.
 *
 * Ce qui se paramètre ici : les règles du workflow, les dérogations, la durée de
 * validité d'une note, les pièces et l'intelligence artificielle. Ce qui ne s'y
 * paramètre PAS : les grilles de notation (poids, barèmes, échelles). Elles
 * forment la version du modèle, validée par le comité modèles et consignée dans
 * chaque notation ; les rendre modifiables à l'écran rendrait deux notes d'une
 * même version incomparables.
 *
 * Les secrets (clé d'API de l'IA) ne s'enregistrent jamais en base, où ils
 * seraient lisibles par tout accès à la base et recopiés dans les sauvegardes :
 * ils restent des variables d'environnement.
 */

export type SettingKind = "boolean" | "integer" | "enum" | "text" | "url";

export interface SettingDef {
  key: string;
  group: "Workflow" | "Dérogations" | "Pièces" | "Intelligence artificielle";
  labelFr: string;
  helpFr: string;
  kind: SettingKind;
  default: string;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
  min?: number;
  max?: number;
}

export const AI_PROVIDERS = ["anthropic", "openai", "azure_openai", "compatible_openai"] as const;

export const SETTINGS: readonly SettingDef[] = [
  {
    key: "WORKFLOW_VALIDATOR_ROLE",
    group: "Workflow",
    labelFr: "Rôle minimal du valideur",
    helpFr:
      "Rôle requis pour valider ou rejeter un dossier soumis. Le valideur est toujours distinct de l'auteur et de tout contributeur du dossier.",
    kind: "enum",
    default: "RISK_MANAGER",
    options: ["RISK_MANAGER", "ADMIN"],
    optionLabels: { RISK_MANAGER: "Gestionnaire des risques", ADMIN: "Administrateur" },
  },
  {
    key: "WORKFLOW_DELEGATION_THRESHOLD",
    group: "Workflow",
    labelFr: "Seuil de délégation (devise de base)",
    helpFr:
      "Au-delà de cette exposition, exprimée dans la devise de base du groupe, la validation est réservée au rôle ci-dessous. 0 : pas de seuil.",
    kind: "integer",
    default: "0",
    min: 0,
    max: 1_000_000_000_000,
  },
  {
    key: "WORKFLOW_DELEGATION_ROLE",
    group: "Workflow",
    labelFr: "Rôle requis au-delà du seuil",
    helpFr: "Rôle du valideur pour les expositions au-delà du seuil de délégation.",
    kind: "enum",
    default: "ADMIN",
    options: ["RISK_MANAGER", "ADMIN"],
    optionLabels: { RISK_MANAGER: "Gestionnaire des risques", ADMIN: "Administrateur" },
  },
  {
    key: "RATING_VALIDITY_MONTHS",
    group: "Workflow",
    labelFr: "Validité d'une note (mois)",
    helpFr:
      "Au-delà, la note est signalée « à revoir » dans la file À traiter. La politique de revue annuelle correspond à 12.",
    kind: "integer",
    default: "12",
    min: 1,
    max: 36,
  },
  {
    key: "OVERRIDE_MAX_NOTCHES",
    group: "Dérogations",
    labelFr: "Ampleur maximale d'une dérogation (crans)",
    helpFr:
      "Au-delà, la dérogation relève du comité et ne peut pas être saisie dans l'outil. La note méthodologique retient 2.",
    kind: "integer",
    default: "2",
    min: 1,
    max: 4,
  },
  {
    key: "DOCUMENT_MAX_MB",
    group: "Pièces",
    labelFr: "Taille maximale d'une pièce (Mo)",
    helpFr: "Pièces conservées en base, pour rester portable d'un moteur de base à l'autre.",
    kind: "integer",
    default: "8",
    min: 1,
    max: 20,
  },
  {
    key: "AI_ENABLED",
    group: "Intelligence artificielle",
    labelFr: "Assistance par l'IA",
    helpFr:
      "Désactivée par défaut. Activée, l'IA lit les pièces et propose des valeurs ; aucune proposition n'est appliquée sans validation humaine, et chaque décision est tracée.",
    kind: "boolean",
    default: "false",
  },
  {
    key: "AI_PROVIDER",
    group: "Intelligence artificielle",
    labelFr: "Fournisseur",
    helpFr:
      "Anthropic (Claude, lecture native des PDF), OpenAI, Azure OpenAI, ou toute API compatible OpenAI (Mistral, modèle hébergé par la banque). La clé reste une variable d'environnement : ANTHROPIC_API_KEY, ou IA_CLE_API pour les autres.",
    kind: "enum",
    default: "anthropic",
    options: AI_PROVIDERS,
    optionLabels: {
      anthropic: "Anthropic (Claude)",
      openai: "OpenAI",
      azure_openai: "Azure OpenAI",
      compatible_openai: "API compatible OpenAI",
    },
  },
  {
    key: "AI_MODEL",
    group: "Intelligence artificielle",
    labelFr: "Modèle",
    helpFr: "Vide : modèle par défaut du fournisseur Anthropic. Obligatoire pour les autres fournisseurs.",
    kind: "text",
    default: "",
  },
  {
    key: "AI_BASE_URL",
    group: "Intelligence artificielle",
    labelFr: "Adresse de l'API",
    helpFr:
      "Vide : adresse officielle. Obligatoire pour Azure et les API compatibles. Adresse https exigée.",
    kind: "url",
    default: "",
  },
] as const;

export type SettingKey = (typeof SETTINGS)[number]["key"];

export function settingDef(key: string): SettingDef | undefined {
  return SETTINGS.find((s) => s.key === key);
}

/** Valeur normalisée, ou message d'erreur si elle n'est pas admise. */
export function validateSetting(key: string, raw: string): { ok: true; value: string } | { ok: false; errorFr: string } {
  const def = settingDef(key);
  if (!def) return { ok: false, errorFr: `Paramètre inconnu : ${key}` };
  const v = raw.trim();
  switch (def.kind) {
    case "boolean":
      if (v !== "true" && v !== "false") return { ok: false, errorFr: `${def.labelFr} : oui ou non.` };
      return { ok: true, value: v };
    case "integer": {
      if (!/^\d+$/.test(v)) return { ok: false, errorFr: `${def.labelFr} : entier attendu.` };
      const n = Number(v);
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) {
        return { ok: false, errorFr: `${def.labelFr} : entre ${def.min} et ${def.max}.` };
      }
      return { ok: true, value: String(n) };
    }
    case "enum":
      if (!def.options?.includes(v)) return { ok: false, errorFr: `${def.labelFr} : valeur non admise.` };
      return { ok: true, value: v };
    case "url":
      if (v === "") return { ok: true, value: v };
      try {
        const u = new URL(v);
        if (u.protocol !== "https:") return { ok: false, errorFr: `${def.labelFr} : adresse https exigée.` };
      } catch {
        return { ok: false, errorFr: `${def.labelFr} : adresse invalide.` };
      }
      return { ok: true, value: v };
    case "text":
      if (v.length > 200) return { ok: false, errorFr: `${def.labelFr} : 200 caractères au plus.` };
      if (!/^[\w.:/@-]*$/.test(v)) return { ok: false, errorFr: `${def.labelFr} : caractères non admis.` };
      return { ok: true, value: v };
  }
}

// --- Lecture, avec cache de 30 s ---------------------------------------------

const TTL_MS = 30_000;
let cache: { values: Record<string, string>; expires: number } | null = null;

export async function loadSettings(): Promise<Record<string, string>> {
  if (cache && cache.expires > Date.now()) return cache.values;
  const values: Record<string, string> = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
  try {
    const rows = await prisma.appSetting.findMany();
    for (const r of rows) {
      const checked = validateSetting(r.key, r.value);
      if (checked.ok) values[r.key] = checked.value;
    }
  } catch {
    // Base indisponible ou table absente : valeurs par défaut, qui sont les
    // plus prudentes (IA désactivée, validation requise).
  }
  cache = { values, expires: Date.now() + TTL_MS };
  return values;
}

export function forgetSettings(): void {
  cache = null;
}

export async function settingInt(key: SettingKey): Promise<number> {
  return Number((await loadSettings())[key]);
}

export async function settingBool(key: SettingKey): Promise<boolean> {
  return (await loadSettings())[key] === "true";
}

export async function settingText(key: SettingKey): Promise<string> {
  return (await loadSettings())[key] ?? "";
}
