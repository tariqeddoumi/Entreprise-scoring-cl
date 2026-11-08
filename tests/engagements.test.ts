import { describe, expect, it } from "vitest";
import {
  analyseFacilities,
  checkFacilities,
  checkFacilityTypes,
  DEFAULT_FACILITY_TYPES,
  facilityTotals,
  mapT24Facilities,
  normalizeFacility,
  parseFacilityFieldMap,
  parseFacilityTypes,
} from "@/reference/facilities";
import { computeClassification, DEFAULT_CLASSIFICATION } from "@/reference/classification";
import { SCOPED_MODELS } from "@/lib/scope";

const M = 1_000_000;
const lines = [
  normalizeFacility({ reference: "L1", typeCode: "FACILITE_CAISSE", authorized: 5 * M, outstanding: 6 * M }),
  normalizeFacility({ reference: "L2", typeCode: "CMT", authorized: 10 * M, outstanding: 7 * M, maturityDate: "2030-06-30" }),
  normalizeFacility({ reference: "L3", typeCode: "CAUTION_MARCHES", authorized: 4 * M, outstanding: 2 * M }),
  normalizeFacility({ reference: "L4", typeCode: "ESCOMPTE", authorized: 1 * M, outstanding: 0, status: "CLOTUREE" }),
];

describe("Engagements ligne par ligne : totaux et engagement global", () => {
  it("lecture tolérante : type inconnu → AUTRE, dates T24, statut, montants", () => {
    const l = normalizeFacility({ typeCode: "XYZ", authorized: "1 500 000,50", maturityDate: "20271231", status: "bizarre", overdueDays: 12.6 });
    expect(l).toMatchObject({ typeCode: "AUTRE", authorized: 1_500_000.5, maturityDate: "2027-12-31", status: "ACTIVE", overdueDays: 13 });
  });

  it("le plus grand de l'autorisé et de l'encours (défaut) ; ligne clôturée exclue", () => {
    const t = facilityTotals(lines);
    expect(t.lines).toBe(3);
    expect(t.authorized).toBe(19 * M);
    expect(t.outstanding).toBe(15 * M);
    // max(5,6) + max(10,7) + max(4,2) = 20
    expect(t.exposure).toBe(20 * M);
    expect(t.bilan).toEqual({ authorized: 15 * M, outstanding: 13 * M });
    expect(t.horsBilan).toEqual({ authorized: 4 * M, outstanding: 2 * M });
    expect(t.longTerm.outstanding).toBe(7 * M);
    expect(Math.round(t.utilisationPct!)).toBe(79);
  });

  it("base autorisé ou encours ; pondération de la signature", () => {
    expect(facilityTotals(lines, undefined, { basis: "AUTORISE", offBalanceWeightPct: 100 }).exposure).toBe(19 * M);
    expect(facilityTotals(lines, undefined, { basis: "ENCOURS", offBalanceWeightPct: 100 }).exposure).toBe(15 * M);
    expect(facilityTotals(lines, undefined, { basis: "MAX", offBalanceWeightPct: 50 }).exposure).toBe(18 * M);
  });
});

describe("Engagements : constats et signaux", () => {
  it("dépassement de plus de 10 %, ligne échue utilisée, impayé de plus de 180 jours", () => {
    const ls = [...lines, normalizeFacility({ reference: "L5", typeCode: "CREDIT_SPOT", authorized: 1 * M, outstanding: 1 * M, overdue: 200_000, overdueDays: 200, maturityDate: "2026-01-31" })];
    const a = analyseFacilities(ls, "2026-11-08");
    const text = a.findings.map((f) => f.textFr).join(" | ");
    expect(text).toMatch(/L1\) : dépassement de 20 %/);
    expect(text).toMatch(/L5\) : ligne échue/);
    expect(text).toMatch(/le plus ancien à 200 jours/);
    expect(a.signals).toEqual(["FAC_IMPAYE_180"]);
  });

  it("rapprochement avec le crédit bureau et avec le montant du dossier ; position ancienne", () => {
    const a = analyseFacilities(lines, "2026-11-08", { bureauOwnOutstanding: 10 * M, declaredExposure: 12 * M, positionDate: "2026-08-01" });
    const text = a.findings.map((f) => f.textFr).join(" | ");
    expect(text).toMatch(/crédit bureau .* écart de 33 %/);
    expect(text).toMatch(/Engagement global saisi au dossier/);
    expect(text).toMatch(/Position des engagements datée du 2026-08-01/);
    expect(analyseFacilities(lines, "2026-11-08", { bureauOwnOutstanding: 15.5 * M, declaredExposure: 20 * M }).findings).toHaveLength(1); // dépassement L1 seul
  });

  it("un impayé de plus de 90 jours propose E04 à vérifier", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, undefined, new Set(["FAC_IMPAYE_90"]));
    expect(r.items.find((i) => i.code === "E04")?.state).toBe("SUGGERE");
  });

  it("contrôles de saisie", () => {
    expect(checkFacilities(lines)).toEqual([]);
    const bad = [normalizeFacility({ typeCode: "CMT" }), normalizeFacility({ typeCode: "CMT", authorized: -1, startDate: "2026-01-01", maturityDate: "2025-01-01" })];
    const issues = checkFacilities(bad).join(" ");
    expect(issues).toMatch(/autorisé ou encours requis/);
    expect(issues).toMatch(/négatif/);
    expect(issues).toMatch(/échéance antérieure/);
  });
});

describe("Engagements : T24 et paramétrage", () => {
  it("limites T24 : liste trouvée, codes produit traduits, statuts", () => {
    const json = {
      header: {},
      body: [
        { limitId: "100245.0001", limitProduct: "1100", limitProductName: "FACILITE DE CAISSE", internalAmount: "5000000", utilisedAmount: "4200000", expiryDate: "20270630", limitStatus: "ACTIVE" },
        { limitId: "100245.0002", limitProduct: "2100", internalAmount: 10000000, utilisedAmount: 7000000, overdueAmount: 0, expiryDate: "20300630" },
        { limitId: "100245.0003", limitProduct: "9999", internalAmount: 1000, utilisedAmount: 0, limitStatus: "CLOSED" },
      ],
    };
    const map = parseFacilityFieldMap(JSON.stringify({ products: { "1100": "FACILITE_CAISSE", "2100": "CMT" } }));
    const ls = mapT24Facilities(json, DEFAULT_FACILITY_TYPES, map);
    expect(ls.map((l) => [l.reference, l.typeCode, l.status])).toEqual([
      ["100245.0001", "FACILITE_CAISSE", "ACTIVE"],
      ["100245.0002", "CMT", "ACTIVE"],
      ["100245.0003", "AUTRE", "CLOTUREE"],
    ]);
    expect(ls[0]).toMatchObject({ authorized: 5 * M, outstanding: 4.2 * M, maturityDate: "2027-06-30", labelFr: "FACILITE DE CAISSE" });
    expect(ls[2].labelFr).toBe("9999");
  });

  it("types paramétrables : contrôles ; AUTRE obligatoire ; défaut si invalide", () => {
    expect(checkFacilityTypes(DEFAULT_FACILITY_TYPES)).toEqual([]);
    expect(checkFacilityTypes(DEFAULT_FACILITY_TYPES.filter((t) => t.code !== "AUTRE")).join(" ")).toMatch(/AUTRE est requis/);
    expect(parseFacilityTypes("[]")).toEqual(DEFAULT_FACILITY_TYPES);
  });

  it("les lignes d'engagement sont cloisonnées au périmètre et au portefeuille", () => {
    expect(SCOPED_MODELS.CreditFacility(["e1"])).toEqual({ counterparty: { entityId: { in: ["e1"] } } });
  });
});
