import { describe, expect, it } from "vitest";
import { computeFinancials, gridNeededPostes, INDICATORS } from "@/financials/compute";
import { evaluate, FormulaError, parseFormula } from "@/financials/formula";
import { levelOf, trendOf } from "@/financials/analysis";
import {
  checkFormat,
  DEFAULT_FORMAT,
  formatPostes,
  presetPostes,
  unavailablePostes,
  type StatementFormat,
} from "@/financials/statement-format";
import { pmeFinancials } from "./fixtures";

const M = 1_000_000;
const AS_OF = "2026-06-30";
const builtIn = INDICATORS.map((d) => d.key);
const fmt = (patch: Partial<StatementFormat>): StatementFormat => ({ ...DEFAULT_FORMAT, version: "TEST-1", ...patch });

describe("Formules du paramétrage", () => {
  const vals: Record<string, number[]> = { CA: [80, 100, 90], RN: [-1, -2, -3], CAP: [10, 10, 10] };
  const r = (n: string, i: number) => vals[n]?.[i] ?? null;

  it("calcule les opérations, PREC et EVOL", () => {
    expect(evaluate(parseFormula("CA / 2 + 1"), r)).toBe(41);
    expect(evaluate(parseFormula("PREC(CA)"), r)).toBe(100);
    expect(evaluate(parseFormula("PREC(CA; 2)"), r)).toBe(90);
    expect(evaluate(parseFormula("EVOL(CA)"), r)).toBeCloseTo(-20, 9);
    expect(evaluate(parseFormula("MAX(CA; 120) - MIN(1, 2)"), r)).toBe(119);
  });

  it("évalue les conditions et propage l'indisponibilité", () => {
    expect(evaluate(parseFormula("RN < 0 ET PREC(RN) < 0 ET PREC(RN;2) < 0"), r)).toBe(1);
    expect(evaluate(parseFormula("CA > 100 OU INCONNU > 0"), r)).toBeNull();
    expect(evaluate(parseFormula("CA > 50 OU INCONNU > 0"), r)).toBe(1);
    expect(evaluate(parseFormula("CA < 50 ET INCONNU > 0"), r)).toBe(0);
    expect(evaluate(parseFormula("CA / 0"), r)).toBeNull();
    expect(evaluate(parseFormula("NON (CA > 50)"), r)).toBe(0);
  });

  it("refuse une formule mal formée avec un message clair", () => {
    expect(() => parseFormula("CA +")).toThrow(FormulaError);
    expect(() => parseFormula("SQRT(CA)")).toThrow(/Fonction inconnue/);
    expect(() => parseFormula("CA ; 2")).toThrow(FormulaError);
    expect(() => parseFormula("PREC(CA; 3)")).toThrow(/1 ou 2/);
  });
});

describe("Appréciation des indicateurs", () => {
  it("classe selon le sens et les seuils", () => {
    const gearing = DEFAULT_FORMAT.appreciations.GEARING;
    expect(levelOf(0.5, gearing)).toBe("BON");
    expect(levelOf(1.5, gearing)).toBe("MOYEN");
    expect(levelOf(2.5, gearing)).toBe("MAUVAIS");
    expect(levelOf(3.5, gearing)).toBe("CRITIQUE");
    const dscr = DEFAULT_FORMAT.appreciations.DSCR;
    expect(levelOf(2, dscr)).toBe("BON");
    expect(levelOf(0.9, dscr)).toBe("CRITIQUE");
    expect(levelOf(null, dscr)).toBeNull();
  });

  it("tendance : variation significative ou changement de niveau", () => {
    const ca = DEFAULT_FORMAT.appreciations.CA;
    expect(trendOf(120, 100, ca).trend).toBe("AMELIORATION");
    expect(trendOf(105, 100, ca).trend).toBe("STABLE");
    expect(trendOf(80, 100, ca).trend).toBe("DEGRADATION");
    const g = DEFAULT_FORMAT.appreciations.GEARING;
    expect(trendOf(2.1, 1.95, g, ["MAUVAIS", "MOYEN"]).trend).toBe("DEGRADATION");
  });
});

describe("Analyse du bilan au chargement", () => {
  it("bilan sain : grille en tête, aucune alerte déclenchée", () => {
    const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: AS_OF });
    const a = fin.analysis;
    expect(a.formatVersion).toBe(DEFAULT_FORMAT.version);
    expect(a.appraisals.filter((x) => x.grid).map((x) => x.grid).sort()).toEqual(["D1.4", "D1.5", "D1.6", "D1.8", "D2.1", "D2.2", "D2.3"]);
    expect(a.alerts.filter((x) => x.status === "DECLENCHEE")).toEqual([]);
    expect(a.situation).toBe("SAINE");
  });

  it("recul du CA de plus de 50 % et capitaux propres négatifs : alertes critiques BAM", () => {
    const f = pmeFinancials();
    f.years[0].values.VENTES_BIENS_SERVICES = String(40 * M);
    f.years[0].values.REPORT_A_NOUVEAU = String(-80 * M);
    const fin = computeFinancials(f, "CORP_STD_V1", { asOfDate: AS_OF });
    const on = fin.analysis.alerts.filter((x) => x.status === "DECLENCHEE").map((x) => x.key);
    expect(on).toContain("RECUL_CA_50");
    expect(on).toContain("ENDETTEMENT_3");
    expect(on).toContain("CP_QUART_CAPITAL");
    expect(on).not.toContain("RECUL_CA_20");
    expect(fin.analysis.situation).toBe("CRITIQUE");
    expect(fin.analysis.alerts.find((x) => x.key === "RECUL_CA_50")?.referenceFr).toMatch(/1\/W\/2025/);
  });

  it("comptes anciens : alerte des comptes non reçus à 7 mois", () => {
    const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: "2027-09-15" });
    expect(fin.analysis.alerts.find((x) => x.key === "COMPTES_NON_RECUS")?.status).toBe("DECLENCHEE");
  });

  it("alerte sur trois exercices non évaluable sans N−2", () => {
    const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: AS_OF });
    expect(fin.analysis.alerts.find((x) => x.key === "DEFICITS_3_ANS")?.status).toBe("NON");
  });
});

describe("Format du bilan paramétrable", () => {
  it("le format embarqué est valide", () => {
    const r = checkFormat(DEFAULT_FORMAT, builtIn);
    expect(r.errors).toEqual([]);
  });

  it("un poste non chargé disparaît de la saisie et rend ses ratios non calculables", () => {
    const f = fmt({ postes: { STOCKS: "MASQUE" } });
    expect(formatPostes(f).some((p) => p.key === "STOCKS")).toBe(false);
    const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: AS_OF }, f);
    const dio = fin.indicators.find((i) => i.key === "DIO")!;
    expect(dio.values[0]).toBeNull();
    expect(dio.notes[0]).toMatch(/Stocks non chargé/);
    const g = gridNeededPostes(["CORP_STD_V1"]);
    expect(checkFormat(f, builtIn, g.byIndicator).warnings.join(" ")).toMatch(/Stocks/);
  });

  it("un total saisi directement remplace la somme et se contrôle contre le détail", () => {
    const f = fmt({ postes: { TOTAL_ACTIF_IMMOBILISE: "SAISI" } });
    const data = pmeFinancials();
    data.years[0].values.TOTAL_ACTIF_IMMOBILISE = String(41 * M);
    const fin = computeFinancials(data, "CORP_STD_V1", { asOfDate: AS_OF }, f);
    expect(fin.years[0].TOTAL_ACTIF_IMMOBILISE).toBe(41 * M);
    expect(fin.controls.find((c) => c.key === "AGREGE_TOTAL_ACTIF_IMMOBILISE_0")?.status).toBe("ALERTE");
  });

  it("préréglage « notation » : seulement les postes des ratios, ratios de la grille inchangés", () => {
    const { postes } = gridNeededPostes(["CORP_STD_V1"]);
    const f = fmt({ postes: presetPostes("NOTATION", postes) });
    expect(checkFormat(f, builtIn).errors).toEqual([]);
    const shown = formatPostes(f);
    expect(shown.length).toBeLessThan(formatPostes(DEFAULT_FORMAT).length);
    expect(unavailablePostes(f).has("PRODUITS_NON_COURANTS")).toBe(true);
    // Le client saisit les totaux utiles directement.
    const data = pmeFinancials();
    const full = computeFinancials(data, "CORP_STD_V1", { asOfDate: AS_OF });
    for (const y of [0, 1]) {
      for (const p of shown.filter((x) => x.kind === "TOTAL" && x.input)) data.years[y].values[p.key] = String(full.years[y][p.key]);
    }
    const lean = computeFinancials(data, "CORP_STD_V1", { asOfDate: AS_OF }, f);
    for (const g of full.gridRatios) expect(lean.gridRatios.find((x) => x.criterion === g.criterion)?.computed).toBe(g.computed);
    expect(lean.controls.filter((c) => c.status === "KO")).toEqual([]);
  });

  it("indicateur et alerte définis par formule", () => {
    const f = fmt({
      customIndicators: [{ key: "POIDS_STOCKS", labelFr: "Stocks / total bilan", unit: "%", group: "ACTIVITE", formula: "STOCKS / TOTAL_ACTIF * 100" }],
      alerts: [...DEFAULT_FORMAT.alerts, { key: "STOCKS_LOURDS", labelFr: "Stocks lourds", condition: "POIDS_STOCKS > 10", severity: "ALERTE", active: true }],
      appreciations: { ...DEFAULT_FORMAT.appreciations, POIDS_STOCKS: { sens: "BAISSE", bon: 10, mauvais: 25 } },
    });
    expect(checkFormat(f, builtIn).errors).toEqual([]);
    const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: AS_OF }, f);
    const v = fin.indicators.find((i) => i.key === "POIDS_STOCKS")!.values[0]!;
    expect(v).toBeGreaterThan(0);
    expect(fin.analysis.alerts.find((a) => a.key === "STOCKS_LOURDS")?.status).toBe(v > 10 ? "DECLENCHEE" : "NON");
  });

  it("refuse les incohérences du paramétrage", () => {
    const bad = fmt({
      postes: { STOCKS: "SAISI" as never },
      customIndicators: [{ key: "GEARING", labelFr: "x", unit: "%", group: "ACTIVITE", formula: "1+" }],
      appreciations: { GEARING: { sens: "BAISSE", bon: 3, mauvais: 2 } },
    });
    const e = checkFormat(bad, builtIn).errors.join(" | ");
    expect(e).toMatch(/Stocks : mode/);
    expect(e).toMatch(/Code déjà utilisé : GEARING/);
    expect(e).toMatch(/seuils dans l'ordre/);
  });
});
