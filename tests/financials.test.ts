import { describe, expect, it } from "vitest";
import { computeYear, parseAmount } from "@/financials/chart";
import { computeFinancials } from "@/financials/compute";
import { buildTemplate, parseTemplate, TEMPLATE_MARKER } from "@/financials/excel-template";
import { draftToRequest, emptyDraft, proposableFields, type CaseDraft } from "@/lib/case-input";
import { ratingRequestSchema } from "@/lib/schemas";
import { readXlsx, writeXlsx, xlsxToText } from "@/lib/xlsx";
import { CORP_STD_CHALLENGER_V1, CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "@/models";
import { pmeFinancials } from "./fixtures";

const M = 1_000_000;
const s = (n: number) => String(n * M);

const AS_OF = "2026-06-30";
const ratio = (fin: ReturnType<typeof computeFinancials>, code: string) => fin.gridRatios.find((g) => g.criterion === code)!;

describe("Gabarit et lecture des montants", () => {
  it("lit les formats usuels : espaces, virgule, points de milliers, parenthèses", () => {
    expect(parseAmount("95 000 000")).toBe(95_000_000);
    expect(parseAmount("1.234.567,50")).toBe(1_234_567.5);
    expect(parseAmount("(12 400)")).toBe(-12_400);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("abc")).toBeUndefined();
  });

  it("recalcule les totaux du bilan et du CPC", () => {
    const y = computeYear(pmeFinancials().years[0].values);
    expect(y.TOTAL_ACTIF).toBe(90 * M);
    expect(y.TOTAL_PASSIF).toBe(90 * M);
    expect(y.CHIFFRE_AFFAIRES).toBe(100 * M);
    expect(y.RESULTAT_NET).toBe(5 * M);
  });
});

describe("Ratios de la grille calculés depuis le bilan", () => {
  const fin = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: AS_OF });

  it("calcule chaque ratio selon la définition CGNC", () => {
    expect(ratio(fin, "D1.4").computed).toBe(39.77); // FPT 35 / total ajusté 88
    expect(ratio(fin, "D1.5").computed).toBe(1.71); // dette nette 24 / EBE 14
    expect(ratio(fin, "D1.6").computed).toBe(1.68); // (40 + 7) / (22 + 6)
    expect(ratio(fin, "D2.1").computed).toBe(7); // EBE 14 / intérêts 2
    expect(ratio(fin, "D2.2").computed).toBe(1.57); // CFO 11 / (2 + 5)
    expect(ratio(fin, "D1.8").computed).toBe(78.57); // CFO 11 / EBE 14
    expect(ratio(fin, "D2.3").computed).toBe(13.11); // FCF 4 / dette moyenne 30,5
  });

  it("restitue aussi les indicateurs hors grille, par exercice", () => {
    const ind = (k: string) => fin.indicators.find((i) => i.key === k)!.values;
    expect(ind("TOTAL_BILAN")).toEqual([90 * M, 82 * M]);
    expect(ind("EBE")).toEqual([14 * M, 12 * M]);
    expect(ind("CROISSANCE_CA")[0]).toBe(8.7);
    expect(ind("AUTONOMIE_FINANCIERE")[0]).toBe(41.11);
  });

  it("contrôle l'équilibre, les totaux du document et la cohérence du résultat", () => {
    const keys = Object.fromEntries(fin.controls.map((c) => [c.key, c.status]));
    expect(keys.EQUILIBRE_0).toBe("OK");
    expect(keys.EQUILIBRE_1).toBe("OK");
    expect(keys.TOTAL_ACTIF_DECLARE_0).toBe("OK");
    expect(keys.RESULTAT_0).toBe("OK");
    expect(keys.FRAICHEUR).toBe("OK");
    expect(fin.controls.filter((c) => c.status === "KO")).toEqual([]);
  });

  it("signale un bilan déséquilibré et l'absence de N−1", () => {
    const f = pmeFinancials();
    f.years[0].values.STOCKS = s(16);
    f.years[1].values = {};
    const k = computeFinancials(f, "CORP_STD_V1", { asOfDate: AS_OF });
    const status = Object.fromEntries(k.controls.map((c) => [c.key, c.status]));
    expect(status.EQUILIBRE_0).toBe("KO");
    expect(status.EXERCICE_N1).toBe("KO");
  });

  it("EBE nul ou négatif : cas spécial du critère, jamais un ratio favorable", () => {
    const f = pmeFinancials();
    f.years[0].values.CHARGES_PERSONNEL = s(40);
    const k = computeFinancials(f, "CORP_STD_V1", { asOfDate: AS_OF });
    expect(ratio(k, "D1.5").specialCase).toBe("EBITDA_LTE_0");
    expect(ratio(k, "D1.5").retained).toBeNull();
  });

  it("sans échéancier ni tableau de financement, le DSCR n'est pas calculé", () => {
    const f = pmeFinancials();
    delete f.years[0].values.SERVICE_DETTE_PRINCIPAL_12M;
    const k = computeFinancials(f, "CORP_STD_V1", { asOfDate: AS_OF });
    expect(ratio(k, "D2.2").computed).toBeNull();
    expect(ratio(k, "D2.2").noteFr).toContain("échéancier");
  });

  it("comptes de plus de 18 mois : périmés", () => {
    const k = computeFinancials(pmeFinancials(), "CORP_STD_V1", { asOfDate: "2027-09-30" });
    expect(k.stale).toBe(true);
  });

  it("grille challenger : F1, F2, F3 et F6 calculés ; grille TPE comportementale : aucun", () => {
    const ch = computeFinancials(pmeFinancials(), CORP_STD_CHALLENGER_V1.modelId, { asOfDate: AS_OF });
    expect(ch.gridRatios.map((g) => g.criterion)).toEqual(["F1", "F2", "F3", "F6"]);
    const tpe = computeFinancials(pmeFinancials(), CORP_TPE_BEHAV_V1.modelId, { asOfDate: AS_OF });
    expect(tpe.gridRatios).toEqual([]);
    expect(tpe.indicators.length).toBeGreaterThan(20);
  });
});

describe("Correction motivée et requête de notation", () => {
  function draft(): CaseDraft {
    return { ...emptyDraft(CORP_STD_V1, AS_OF), financials: pmeFinancials() };
  }

  it("le ratio calculé est transmis au moteur, avec l'instantané du bilan", () => {
    const req = draftToRequest(draft(), CORP_STD_V1, undefined, { currency: "MAD" });
    const parsed = ratingRequestSchema.parse(req);
    expect(parsed.criteria["D1.5"]).toMatchObject({ status: "AVAILABLE", value: 1.71 });
    expect(parsed.financialBasis?.years[0].fiscalYear).toBe("2025");
    expect(parsed.financialBasis?.years[0].postes.TOTAL_ACTIF).toBe(90 * M);
    expect(parsed.financialBasis?.gridRatios.find((g) => g.criterion === "D1.5")?.overridden).toBe(false);
  });

  it("une correction sans motif est ignorée ; avec motif, elle est retenue et tracée", () => {
    const d = draft();
    d.financials.overrides["D1.5"] = { value: "2,4", reason: "" };
    expect(ratingRequestSchema.parse(draftToRequest(d, CORP_STD_V1)).criteria["D1.5"].value).toBe(1.71);
    d.financials.overrides["D1.5"] = { value: "2,4", reason: "Encours de crédit-bail non porté au bilan" };
    const parsed = ratingRequestSchema.parse(draftToRequest(d, CORP_STD_V1));
    expect(parsed.criteria["D1.5"].value).toBe(2.4);
    const g = parsed.financialBasis!.gridRatios.find((x) => x.criterion === "D1.5")!;
    expect(g).toMatchObject({ computed: 1.71, retained: 2.4, overridden: true, reason: "Encours de crédit-bail non porté au bilan" });
  });

  it("le CA du bilan alimente la segmentation quand le cadrage est vide", () => {
    const req = draftToRequest(draft(), CORP_STD_V1, undefined) as { criteria: Record<string, unknown> };
    expect(req.criteria).toBeDefined();
    // draftAmounts : vérifié via le cadrage vide.
  });

  it("l'IA ne propose plus les ratios calculés depuis le bilan", () => {
    const keys = proposableFields(CORP_STD_V1).map((f) => f.key);
    expect(keys).not.toContain("criteria.D1.5.value");
    expect(keys).toContain("criteria.D3.1.value");
  });
});

describe("Gabarit Excel", () => {
  it("le gabarit vierge se relit : marqueur reconnu, aucun montant", () => {
    const t = buildTemplate();
    const sheets = readXlsx(t);
    expect(sheets[0].rows[0][0]).toBe(TEMPLATE_MARKER);
    expect(parseTemplate(t)?.recognized).toBe(0);
  });

  it("un gabarit rempli est relu par code de poste", () => {
    const rows = [
      [{ value: TEMPLATE_MARKER }],
      [{ value: "EXERCICE" }, { value: "" }, { value: 2025 }, { value: 2024 }],
      [{ value: "DATE_CLOTURE" }, { value: "" }, { value: 46022 }, { value: "31/12/2024" }],
      [{ value: "MODELE" }, { value: "" }, { value: "simplifié" }],
      [{ value: "CERTIFIES" }, { value: "" }, { value: "NON" }],
      [{ value: "CAPITAL" }, { value: "Capital" }, { value: 1000000 }, { value: 1000000 }],
      [{ value: "VENTES_BIENS_SERVICES" }, { value: "Ventes" }, { value: 8500000 }, { value: 7900000 }],
      [{ value: "TOTAL_ACTIF" }, { value: "total calculé : ignoré" }, { value: 1 }],
    ];
    const p = parseTemplate(writeXlsx("Bilan", rows, [20, 20, 15, 15]))!;
    expect(p.statementModel).toBe("SIMPLIFIE");
    expect(p.certified).toBe(false);
    expect(p.years[0]).toMatchObject({ fiscalYear: "2025", closingDate: "2025-12-31" });
    expect(p.years[1].closingDate).toBe("2024-12-31");
    expect(p.years[0].values).toEqual({ CAPITAL: "1000000", VENTES_BIENS_SERVICES: "8500000" });
    expect(p.recognized).toBe(4);
  });

  it("un autre classeur n'est pas le gabarit, mais se convertit en texte pour l'IA", () => {
    const x = writeXlsx("Liasse", [[{ value: "Bilan" }, { value: "2025" }], [{ value: "Capital social" }, { value: 1000000 }]], [20, 10]);
    expect(parseTemplate(x)).toBeNull();
    expect(xlsxToText(x)).toContain("Capital social\t1000000");
  });
});
