import { describe, expect, it } from "vitest";
import { CORP_STD_V1 } from "@/models";
import { isOfficialRun, OFFICIAL_RUN_WHERE } from "@/lib/cases";
import {
  createBatchSchema,
  describeFilters,
  firstRunAt,
  movementOf,
  nextRunAfter,
  normalizeRefreshRows,
  notchDelta,
  parseRefreshCsv,
  previousMonthEnd,
  renotationFiltersSchema,
  scheduleSchema,
} from "@/lib/renotation";
import { SCOPED_MODELS } from "@/lib/scope";

describe("Renotation par lot : calendrier", () => {
  it("prend pour date d'arrêté la fin du mois précédent", () => {
    expect(previousMonthEnd(new Date("2026-10-05T02:00:00Z"))).toBe("2026-09-30");
    expect(previousMonthEnd(new Date("2026-03-01T00:00:00Z"))).toBe("2026-02-28");
    expect(previousMonthEnd(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12-31");
  });

  it("fixe la première échéance au jour choisi, ce mois-ci s'il n'est pas passé", () => {
    expect(firstRunAt(new Date("2026-10-03T10:00:00Z"), 5).toISOString()).toBe("2026-10-05T02:00:00.000Z");
    expect(firstRunAt(new Date("2026-10-06T10:00:00Z"), 5).toISOString()).toBe("2026-11-05T02:00:00.000Z");
  });

  it("enchaîne les échéances selon la fréquence, au même jour", () => {
    const d = new Date("2026-11-05T02:00:00Z");
    expect(nextRunAfter(d, 1, 5).toISOString()).toBe("2026-12-05T02:00:00.000Z");
    expect(nextRunAfter(d, 3, 5).toISOString()).toBe("2027-02-05T02:00:00.000Z");
    expect(nextRunAfter(d, 12, 5).toISOString()).toBe("2027-11-05T02:00:00.000Z");
  });

  it("refuse une fréquence ou un jour hors des valeurs prévues", () => {
    const base = { name: "Mensuelle PME", dayOfMonth: 5, filters: {}, options: { notchThreshold: 1, openCases: true } };
    expect(scheduleSchema.safeParse({ ...base, intervalMonths: 1 }).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...base, intervalMonths: 2 }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, intervalMonths: 1, dayOfMonth: 31 }).success).toBe(false);
  });
});

describe("Renotation par lot : sélection", () => {
  it("accepte groupe d'affaires, segment et secteur, et refuse un critère inconnu", () => {
    expect(renotationFiltersSchema.safeParse({ economicGroupId: "g1", segment: "PME", sectorPrefix: "C10" }).success).toBe(true);
    expect(renotationFiltersSchema.safeParse({ segment: "XL" }).success).toBe(false);
    expect(renotationFiltersSchema.safeParse({ note: "STD-P1" }).success).toBe(false);
  });

  it("décrit la sélection en clair", () => {
    expect(describeFilters({})).toBe("tout le périmètre");
    expect(describeFilters({ economicGroupId: "g1", segment: "GE", sectorPrefix: "F41" }, { groups: { g1: "GRP-HOLDA" } })).toBe(
      "groupe GRP-HOLDA, segment GE, secteur F41*"
    );
  });

  it("valide la requête de l'API comme l'écran", () => {
    expect(createBatchSchema.safeParse({ name: "Lot", asOfDate: "2026-09-30" }).success).toBe(true);
    expect(createBatchSchema.safeParse({ name: "Lot", asOfDate: "30/09/2026" }).success).toBe(false);
    expect(createBatchSchema.safeParse({ name: "Lot", asOfDate: "2026-09-30", options: { notchThreshold: 0 } }).success).toBe(false);
  });
});

describe("Renotation par lot : fichier de mise à jour", () => {
  it("lit un CSV « ; » par ICE et contrôle chaque valeur contre la grille", () => {
    const csv = "ice;criteria.D3.1.value;criteria.D3.5.score;redFlags.RF07;inconnu\n001234567000089;12;75;true;x\n002;abc;60;oui;\n";
    const r = parseRefreshCsv(csv);
    expect(r.columns).toEqual(["criteria.D3.1.value", "criteria.D3.5.score", "redFlags.RF07"]);
    expect(r.rows[0]).toEqual({
      ref: "001234567000089",
      updates: { "criteria.D3.1.value": "12", "criteria.D3.5.score": "75", "redFlags.RF07": "true" },
    });
    // Valeurs hors grille : refusées, jamais appliquées.
    expect(r.rows[1].updates).toEqual({});
    expect(r.errors.join(" ")).toMatch(/inconnu/);
    expect(r.errors.join(" ")).toMatch(/« abc » refusée/);
    expect(r.errors.join(" ")).toMatch(/« 60 » refusée/);
  });

  it("accepte aussi la virgule, les guillemets et l'identifiant interne", () => {
    const r = parseRefreshCsv('id,amounts.globalBankExposure\n"cp_1","1 250 000"\n');
    expect(r.rows).toEqual([{ ref: "cp_1", updates: { "amounts.globalBankExposure": "1250000" } }]);
  });

  it("refuse un fichier sans colonne d'identification", () => {
    expect(parseRefreshCsv("nom;criteria.D3.1.value\nX;3").errors[0]).toMatch(/ice/);
  });

  it("applique la même règle aux lignes reçues par l'API", () => {
    const r = normalizeRefreshRows([{ ref: "cp_1", updates: { "criteria.D3.1.value": 45, "criteria.D9.9.value": 1 } }]);
    expect(r.rows[0].updates).toEqual({ "criteria.D3.1.value": "45" });
    expect(r.errors).toEqual(["refresh[0].criteria.D9.9.value : champ inconnu."]);
  });
});

describe("Renotation par lot : migration", () => {
  it("compte les crans sur l'échelle du modèle (positif : dégradation)", () => {
    expect(notchDelta(CORP_STD_V1, "STD-P3", "STD-P5")).toBe(2);
    expect(notchDelta(CORP_STD_V1, "STD-P5", "STD-P4")).toBe(-1);
    expect(notchDelta(CORP_STD_V1, "STD-P4", "STD-P4")).toBe(0);
    expect(notchDelta(CORP_STD_V1, "STD-P4", null)).toBeNull();
    expect(notchDelta(CORP_STD_V1, "TPE-B2", "STD-P4")).toBeNull();
  });

  it("classe le mouvement : défaut et absence de note priment", () => {
    expect(movementOf({ ratingStatus: "DEFAULTED", finalGrade: "DEF1" }, 3)).toBe("DEFAULTED");
    expect(movementOf({ ratingStatus: "NO_RATING_INSUFFICIENT_DATA", finalGrade: null }, null)).toBe("NO_RATING");
    expect(movementOf({ ratingStatus: "RATED", finalGrade: "STD-P5" }, 2)).toBe("DOWNGRADE");
    expect(movementOf({ ratingStatus: "RATED", finalGrade: "STD-P3" }, -1)).toBe("UPGRADE");
    expect(movementOf({ ratingStatus: "RATED", finalGrade: "STD-P4" }, 0)).toBe("UNCHANGED");
  });
});

describe("Renotation par lot : la note officielle reste celle du dossier validé", () => {
  it("ne tient jamais pour officielle une notation de lot", () => {
    expect(isOfficialRun({ ratingCase: null, origin: "BATCH" })).toBe(false);
    expect(JSON.stringify(OFFICIAL_RUN_WHERE)).toContain('"origin":{"not":"BATCH"}');
  });

  it("cloisonne les lots, planifications, contreparties traitées et groupes d'affaires", () => {
    for (const m of ["RenotationBatch", "RenotationSchedule", "RenotationItem", "EconomicGroup"]) {
      expect(SCOPED_MODELS[m]).toBeTypeOf("function");
    }
    expect(SCOPED_MODELS.RenotationItem(["e1"])).toEqual({ counterparty: { entityId: { in: ["e1"] } } });
  });
});
