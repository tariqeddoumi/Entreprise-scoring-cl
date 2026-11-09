import { describe, expect, it } from "vitest";
import { activationBlocker, INTEGRATIONS, parseTest, targetOf, type IntegrationTest } from "../src/lib/integrations";

const t24 = INTEGRATIONS.find((d) => d.code === "T24")!;
const settings = { T24_BASE_URL: "https://t24.banque.ma", T24_CUSTOMER_PATH: "/api/v1.0.0/party/customers/", T24_FACILITIES_PATH: "/api/v1.0.0/holdings/limits/" };
const NOW = new Date("2026-11-08T10:00:00Z");
const okTest = (over: Partial<IntegrationTest> = {}): IntegrationTest => ({
  ok: true,
  at: "2026-11-01T10:00:00Z",
  by: "admin",
  target: targetOf(t24, settings),
  sample: "100245",
  messageFr: "Connexion réussie.",
  details: [],
  durationMs: 120,
  ...over,
});

describe("activation d'un raccordement", () => {
  it("toutes les API sont désactivées par défaut", async () => {
    const { SETTINGS } = await import("../src/lib/settings");
    for (const d of INTEGRATIONS) expect(SETTINGS.find((s) => s.key === d.flag)?.default).toBe("false");
  });

  it("refuse sans test, après un échec, ou un test trop ancien", () => {
    expect(activationBlocker(t24, null, settings, NOW)).toMatch(/aucun test/);
    expect(activationBlocker(t24, okTest({ ok: false, messageFr: "T24 ne répond pas." }), settings, NOW)).toMatch(/a échoué \(T24 ne répond pas\.\)/);
    expect(activationBlocker(t24, okTest({ at: "2026-09-01T10:00:00Z" }), settings, NOW)).toMatch(/plus de 30 jours/);
  });

  it("refuse si l'adresse a changé depuis le test", () => {
    expect(activationBlocker(t24, okTest(), { ...settings, T24_BASE_URL: "https://autre.banque.ma" }, NOW)).toMatch(/T24_BASE_URL modifié/);
  });

  it("accepte après un test réussi récent sur la même cible", () => {
    expect(activationBlocker(t24, okTest(), settings, NOW)).toBeNull();
  });

  it("relit un test enregistré, ignore un contenu illisible", () => {
    expect(parseTest(JSON.stringify(okTest()))?.ok).toBe(true);
    expect(parseTest("{")).toBeNull();
    expect(parseTest(JSON.stringify({ foo: 1 }))).toBeNull();
  });
});

describe("journal d'audit", async () => {
  const { parseJournalFilters, journalWhere, summarizeDetail } = await import("../src/lib/audit-journal");
  const { auditLabel } = await import("../src/lib/audit-labels");
  it("filtres validés, dates bornées", () => {
    const f = parseJournalFilters({ type: "User", action: "LOGIN_FAILED", acteur: " ana ", du: "2026-11-01", au: "2026-11-08", page: "3" });
    expect(f).toMatchObject({ resourceType: "User", action: "LOGIN_FAILED", actor: "ana", page: 3 });
    const w = journalWhere(f) as { createdAt: { gte: Date; lt: Date } };
    expect(w.createdAt.lt.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(parseJournalFilters({ type: "x;drop", action: "a b", du: "01/11/2026", page: "-4" })).toMatchObject({ resourceType: "", action: "", from: "", page: 1 });
  });
  it("résumé du détail et libellés", () => {
    expect(summarizeDetail(JSON.stringify([{ key: "T24_ENABLED", before: "false", after: "true" }]))).toBe("T24_ENABLED : false → true");
    expect(summarizeDetail(JSON.stringify({ code: "T24", ok: true, target: { a: 1 } }))).toBe("code : T24 · ok : true · target : {…}");
    expect(auditLabel("INTEGRATION_TESTED")).toBe("Test de connexion d'une API");
    expect(auditLabel("SOME_NEW_ACTION")).toBe("Some new action");
  });
});
