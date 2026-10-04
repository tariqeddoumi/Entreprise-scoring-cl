/**
 * Configuration applicative centralisée et validée.
 *
 * Principe : une configuration invalide fait échouer le démarrage avec un
 * message explicite, plutôt que de produire un comportement dégradé
 * silencieux. Aucun secret ne possède de valeur par défaut.
 */

export type DbProvider = "postgresql" | "mysql" | "sqlserver" | "sqlite";

export interface AppConfig {
  isProduction: boolean;
  dbProvider: DbProvider;
  corsAllowedOrigins: string[];
  rateLimitPerMinute: number;
  maxRequestBodyBytes: number;
  allowPrivateWebhookUrls: boolean;
  /**
   * Autorise l'exposition d'une probabilité de défaut issue d'une calibration
   * non observée (constat C02). Refusée en production par construction : la
   * variable y fait échouer le démarrage plutôt que d'ouvrir une porte.
   */
  allowSyntheticPd: boolean;
}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} invalide : « ${raw} ». Entier attendu entre ${min} et ${max}.`
    );
  }
  return value;
}

function loadConfig(): AppConfig {
  const isProduction = process.env.NODE_ENV === "production";

  // Une variable déclarée dans l'interface Vercel mais laissée sans valeur est
  // transmise comme chaîne vide, pas comme absente : `?? "postgresql"` ne s'y
  // applique donc pas. Sans ce garde-fou, une case vide dans le tableau de
  // variables d'environnement suffit à faire échouer le middleware sur
  // absolument toutes les routes.
  const rawProvider = process.env.DATABASE_PROVIDER?.trim();
  const provider = (rawProvider ? rawProvider : "postgresql").toLowerCase();
  const providers: DbProvider[] = ["postgresql", "mysql", "sqlserver", "sqlite"];
  if (!providers.includes(provider as DbProvider)) {
    throw new Error(
      `DATABASE_PROVIDER invalide : « ${provider} ». Valeurs admises : ${providers.join(", ")}.`
    );
  }
  if (isProduction && provider === "sqlite") {
    throw new Error(
      "SQLite est réservé au développement : il ne gère pas la précision décimale exigée pour les montants et les scores."
    );
  }

  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS : « ${origin} » n'est pas une origine valide (attendu : https://exemple.ma).`
      );
    }
    if (isProduction && parsed.protocol !== "https:") {
      throw new Error(
        `CORS_ALLOWED_ORIGINS : « ${origin} » doit utiliser https en production.`
      );
    }
  }

  // Bac à sable de simulation : la PD non calibrée ne peut sortir que d'un
  // environnement qui n'est pas la production. Le démarrage échoue si la
  // dérogation est posée en production — un oubli de configuration ne doit pas
  // pouvoir publier une probabilité de défaut issue de données simulées.
  const allowSyntheticPd = process.env.ALLOW_SYNTHETIC_PD === "1";
  if (isProduction && allowSyntheticPd) {
    throw new Error(
      "ALLOW_SYNTHETIC_PD=1 est refusé en production : une probabilité de défaut calibrée sur données simulées ne doit jamais quitter un environnement bac à sable."
    );
  }

  return {
    isProduction,
    dbProvider: provider as DbProvider,
    corsAllowedOrigins: origins,
    rateLimitPerMinute: intFromEnv("RATE_LIMIT_PER_MINUTE", 120, 0, 100_000),
    maxRequestBodyBytes: intFromEnv("MAX_REQUEST_BODY_KB", 512, 1, 51_200) * 1024,
    allowPrivateWebhookUrls: process.env.ALLOW_PRIVATE_WEBHOOK_URLS === "1",
    allowSyntheticPd,
  };
}

/**
 * Schéma applicatif PostgreSQL désigné par DATABASE_URL.
 *
 * Prisma interroge le schéma nommé par le paramètre `schema` de la chaîne de
 * connexion, et « public » à défaut. Sur une base partagée — cas du projet
 * Supabase, dont le schéma « public » héberge les tables d'autres applications,
 * dont une table « users » —, oublier ce paramètre fait lire à l'outil les
 * tables d'une autre application. C'est arrivé en octobre 2026 : la connexion
 * échouait sur une colonne absente de `public.users`, sans autre indice.
 *
 * Seul le nom exact est admis : le script de durcissement et `db:check` le
 * citent tous deux, et accepter « tout sauf public » laisserait passer une
 * faute de frappe (`corp_scorng`) ou le schéma d'une autre application
 * (`auth`).
 *
 * Renvoie un message d'erreur, ou null si la configuration est acceptable.
 * Seule la production est contrôlée ; une chaîne illisible est laissée à
 * Prisma, qui la refusera lui-même.
 */
export const APPLICATION_SCHEMA = "corp_scoring";

export function applicationSchemaError(
  databaseUrl: string | undefined,
  provider: DbProvider,
  isProduction: boolean
): string | null {
  if (!isProduction || provider !== "postgresql" || !databaseUrl) return null;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const schema = url.searchParams.get("schema");
  if (schema === APPLICATION_SCHEMA) return null;
  const constat = !schema
    ? "aucun schéma n'est désigné, Prisma utiliserait « public »"
    : `le schéma « ${schema} » est désigné au lieu de « ${APPLICATION_SCHEMA} »`;
  return (
    `DATABASE_URL : ${constat}. ` +
    `Les tables de l'outil vivent dans le schéma dédié « ${APPLICATION_SCHEMA} » : la chaîne de connexion doit porter « schema=${APPLICATION_SCHEMA} » ` +
    `(« &schema=${APPLICATION_SCHEMA} » si elle contient déjà « ? »), puis redéployez. Aucune requête n'est envoyée tant que ce n'est pas fait, ` +
    "pour ne jamais lire ni écrire les tables d'une autre application."
  );
}

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Réinitialise le cache — réservé aux tests. */
export function resetConfigCache(): void {
  cached = null;
}
