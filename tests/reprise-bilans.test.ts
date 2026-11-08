import { describe, expect, it } from "vitest";
import { emptyFinancials } from "@/financials/compute";
import { carryFinancials, nextClosing, suggestedExercise } from "@/lib/financial-statements";
import { checkPurposes, DEFAULT_PURPOSES, parsePurposes } from "@/reference/case-purposes";
import { confirmReprise, emptyDraft } from "@/lib/case-input";
import { CORP_STD_V1 } from "@/models";
import { pmeFinancials } from "./fixtures";

const stmt = (fiscalYear: string, closingDate: string, values: Record<string, string>) => ({
  fiscalYear,
  closingDate,
  values: JSON.stringify(values),
  statementModel: "NORMAL",
  certified: true,
});

describe("Exercice du dossier", () => {
  it("date de clôture de l'exercice suivant, fin de mois conservée", () => {
    expect(nextClosing("2024-12-31")).toBe("2025-12-31");
    expect(nextClosing("2023-02-28")).toBe("2024-02-29");
    expect(nextClosing("2024-06-30")).toBe("2025-06-30");
    expect(nextClosing("n/a")).toBe("");
  });

  it("propose l'exercice suivant dès qu'il est clos à la date d'arrêté", () => {
    expect(suggestedExercise("2024-12-31", "2026-03-15")).toBe("SUIVANT");
    expect(suggestedExercise("2024-12-31", "2025-06-30")).toBe("CONSERVE");
    expect(suggestedExercise(null, "2026-03-15")).toBe("CONSERVE");
    expect(suggestedExercise("2024-12-31", "2026-03-15", { code: "X", labelFr: "x", active: true, defaultExercise: "CONSERVE" })).toBe("CONSERVE");
  });
});

describe("Reprise du bilan de la dernière note validée", () => {
  it("même exercice : le bilan est repris tel quel", () => {
    const prev = pmeFinancials();
    const r = carryFinancials(prev, [], "CONSERVE", emptyFinancials());
    expect(r.financials.years.map((y) => y.fiscalYear)).toEqual(["2025", "2024"]);
    expect(r.financials.years[0].values).toEqual(prev.years[0].values);
    expect(r.toLoad).toBeNull();
  });

  it("exercice suivant : N devient N−1, N−1 devient N−2, seul le nouveau N est à charger", () => {
    const prev = pmeFinancials();
    prev.overrides = { "D1.5": { value: "2", reason: "crédit-bail" } };
    const r = carryFinancials(prev, [], "SUIVANT", emptyFinancials());
    expect(r.financials.years.map((y) => y.fiscalYear)).toEqual(["2026", "2025", "2024"]);
    expect(r.financials.years[0]).toEqual({ fiscalYear: "2026", closingDate: "2026-12-31", values: {} });
    expect(r.financials.years[1].values).toEqual(prev.years[0].values);
    expect(r.financials.years[2].values).toEqual(prev.years[1].values);
    expect(r.financials.overrides).toEqual({});
    expect(r.carriedYears).toEqual(["2025", "2024"]);
    expect(r.toLoad).toBe("2026");
  });

  it("le nouveau bilan déjà au référentiel (reprise du stock) est pré-rempli", () => {
    const prev = pmeFinancials();
    const r = carryFinancials(prev, [stmt("2026", "2026-12-31", { VENTES_BIENS_SERVICES: "110000000" })], "SUIVANT", emptyFinancials());
    expect(r.financials.years[0].values.VENTES_BIENS_SERVICES).toBe("110000000");
    expect(r.toLoad).toBeNull();
  });

  it("sans note validée : bilans repris du référentiel du client", () => {
    const r = carryFinancials(null, [stmt("2025", "2025-12-31", { STOCKS: "1" }), stmt("2024", "2024-12-31", { STOCKS: "2" })], "SUIVANT", emptyFinancials());
    expect(r.financials.years.map((y) => y.closingDate)).toEqual(["2026-12-31", "2025-12-31", "2024-12-31"]);
    expect(r.financials.years[1].values.STOCKS).toBe("1");
  });

  it("aucun bilan : dossier vierge", () => {
    const r = carryFinancials(null, [], "SUIVANT", emptyFinancials());
    expect(r.financials.years.every((y) => Object.keys(y.values).length === 0)).toBe(true);
    expect(r.carriedYears).toEqual([]);
  });
});

describe("Champs repris à confirmer", () => {
  it("une modification ou une confirmation retire le champ de la liste", () => {
    const d = { ...emptyDraft(CORP_STD_V1, "2026-03-31"), reprise: { fromCaseId: "c1", fromAsOfDate: "2025-03-31", fromGrade: "4", exercise: "SUIVANT" as const, carriedYears: ["2025"], toLoad: "2026", pending: ["D3.1", "D5.2", "AMOUNTS"] } };
    expect(confirmReprise(d, ["D3.1"]).reprise?.pending).toEqual(["D5.2", "AMOUNTS"]);
    expect(confirmReprise(d, "ALL").reprise?.pending).toEqual([]);
    expect(confirmReprise(d, ["X"])).toBe(d);
  });
});

describe("Motifs des dossiers", () => {
  it("liste embarquée valide ; liste stockée invalide ignorée", () => {
    expect(checkPurposes(DEFAULT_PURPOSES)).toEqual([]);
    expect(DEFAULT_PURPOSES.map((p) => p.code)).toContain("RENOUVELLEMENT_CT");
    expect(DEFAULT_PURPOSES.map((p) => p.code)).toContain("INVESTISSEMENT");
    expect(parsePurposes('[{"code":"bad code","labelFr":"","active":true}]')).toBe(DEFAULT_PURPOSES);
    expect(checkPurposes([{ code: "A1", labelFr: "x", active: false }])).toContain("Au moins un motif actif.");
  });
});
