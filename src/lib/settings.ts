import { prisma } from "./prisma";

/**
 * Paramétrage de l'outil, modifiable à l'écran par un administrateur du groupe.
 *
 * Ce qui se paramètre ici : les règles du workflow, les dérogations, la durée de
 * validité d'une note, les pièces et l'intelligence artificielle. Ce qui ne s'y
 * paramètre PAS : les grilles de notation (poids, barèmes). Elles forment la
 * version du modèle, validée par le comité modèles et consignée dans chaque
 * notation ; les rendre modifiables à l'écran rendrait deux notes d'une même
 * version incomparables. L'échelle maîtresse 1 à 10, elle, se paramètre par
 * versions datées et figées (src/lib/rating-scale.ts, écran Échelle de notation).
 *
 * Les secrets (clé d'API de l'IA) ne s'enregistrent jamais en base, où ils
 * seraient lisibles par tout accès à la base et recopiés dans les sauvegardes :
 * ils restent des variables d'environnement.
 */

export type SettingKind = "boolean" | "integer" | "enum" | "text" | "url";

export interface SettingDef {
  key: string;
  group: "Workflow" | "Comités" | "Dérogations" | "Pièces" | "Intelligence artificielle" | "Référentiels externes";
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
    key: "WORKFLOW_BALANCE_SHEET_REQUIRED",
    group: "Workflow",
    labelFr: "Bilan exigé pour soumettre (grilles standard)",
    helpFr:
      "Un dossier noté sur une grille standard ne se soumet qu'avec le bilan et le CPC des exercices N et N−1, équilibrés et cohérents. Les grilles comportementales (TPE sans comptes exploitables) n'y sont pas soumises ; un bilan simplifié peut y être joint.",
    kind: "boolean",
    default: "true",
  },
  {
    key: "WORKFLOW_CONFIRM_CARRIED_OVER",
    group: "Workflow",
    labelFr: "Confirmer les champs repris de la note précédente",
    helpFr:
      "À l'ouverture d'un dossier, la saisie de la dernière note validée est reprise. Activé : chaque critère et les montants repris doivent être confirmés ou modifiés avant la soumission.",
    kind: "boolean",
    default: "true",
  },
  {
    key: "WORKFLOW_VALIDATOR_ROLE",
    group: "Workflow",
    labelFr: "Rôle minimal du valideur — dossiers soumis avant le circuit à étapes",
    helpFr:
      "Ne concerne que les dossiers soumis avant la mise en place du circuit de validation (une seule étape). Les nouveaux dossiers suivent le circuit ci-dessus.",
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
      "Au-delà de cette exposition, exprimée dans la devise de base du groupe, la dernière étape du circuit exige au moins le rôle ci-dessous. 0 : pas de seuil.",
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
      "Au-delà, le client apparaît dans « Notes à renouveler » (file À traiter des dossiers). La politique de revue annuelle correspond à 12.",
    kind: "integer",
    default: "12",
    min: 1,
    max: 36,
  },
  {
    key: "COMMITTEE_LIFT_DOUBLE_VALIDATION",
    group: "Comités",
    labelFr: "Levée d'un critère de classement : confirmation par une seconde personne",
    helpFr:
      "Désactivé : la levée enregistrée par un profil habilité (contre-étude, surveillance) prend effet immédiatement. Activé (cible) : elle prend effet lorsqu'une seconde personne habilitée la confirme.",
    kind: "boolean",
    default: "false",
  },
  {
    key: "COMMITTEE_WL_DOUBLE_VALIDATION",
    group: "Comités",
    labelFr: "Décision de watch list : confirmation par une seconde personne",
    helpFr: "Même principe pour l'entrée et la sortie de watch list décidées en comité.",
    kind: "boolean",
    default: "false",
  },
  {
    key: "WATCHLIST_CUMUL_NOTCH",
    group: "Comités",
    labelFr: "Watch list et créance sensible : cran supplémentaire en cas de cumul",
    helpFr:
      "0 (proposé) : le plus sévère des deux plafonds s'applique, sans double comptage. 1 ou 2 : la note est dégradée d'autant de crans au-delà du plafond le plus sévère (10 au plus).",
    kind: "integer",
    default: "0",
    min: 0,
    max: 2,
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
    helpFr:
      "Pièces conservées en base, pour rester portable d'un moteur de base à l'autre. Sur Vercel, une requête ne dépasse pas 4,5 Mo : au-delà de 4 Mo, l'envoi échoue quel que soit ce paramètre (hébergement interne : jusqu'à 20 Mo).",
    kind: "integer",
    default: "4",
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
      "Anthropic (Claude, lecture native des PDF), OpenAI, Azure OpenAI, ou toute API compatible OpenAI (DeepSeek, Mistral, modèle hébergé par la banque). La clé reste une variable d'environnement : ANTHROPIC_API_KEY, ou IA_CLE_API pour les autres.",
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
  {
    key: "T24_ENABLED",
    group: "Référentiels externes",
    labelFr: "Rapatriement des fiches clients depuis T24",
    helpFr:
      "Activé : la fiche client se crée et s'actualise depuis T24 par le code client. Désactivé ou T24 indisponible : saisie minimale, à rattacher à T24 ensuite. Jeton d'accès : variable d'environnement T24_API_TOKEN.",
    kind: "boolean",
    default: "false",
  },
  {
    key: "T24_BASE_URL",
    group: "Référentiels externes",
    labelFr: "Adresse de l'API T24",
    helpFr: "Adresse https de l'API clients de T24 (Transact), réseau interne de la banque.",
    kind: "url",
    default: "",
  },
  {
    key: "T24_CUSTOMER_PATH",
    group: "Référentiels externes",
    labelFr: "Chemin de la ressource client",
    helpFr: "Ajouté à l'adresse, suivi du code client. Transact (IRIS) : /api/v1.0.0/party/customers/",
    kind: "text",
    default: "/api/v1.0.0/party/customers/",
  },
  {
    key: "T24_CODE_MIN_DIGITS",
    group: "Référentiels externes",
    labelFr: "Code client T24 : chiffres au minimum",
    helpFr: "Le code client T24 est numérique (1 à 10 chiffres selon le paramétrage de T24). À aligner sur la numérotation de la banque.",
    kind: "integer",
    default: "1",
    min: 1,
    max: 20,
  },
  {
    key: "T24_CODE_MAX_DIGITS",
    group: "Référentiels externes",
    labelFr: "Code client T24 : chiffres au maximum",
    helpFr: "Voir ci-dessus.",
    kind: "integer",
    default: "10",
    min: 1,
    max: 20,
  },
  {
    key: "CREDIT_BUREAU_API_ENABLED",
    group: "Référentiels externes",
    labelFr: "Récupération du rapport de solvabilité par API",
    helpFr:
      "Activé : le rapport se récupère depuis la base des rapports du crédit bureau, par l'ICE. Le rafraîchissement du rapport se fait dans l'outil du crédit bureau. Jeton : variable d'environnement CREDIT_BUREAU_API_TOKEN.",
    kind: "boolean",
    default: "false",
  },
  {
    key: "CREDIT_BUREAU_PROVIDER",
    group: "Référentiels externes",
    labelFr: "Crédit bureau",
    helpFr: "Délégataire de Bank Al-Maghrib dont la banque consulte les rapports.",
    kind: "enum",
    default: "CREDITINFO",
    options: ["CREDITINFO", "QUANTIK"],
    optionLabels: { CREDITINFO: "Creditinfo Maroc", QUANTIK: "Quantik Maroc" },
  },
  {
    key: "CREDIT_BUREAU_BASE_URL",
    group: "Référentiels externes",
    labelFr: "Adresse de l'API du crédit bureau",
    helpFr: "Adresse https de la base des rapports de solvabilité.",
    kind: "url",
    default: "",
  },
  {
    key: "CREDIT_BUREAU_PATH",
    group: "Référentiels externes",
    labelFr: "Chemin du rapport entreprise",
    helpFr: "Ajouté à l'adresse, suivi de l'ICE de l'entreprise.",
    kind: "text",
    default: "/api/v1/reports/company/",
  },
  {
    key: "CREDIT_REPORT_MAX_AGE_DAYS",
    group: "Référentiels externes",
    labelFr: "Ancienneté maximale du rapport de solvabilité (jours)",
    helpFr:
      "Au-delà, depuis sa date de mise à jour, le rapport est signalé ancien : l'analyste le rafraîchit dans l'outil du crédit bureau puis le récupère à nouveau. Proposition : 30 jours, à arrêter en COPIL.",
    kind: "integer",
    default: "30",
    min: 1,
    max: 365,
  },
  {
    key: "CREDIT_REPORT_AT_SUBMISSION",
    group: "Référentiels externes",
    labelFr: "Rapport absent ou ancien à la soumission",
    helpFr: "Avertissement : la soumission reste possible, l'alerte est tracée. Bloquant : un rapport à jour est exigé.",
    kind: "enum",
    default: "AVERTISSEMENT",
    options: ["AVERTISSEMENT", "BLOQUANT", "AUCUN"],
    optionLabels: { AVERTISSEMENT: "Avertissement", BLOQUANT: "Bloquant", AUCUN: "Aucun contrôle" },
  },
  {
    key: "LEGAL_PROFILE_MAX_AGE_DAYS",
    group: "Référentiels externes",
    labelFr: "Ancienneté maximale de la fiche juridique (jours)",
    helpFr: "Au-delà, depuis la date du rapport InfoRisque ou de la synchronisation T24, la fiche juridique est signalée à actualiser.",
    kind: "integer",
    default: "365",
    min: 30,
    max: 1095,
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
