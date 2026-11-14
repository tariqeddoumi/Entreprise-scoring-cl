import { describe, expect, it } from "vitest";
import { applyReconciliation, compareWithT24, effectiveFacilities, matchScore, proposeFacilityMatches, type MatchableLine } from "@/reference/reconciliation";
import { checkAgainstLists, matchOption, parseEntryLists } from "@/reference/entry-lists";

const lists = parseEntryLists({});
const t24 = {
  name: "CONSERVERIE ATLAS SA",
  legalForm: "Société anonyme",
  ice: "001234567000089",
  rc: "12345",
  fiscalId: "4455667",
  sectorCode: "NMAE_C",
  commercialSegment: "PME",
  city: "CASABLANCA",
  country: "MA",
  currency: null,
  accountOfficer: "CA0107",
};

describe("Listes de saisie", () => {
  it("valeurs figées : hors liste refusé, valeur déjà enregistrée admise", () => {
    expect(checkAgainstLists({ legalForm: "SA", sectorCode: "NMAE_C", city: "Casablanca" }, lists)).toEqual([]);
    expect(checkAgainstLists({ legalForm: "S.A.R.L" }, lists)).toHaveLength(1);
    expect(checkAgainstLists({ sectorCode: "G46" }, lists, { sectorCode: "G46" })).toEqual([]);
    expect(checkAgainstLists({ city: "casablanca" }, lists)).toEqual([]);
  });
  it("texte libre ramené à la liste (OCR, T24)", () => {
    expect(matchOption(lists.legalForms, "S.A.")).toBe("SA");
    expect(matchOption(lists.legalForms, "Société anonyme (SA)")).toBe("SA");
    expect(matchOption(lists.legalForms, "SARL AU")).toBe("SARL_AU");
    expect(matchOption(lists.cities, "FES", "label")).toBe("Fès");
    expect(matchOption(lists.legalForms, "Fondation")).toBeNull();
  });
});

describe("Rapprochement de la fiche avec T24", () => {
  const manual = { name: "Conserverie Atlas SA", legalForm: "SA", ice: "001234567000089", rc: "99999", sectorCode: "NMAE_C", commercialSegment: "PME", city: "Casablanca", fiscalId: null, country: null, currency: null, accountOfficer: null };
  const rows = compareWithT24(manual, t24, lists);
  const by = Object.fromEntries(rows.map((r) => [r.field, r]));
  it("identique au libellé près ou par la liste, écart, complété par T24", () => {
    expect(by.name.status).toBe("IDENTIQUE");
    expect(by.legalForm.status).toBe("IDENTIQUE");
    expect(by.city.status).toBe("IDENTIQUE");
    expect(by.rc.status).toBe("ECART");
    expect(by.fiscalId.status).toBe("A_COMPLETER");
    expect(by.currency).toBeUndefined();
  });
  it("T24 fait foi par défaut ; garder la saisie exige un motif", () => {
    const who = { by: "ana.ma", at: "2026-11-14T10:00:00Z" };
    const r1 = applyReconciliation(rows, {}, {}, who);
    expect(r1.update.rc).toBe("12345");
    expect(r1.update.fiscalId).toBe("4455667");
    expect(r1.kept).toEqual({});
    expect(applyReconciliation(rows, { rc: "SAISIE" }, { rc: "court" }, who).issues).toHaveLength(1);
    const r2 = applyReconciliation(rows, { rc: "SAISIE" }, { rc: "RC transféré au tribunal de Rabat, T24 pas à jour" }, who);
    expect(r2.update.rc).toBeUndefined();
    expect(r2.kept.rc).toMatchObject({ value: "99999", t24: "12345" });
  });
});

describe("Rapprochement des engagements", () => {
  const L = (id: string, source: "API" | "SAISIE", reference: string, typeCode: string, authorized: number | null, outstanding: number | null, extra: Partial<MatchableLine> = {}): MatchableLine => ({ id, source, reference, typeCode, authorized, outstanding, maturityDate: "", ...extra });
  const lines = [
    L("m1", "SAISIE", "", "FACILITE_CAISSE", 5_000_000, 4_100_000),
    L("m2", "SAISIE", "CMT-778", "CMT", 8_000_000, 6_000_000),
    L("m3", "SAISIE", "", "ESCOMPTE", 500_000, 100_000),
    L("a1", "API", "FC-001", "FACILITE_CAISSE", 5_000_000, 4_200_000),
    L("a2", "API", "CMT-778", "CMT", 8_000_000, 5_900_000),
  ];
  it("appariement proposé par référence, type et montants ; une ligne T24 ne sert qu'une fois", () => {
    const p = Object.fromEntries(proposeFacilityMatches(lines).map((x) => [x.manualId, x]));
    expect(p.m1.apiId).toBe("a1");
    expect(p.m2.apiId).toBe("a2");
    expect(p.m2.why).toContain("même référence");
    expect(p.m3.apiId).toBeNull();
    expect(matchScore(lines[2], lines[3]).score).toBeLessThan(60);
  });
  it("sans ligne T24 : rien à rapprocher", () => {
    expect(proposeFacilityMatches(lines.filter((l) => l.source === "SAISIE"))).toEqual([]);
  });
  it("pas de double comptage : saisie non rapprochée hors totaux dès que T24 a fourni des lignes", () => {
    const rows = lines.map((l) => ({ ...l, reconciliation: null as string | null }));
    expect(effectiveFacilities(rows.filter((l) => l.source === "SAISIE")).effective).toHaveLength(3);
    const e = effectiveFacilities(rows);
    expect(e.effective.map((l) => l.id)).toEqual(["a1", "a2"]);
    expect(e.pending).toHaveLength(3);
    rows[2].reconciliation = "CONSERVEE";
    rows[0].reconciliation = "RAPPROCHEE";
    rows[1].reconciliation = "ECARTEE";
    const e2 = effectiveFacilities(rows);
    expect(e2.effective.map((l) => l.id).sort()).toEqual(["a1", "a2", "m3"]);
    expect(e2.pending).toHaveLength(0);
  });
});
