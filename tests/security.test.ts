import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkOutboundUrl } from "@/lib/url-safety";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";
import { config, resetConfigCache } from "@/lib/env";
import { signPayload, verifySignature } from "@/lib/webhooks";
import {
  ratingRequestSchema,
  webhookSubscriptionSchema,
  counterpartySchema,
} from "@/lib/schemas";

const ORIGINAL_ENV = { ...process.env };

/**
 * `NODE_ENV` est déclaré en lecture seule par les types Node/Next : cette
 * fonction encapsule l'écriture nécessaire aux tests.
 */
function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[name];
  else env[name] = value;
}

beforeEach(() => {
  resetConfigCache();
  resetRateLimits();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetConfigCache();
  resetRateLimits();
});

describe("Protection contre les requêtes forgées côté serveur (SSRF)", () => {
  const blocked = [
    ["bouclage IPv4", "https://127.0.0.1/hook"],
    ["bouclage nommé", "https://localhost/hook"],
    ["réseau privé 10/8", "https://10.0.0.5/hook"],
    ["réseau privé 172.16/12", "https://172.20.1.1/hook"],
    ["réseau privé 192.168/16", "https://192.168.1.10/hook"],
    ["métadonnées cloud", "https://169.254.169.254/latest/meta-data"],
    ["métadonnées Google", "https://metadata.google.internal/x"],
    ["bouclage IPv6", "https://[::1]/hook"],
    ["locale unique IPv6", "https://[fd00::1]/hook"],
    ["IPv4 encapsulée", "https://[::ffff:127.0.0.1]/hook"],
    ["domaine interne", "https://api.internal/hook"],
    ["réseau courant 0/8", "https://0.0.0.0/hook"],
    ["CGNAT 100.64/10", "https://100.64.0.1/hook"],
  ] as const;

  for (const [label, url] of blocked) {
    it(`refuse ${label}`, () => {
      setEnv("NODE_ENV", "production");
      resetConfigCache();
      const result = checkOutboundUrl(url);
      expect(result.ok, `${url} aurait dû être refusée`).toBe(false);
    });
  }

  it("refuse les identifiants dans l'URL", () => {
    const r = checkOutboundUrl("https://user:pass@exemple.ma/hook");
    expect(r.ok).toBe(false);
  });

  it("refuse http en production", () => {
    setEnv("NODE_ENV", "production");
    resetConfigCache();
    expect(checkOutboundUrl("http://exemple.ma/hook").ok).toBe(false);
  });

  it("accepte une URL publique en https", () => {
    setEnv("NODE_ENV", "production");
    resetConfigCache();
    expect(checkOutboundUrl("https://integration.banque.ma/hook").ok).toBe(true);
  });

  it("autorise le privé uniquement si la dérogation explicite est posée", () => {
    setEnv("ALLOW_PRIVATE_WEBHOOK_URLS", "1");
    resetConfigCache();
    expect(checkOutboundUrl("https://10.0.0.5/hook").ok).toBe(true);
  });
});

describe("Limitation de débit", () => {
  it("laisse passer jusqu'à la limite puis refuse", () => {
    setEnv("RATE_LIMIT_PER_MINUTE", "3");
    resetConfigCache();
    const now = 1_000_000;
    expect(checkRateLimit("client-a", now).allowed).toBe(true);
    expect(checkRateLimit("client-a", now).allowed).toBe(true);
    expect(checkRateLimit("client-a", now).allowed).toBe(true);
    const refused = checkRateLimit("client-a", now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isole les identités entre elles", () => {
    setEnv("RATE_LIMIT_PER_MINUTE", "1");
    resetConfigCache();
    const now = 2_000_000;
    expect(checkRateLimit("client-a", now).allowed).toBe(true);
    expect(checkRateLimit("client-a", now).allowed).toBe(false);
    expect(checkRateLimit("client-b", now).allowed).toBe(true);
  });

  it("réinitialise après la fenêtre", () => {
    setEnv("RATE_LIMIT_PER_MINUTE", "1");
    resetConfigCache();
    const now = 3_000_000;
    expect(checkRateLimit("client-c", now).allowed).toBe(true);
    expect(checkRateLimit("client-c", now).allowed).toBe(false);
    expect(checkRateLimit("client-c", now + 60_001).allowed).toBe(true);
  });
});

describe("Signature des événements sortants", () => {
  const secret = "un-secret-de-test-suffisamment-long-1234";
  const timestamp = new Date("2026-08-19T10:00:00.000Z").toISOString();
  const body = '{"id":"evt-1","type":"rating.completed"}';
  const now = Date.parse(timestamp);

  it("valide une signature correcte dans la fenêtre", () => {
    const sig = signPayload(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, body, `sha256=${sig}`, now).valid).toBe(true);
  });

  it("refuse un corps altéré", () => {
    const sig = signPayload(secret, timestamp, body);
    const r = verifySignature(secret, timestamp, body + " ", `sha256=${sig}`, now);
    expect(r.valid).toBe(false);
  });

  it("refuse un secret différent", () => {
    const sig = signPayload("autre-secret-de-test-suffisamment-long", timestamp, body);
    expect(verifySignature(secret, timestamp, body, `sha256=${sig}`, now).valid).toBe(false);
  });

  it("refuse un rejeu hors fenêtre", () => {
    const sig = signPayload(secret, timestamp, body);
    const r = verifySignature(secret, timestamp, body, `sha256=${sig}`, now + 301_000);
    expect(r.valid).toBe(false);
    expect(r.reasonFr).toContain("rejeu");
  });
});

describe("Validation des entrées", () => {
  it("refuse une propriété inconnue (objet strict)", () => {
    const r = counterpartySchema.safeParse({ name: "Test", inconnu: "x" });
    expect(r.success).toBe(false);
  });

  it("refuse un score qualitatif hors des valeurs ancrées", () => {
    const r = ratingRequestSchema.safeParse({
      modelId: "CORP_STD_V1",
      asOfDate: "2026-08-19",
      confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
      criteria: { "D1.1": { status: "AVAILABLE", score: 60 } },
    });
    expect(r.success).toBe(false);
  });

  it("refuse un nombre de critères non borné", () => {
    const criteria: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) {
      criteria[`C${i}`] = { status: "AVAILABLE", score: 50 };
    }
    const r = ratingRequestSchema.safeParse({
      modelId: "CORP_STD_V1",
      asOfDate: "2026-08-19",
      confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
      criteria,
    });
    expect(r.success).toBe(false);
  });

  it("refuse un code de red flag mal formé", () => {
    const r = ratingRequestSchema.safeParse({
      modelId: "CORP_STD_V1",
      asOfDate: "2026-08-19",
      confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
      criteria: {},
      redFlags: ["'; DROP TABLE counterparties; --"],
    });
    expect(r.success).toBe(false);
  });

  it("refuse un type d'événement webhook inconnu", () => {
    const r = webhookSubscriptionSchema.safeParse({
      url: "https://exemple.ma/hook",
      secret: "x".repeat(32),
      events: ["evenement.inconnu"],
    });
    expect(r.success).toBe(false);
  });

  it("refuse un secret webhook trop court", () => {
    const r = webhookSubscriptionSchema.safeParse({
      url: "https://exemple.ma/hook",
      secret: "trop-court",
      events: ["rating.completed"],
    });
    expect(r.success).toBe(false);
  });

  it("refuse une date d'arrêté mal formée", () => {
    const r = ratingRequestSchema.safeParse({
      modelId: "CORP_STD_V1",
      asOfDate: "19/08/2026",
      confidence: { completeness: 100, freshness: 100, reliability: 100, provenance: 100 },
      criteria: {},
    });
    expect(r.success).toBe(false);
  });
});

describe("Configuration", () => {
  it("refuse SQLite en production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_PROVIDER", "sqlite");
    resetConfigCache();
    expect(() => config()).toThrow(/SQLite/);
  });

  it("refuse une origine CORS non https en production", () => {
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_PROVIDER", "postgresql");
    setEnv("CORS_ALLOWED_ORIGINS", "http://exemple.ma");
    resetConfigCache();
    expect(() => config()).toThrow(/https/);
  });

  it("refuse une limite de débit non entière", () => {
    setEnv("RATE_LIMIT_PER_MINUTE", "beaucoup");
    resetConfigCache();
    expect(() => config()).toThrow(/RATE_LIMIT_PER_MINUTE/);
  });

  it("aucune origine croisée n'est autorisée par défaut", () => {
    setEnv("CORS_ALLOWED_ORIGINS", undefined);
    resetConfigCache();
    expect(config().corsAllowedOrigins).toEqual([]);
  });
});
