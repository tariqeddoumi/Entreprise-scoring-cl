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

  const provider = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase();
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

  return {
    isProduction,
    dbProvider: provider as DbProvider,
    corsAllowedOrigins: origins,
    rateLimitPerMinute: intFromEnv("RATE_LIMIT_PER_MINUTE", 120, 0, 100_000),
    maxRequestBodyBytes: intFromEnv("MAX_REQUEST_BODY_KB", 512, 1, 51_200) * 1024,
    allowPrivateWebhookUrls: process.env.ALLOW_PRIVATE_WEBHOOK_URLS === "1",
  };
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
