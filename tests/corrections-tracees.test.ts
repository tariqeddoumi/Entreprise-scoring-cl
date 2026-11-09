import { describe, expect, it } from "vitest";
import { applyCorrections, checkCorrection, parseAmountLoose, setAt, type Correction } from "@/reference/corrections";
import { checkReport, compareIdentity, normalizeReport, readingControls, reportFieldSpec } from "@/reference/credit-report";
import { analyseProfile, normalizeProfile, profileFieldSpec } from "@/reference/legal-profile";
import { computeFinancials, editYearValue, emptyFinancials } from "@/financials/compute";
import { SCOPED_MODELS } from "@/lib/scope";

const corr = (path: string, after: unknown): Correction => ({
  id: path,
  path,
  labelFr: path,
  before: null,
  after,
  motif: "Mainlevée reçue le 2026-10-02",
  documentId: null,
  documentName: null,
  by: "analyste",
  at: "2026-10-03T10:00:00Z",
});

describe("Montants imprimés", () => {
  it("formats marocain, européen, anglo-saxon, devise, négatifs", () => {
    expect(parseAmountLoose("1 234 567,89")).toBeCloseTo(1234567.89);
    expect(parseAmountLoose("1.234.567,89")).toBeCloseTo(1234567.89);
    expect(parseAmountLoose("1,234,567.89")).toBeCloseTo(1234567.89);
    expect(parseAmountLoose("12 500 DH")).toBe(12500);
    expect(parseAmountLoose("1.234")).toBe(1234);
    expect(parseAmountLoose("(1 000)")).toBe(-1000);
    expect(parseAmountLoose("n/a")).toBeNull();
  });
});

describe("Corrections motivées", () => {
  it("le rapport lu reste intact ; la vue corrigée applique les corrections dans l'ordre", () => {
    const raw = { lines: [{ overdue: 50000 }, { overdue: 0 }] };
    const view = applyCorrections(raw, [corr("lines.0.overdue", 10000), corr("lines.0.overdue", 0)]);
    expect(view.lines[0].overdue).toBe(0);
    expect(raw.lines[0].overdue).toBe(50000);
  });

  it("chemins dangereux ou inexistants sans effet", () => {
    const o = { a: { b: 1 } };
    expect(setAt(o, "__proto__.x", 1)).toBe(o);
    expect(setAt(o, "a.constructor", 1)).toBe(o);
    expect(setAt(o, "a.c", 1)).toBe(o);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it("contrôle : champ corrigible, motif, type, valeur différente", () => {
    const data = normalizeReport({ lines: [{ institution: "Banque X", outstanding: 100000, overdue: 20000, status: "IMPAYE" }] });
    expect(checkCorrection({ path: "lines.0.overdue", value: "0", motif: "court" }, reportFieldSpec, data)).toMatchObject({ ok: false });
    expect(checkCorrection({ path: "lines.0.overdue", value: "abc", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: false });
    expect(checkCorrection({ path: "lines.0.overdue", value: "20 000", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: false });
    expect(checkCorrection({ path: "lines.0.foo", value: "1", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: false });
    expect(checkCorrection({ path: "lines.3.overdue", value: "1", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: false });
    expect(checkCorrection({ path: "lines.0.overdue", value: "0", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: true, value: 0, before: 20000 });
    expect(checkCorrection({ path: "lines.0.status", value: "EN_COURS", motif: "Impayé régularisé, attestation jointe" }, reportFieldSpec, data)).toMatchObject({ ok: true });
  });

  it("InfoRisque : un événement levé n'a plus d'effet sur l'analyse", () => {
    const p = normalizeProfile({ reportDate: "2026-10-01", identity: { name: "X" }, legalEvents: [{ kind: "REDRESSEMENT", date: "2025-01-10", labelFr: "Ouverture" }] });
    const before = analyseProfile(p, { today: "2026-10-05", maxAgeDays: 90 });
    expect(profileFieldSpec("legalEvents.0.resolved")?.kind).toBe("boolean");
    const after = analyseProfile(applyCorrections(p, [corr("legalEvents.0.resolved", true)]), { today: "2026-10-05", maxAgeDays: 90 });
    expect(after.signals.length).toBeLessThan(before.signals.length + (before.signals.length === 0 ? 1 : 0));
    expect(after.findings.some((f) => /levé/.test(f.textFr))).toBe(true);
  });
});

describe("Rapport de solvabilité : lecture complète", () => {
  it("plusieurs crédits, confrères anonymisés : rapport accepté", () => {
    const data = normalizeReport({
      lines: [
        { institution: "", type: "Crédit d'investissement", outstanding: "1 200 000,00", overdue: "0" },
        { institution: "", type: "Facilité de caisse", authorized: "500.000,00", outstanding: "480 000" },
        { institution: "Banque Populaire", ownBank: true, type: "Escompte", outstanding: "250 000" },
      ],
      printedTotals: { lineCount: 3, outstanding: "1 930 000" },
    });
    expect(data.lines).toHaveLength(3);
    expect(data.lines[0].outstanding).toBe(1200000);
    expect(data.lines[0].institution).not.toBe("");
    expect(checkReport("2026-10-01", data, "2026-10-05")).toEqual([]);
    expect(readingControls(data).some((f) => f.level === "ALERTE")).toBe(false);
  });

  it("lignes manquantes ou totaux discordants : signalés", () => {
    const data = normalizeReport({ lines: [{ institution: "A", outstanding: 100 }], printedTotals: { lineCount: 4, outstanding: 1000 } });
    const f = readingControls(data);
    expect(f.some((x) => x.level === "ALERTE")).toBe(true);
    expect(f.some((x) => x.level === "ATTENTION")).toBe(true);
  });

  it("signalétique comparée à la fiche client", () => {
    const checks = compareIdentity({ ice: "001234567000089", rc: "12345", cnss: "7654321", commercialCourt: "Casablanca" }, { ice: "001 234 567 000 089", rc: "99999", cnss: "" });
    const by = Object.fromEntries(checks.map((c) => [c.field, c.status]));
    expect(by.ice).toBe("IDENTIQUE");
    expect(by.rc).toBe("DIFFERENT");
    expect(by.cnss).toBe("MANQUANT_FICHE");
    expect(by.commercialCourt).toBe("MANQUANT_FICHE");
  });
});

describe("Bilan : valeur lue corrigée", () => {
  it("valeur lue conservée, motif exigé, retour à la valeur lue efface la correction", () => {
    const y0 = { fiscalYear: "2025", closingDate: "2025-12-31", values: { CHIFFRE_AFFAIRES: "1000000" }, lineage: { CHIFFRE_AFFAIRES: { source: "p. 3", confidence: 92 } } };
    const y1 = editYearValue(y0, "CHIFFRE_AFFAIRES", "1100000");
    expect(y1.corrections?.CHIFFRE_AFFAIRES).toEqual({ read: "1000000", reason: "" });
    expect(y1.lineage?.CHIFFRE_AFFAIRES).toBeUndefined();
    const y2 = editYearValue(y1, "CHIFFRE_AFFAIRES", "1200000");
    expect(y2.corrections?.CHIFFRE_AFFAIRES.read).toBe("1000000");
    expect(editYearValue(y2, "CHIFFRE_AFFAIRES", "1 000 000").corrections).toBeUndefined();
    const f = { ...emptyFinancials(), years: [y1, { fiscalYear: "2024", closingDate: "2024-12-31", values: {} }] };
    const ko = computeFinancials(f, "PME", { asOfDate: "2026-03-01" }).controls.filter((c) => c.key.startsWith("CORRECTION_LUE_"));
    expect(ko).toHaveLength(1);
    const ok = { ...f, years: [{ ...y1, corrections: { CHIFFRE_AFFAIRES: { read: "1000000", reason: "Erreur de lecture, liasse p. 3" } } }, f.years[1]] };
    expect(computeFinancials(ok, "PME", { asOfDate: "2026-03-01" }).controls.some((c) => c.key.startsWith("CORRECTION_LUE_"))).toBe(false);
  });
});

describe("Cloisonnement", () => {
  it("rapports juridiques et pièces client cloisonnés", () => {
    expect(SCOPED_MODELS).toHaveProperty("LegalReport");
    expect(SCOPED_MODELS).toHaveProperty("CounterpartyDocument");
  });
});
