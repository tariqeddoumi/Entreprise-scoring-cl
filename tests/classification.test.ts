import { describe, expect, it } from "vitest";
import { computeFinancials } from "@/financials/compute";
import { draftToRequest, emptyDraft, type CaseDraft } from "@/lib/case-input";
import { ratingRequestSchema } from "@/lib/schemas";
import { checkClassification, computeClassification, DEFAULT_CLASSIFICATION } from "@/reference/classification";
import { CORP_STD_V1 } from "@/models";
import { pmeFinancials } from "./fixtures";

const M = 1_000_000;

describe("Critères de classement BAM : catalogue et effet", () => {
  it("paramétrage embarqué valide ; plafonds 8 et 10, défaut pour douteux et compromis", () => {
    expect(checkClassification(DEFAULT_CLASSIFICATION)).toEqual([]);
    expect(DEFAULT_CLASSIFICATION.caps).toEqual({ SENSIBLE: "8", PREDOUTEUX: "10", DOUTEUX: "DEF1", COMPROMIS: "DEF3" });
  });

  it("critère du bilan coché automatiquement ; la famille la plus sévère l'emporte", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, {}, new Set(["RECUL_CA_50"]));
    expect(r.items.find((i) => i.code === "S18")?.state).toBe("COCHE");
    expect(r.family).toBe("SENSIBLE");
    expect(r.effect).toEqual({ kind: "PLAFOND", grade: "8" });
    const p = computeClassification(DEFAULT_CLASSIFICATION, { E04: { date: "2026-10-01" } }, new Set(["RECUL_CA_50"]));
    expect(p.family).toBe("PREDOUTEUX");
    expect(p.effect).toEqual({ kind: "PLAFOND", grade: "10" });
    const d = computeClassification(DEFAULT_CLASSIFICATION, { E28: {} }, new Set());
    expect(d.effect).toEqual({ kind: "DEFAUT", grade: "DEF3" });
  });

  it("une alerte suggère un critère déclaratif sans le cocher (AGE à vérifier)", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, {}, new Set(["CP_QUART_CAPITAL"]));
    expect(r.items.find((i) => i.code === "E25")?.state).toBe("SUGGERE");
    expect(r.effect).toBeNull();
  });

  it("une levée par le comité neutralise le critère", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, { S01: {} }, new Set(["RECUL_CA_50"]), new Set(["S18", "S01"]));
    expect(r.lifted.sort()).toEqual(["S01", "S18"]);
    expect(r.family).toBeNull();
    expect(r.effect).toBeNull();
  });
});

describe("Effet dans la requête de notation", () => {
  const base = (): CaseDraft => ({ ...emptyDraft(CORP_STD_V1, "2026-06-30"), financials: pmeFinancials() });

  it("sensible : plafond transmis au moteur et critères figés dans l'instantané", () => {
    const d = { ...base(), classification: { declared: { S01: { date: "2026-05-02", comment: "ATD DGI" } } } };
    const req = draftToRequest(d, CORP_STD_V1);
    expect(req.regulatoryCap).toMatchObject({ maxGrade: "8", family: "SENSIBLE", codes: ["S01"] });
    expect((req.classificationBasis as { items: unknown[] }).items).toHaveLength(1);
    expect(ratingRequestSchema.safeParse({ ...req, counterpartyId: "x" }).success).toBe(true);
  });

  it("douteux : note de défaut ; levée : plus d'effet", () => {
    const d = { ...base(), classification: { declared: { E12: {} } } };
    const req = draftToRequest(d, CORP_STD_V1);
    expect(req.defaultTriggered).toBe(true);
    expect(req.defaultGrade).toBe("DEF1");
    const lifted = draftToRequest(d, CORP_STD_V1, undefined, { lifts: [{ codes: ["E12"], committeeDate: "2026-06-10", reference: "PV-1", recordedBy: "ce" }] });
    expect(lifted.defaultTriggered).toBe(false);
    expect((lifted.classificationBasis as { items: Array<{ state: string }> }).items[0].state).toBe("LEVE");
  });

  it("critère issu du bilan : recul du CA de plus de 50 %", () => {
    const d = base();
    d.financials.years[0].values.VENTES_BIENS_SERVICES = String(40 * M);
    expect(computeFinancials(d.financials, "CORP_STD_V1", { asOfDate: "2026-06-30" }).analysis.alerts.find((a) => a.key === "RECUL_CA_50")?.status).toBe("DECLENCHEE");
    const req = draftToRequest(d, CORP_STD_V1);
    expect(req.regulatoryCap).toMatchObject({ maxGrade: "8", codes: expect.arrayContaining(["S18"]) });
  });

  it("aucun critère : rien de transmis", () => {
    const req = draftToRequest(base(), CORP_STD_V1);
    expect(req.regulatoryCap).toBeUndefined();
    expect(req.classificationBasis).toBeUndefined();
  });
});

describe("Moteur 3.3 : plafond issu du classement BAM", async () => {
  const { computeRating } = await import("@/core/engine");
  const { tpeGoldenInput } = await import("./fixtures");
  const AT = "2026-09-17T00:00:00Z";
  it("plafonne une note meilleure, laisse une note déjà moins bonne, et trace la règle", () => {
    const free = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(Number(free.standaloneGrade)).toBeLessThan(8);
    const capped = computeRating(CORP_STD_V1, { ...tpeGoldenInput(), regulatoryCap: { maxGrade: "8", family: "SENSIBLE", codes: ["S01"], labelFr: "Créance sensible (S01)" } }, AT);
    expect(capped.engineGrade).toBe(free.engineGrade);
    expect(capped.standaloneGrade).toBe("8");
    expect(capped.appliedRules.find((r) => r.code === "BAM_SENSIBLE")?.source).toBe("REGULATORY");
    const loose = computeRating(CORP_STD_V1, { ...tpeGoldenInput(), regulatoryCap: { maxGrade: "1", family: "SENSIBLE", codes: ["S01"], labelFr: "x" } }, AT);
    expect(loose.standaloneGrade).toBe(free.standaloneGrade);
  });
});

describe("Watch list : effet sur la note (D-58)", async () => {
  const { combineCaps, checkWatchlistLevels, DEFAULT_WATCHLIST_LEVELS } = await import("@/reference/classification");
  const wl = (cap: string) => ({ level: "WL2", labelFr: "Surveillance renforcée", cap, since: "2026-09-15" });
  it("niveaux proposés valides : plafonds 8, 9, 10", () => {
    expect(checkWatchlistLevels(DEFAULT_WATCHLIST_LEVELS)).toEqual([]);
    expect(DEFAULT_WATCHLIST_LEVELS.map((l) => l.cap)).toEqual(["8", "9", "10"]);
  });
  it("le plus sévère des plafonds BAM et watch list s'applique ; cumul paramétrable", () => {
    expect(combineCaps("8", null)).toEqual({ cap: "8", source: "BAM" });
    expect(combineCaps(null, wl("9"))).toEqual({ cap: "9", source: "WATCHLIST" });
    expect(combineCaps("8", wl("9"))).toEqual({ cap: "9", source: "WATCHLIST" });
    expect(combineCaps("10", wl("9"))).toEqual({ cap: "10", source: "BAM" });
    expect(combineCaps("8", wl("8"), 1)).toEqual({ cap: "9", source: "CUMUL" });
    expect(combineCaps("10", wl("9"), 2)).toEqual({ cap: "10", source: "CUMUL" });
    expect(combineCaps(null, null)).toBeNull();
  });
  it("dans la requête : plafond combiné, watch list figée ; un défaut BAM prime", () => {
    const d = { ...emptyDraft(CORP_STD_V1, "2026-06-30"), financials: pmeFinancials(), classification: { declared: { S01: {} } } };
    const req = draftToRequest(d, CORP_STD_V1, undefined, { watchlist: wl("9") });
    expect(req.regulatoryCap).toMatchObject({ maxGrade: "9", family: "WATCHLIST" });
    expect((req.classificationBasis as { watchlist?: { level: string } }).watchlist?.level).toBe("WL2");
    expect(ratingRequestSchema.safeParse({ ...req, counterpartyId: "x" }).success).toBe(true);
    const onlyWl = draftToRequest({ ...d, classification: undefined }, CORP_STD_V1, undefined, { watchlist: wl("8") });
    expect(onlyWl.regulatoryCap).toMatchObject({ maxGrade: "8", family: "WATCHLIST", codes: ["WL2"] });
    const def = draftToRequest({ ...d, classification: { declared: { E28: {} } } }, CORP_STD_V1, undefined, { watchlist: wl("9") });
    expect(def.defaultGrade).toBe("DEF3");
    expect(def.regulatoryCap).toBeUndefined();
  });
});
