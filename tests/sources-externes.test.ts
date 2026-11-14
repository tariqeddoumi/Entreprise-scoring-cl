import { describe, expect, it } from "vitest";
import { checkMinimalEntry, checkT24Code, counterpartyFieldsFromT24, diffWithT24, mapT24Customer, normalizeT24Code, parseFieldMap } from "@/reference/core-banking";
import { analyseReport, checkReport, normalizeReport, reportFreshness } from "@/reference/credit-report";
import { analyseProfile, checkProfile, normalizeProfile } from "@/reference/legal-profile";
import { computeClassification, DEFAULT_CLASSIFICATION } from "@/reference/classification";
import { SCOPED_MODELS } from "@/lib/scope";

describe("T24 : code client, correspondance des champs, écarts", () => {
  it("code numérique, longueur paramétrable, espaces retirés", () => {
    expect(normalizeT24Code(" 100 245 ")).toBe("100245");
    expect(checkT24Code("100245")).toBeNull();
    expect(checkT24Code("")).toMatch(/requis/);
    expect(checkT24Code("AB12")).toMatch(/numérique/);
    expect(checkT24Code("12345678901")).toMatch(/1 à 10/);
    expect(checkT24Code("1234", { minDigits: 6, maxDigits: 6 })).toMatch(/6 chiffres/);
  });

  it("réponse Transact (IRIS) : premier chemin non vide, dates AAAAMMJJ converties", () => {
    const json = {
      header: { status: "success" },
      body: {
        customerName: "Conserverie Atlantique SA",
        shortName: "CONSATL",
        legalForm: "SA",
        industryId: "1020",
        sectorId: "PME",
        accountOfficerId: "CA0107",
        companyBook: "CA-CASA",
        customerGroupId: "GRP-ATL",
        incorporationDate: "20120315",
        addresses: [{ townCountry: "Agadir", street: "Zone industrielle Anza" }],
        residenceId: "ma",
        localRefs: { ice: "001234567000089", rc: "RC 12345 Agadir" },
      },
    };
    const c = mapT24Customer("100245", json);
    expect(c).toMatchObject({
      code: "100245",
      name: "Conserverie Atlantique SA",
      commercialSegment: "PME",
      accountOfficer: "CA0107",
      businessCenterCode: "CA-CASA",
      economicGroupCode: "GRP-ATL",
      creationDate: "2012-03-15",
      city: "Agadir",
      country: "MA",
      ice: "001234567000089",
      rc: "RC 12345 Agadir",
    });
    const f = counterpartyFieldsFromT24(c);
    expect(f).toMatchObject({ name: "Conserverie Atlantique SA", sectorCode: "1020", commercialSegment: "PME", currency: null });
  });

  it("correspondance paramétrée : champs locaux de la banque ; JSON invalide ignoré", () => {
    const map = parseFieldMap(JSON.stringify({ ice: ["body.LOCAL_ICE"], commercialSegment: ["body.SEG_COM"], name: ["bad path!"] }));
    const c = mapT24Customer("1", { body: { LOCAL_ICE: "001234567000089", SEG_COM: "GE", customerName: "X" } }, map);
    expect([c.ice, c.commercialSegment, c.name]).toEqual(["001234567000089", "GE", "X"]);
    expect(parseFieldMap("{")).toEqual(parseFieldMap(null));
  });

  it("écarts : T24 remplace la saisie, un champ vide de T24 n'efface rien", () => {
    const changes = diffWithT24(
      { name: "Conserverie Atlantique", ice: "001234567000089", legalForm: "SA", commercialSegment: null, city: "Agadir" },
      { name: "Conserverie Atlantique SA", legalForm: null, ice: "001234567000089", rc: null, fiscalId: null, sectorCode: "1020", commercialSegment: "PME", city: "Agadir", country: null, currency: null, accountOfficer: null }
    );
    expect(changes.map((c) => c.field).sort()).toEqual(["commercialSegment", "name", "sectorCode"]);
  });

  it("saisie minimale : raison sociale, ICE ou RC, forme, secteur, segment commercial", () => {
    expect(checkMinimalEntry({ name: "X", rc: "RC 1", legalForm: "SARL", sectorCode: "4711", commercialSegment: "TPE" })).toEqual([]);
    const issues = checkMinimalEntry({ name: "", ice: "123" });
    expect(issues.join(" ")).toMatch(/Raison sociale/);
    expect(issues.join(" ")).toMatch(/15 chiffres/);
    expect(issues.join(" ")).toMatch(/Segment commercial/);
    // Hors Maroc, l'ICE n'est pas contrôlé.
    expect(checkMinimalEntry({ name: "X", ice: "CI-123", legalForm: "SA", sectorCode: "1", commercialSegment: "GE", country: "CI" })).toEqual([]);
  });
});

describe("Rapport de solvabilité : ancienneté, contenu, signaux", () => {
  const report = normalizeReport({
    companyName: "Conserverie Atlantique SA",
    ice: "001234567000089",
    lines: [
      { institution: "Banque Populaire", ownBank: true, type: "Facilité de caisse", authorized: 5_000_000, outstanding: 4_200_000, overdue: 0, status: "EN_COURS" },
      { institution: "Banque X", ownBank: false, type: "Crédit moyen terme", authorized: 8_000_000, outstanding: 6_000_000, overdue: 350_000, overdueDays: 120, status: "IMPAYE" },
      { institution: "Banque Y", ownBank: false, type: "Escompte", authorized: 1_000_000, outstanding: 0, overdue: null, status: "SOLDE" },
      { institution: "Banque Z", type: "x", status: "inconnu" },
    ],
    incidents: [
      { date: "2026-06-12", kind: "cheque", institution: "Banque X", amount: 80_000, regularized: false, labelFr: "Chèque sans provision" },
      { date: "2025-01-10", kind: "IMPAYE", institution: "Banque Y", amount: 10_000, regularized: true },
    ],
    inquiries12m: 6,
  });

  it("lecture tolérante : statut ou nature inconnus neutralisés, ligne soldée hors encours", () => {
    expect(report.lines[3].status).toBe("EN_COURS");
    expect(report.incidents[0].kind).toBe("CHEQUE");
    const a = analyseReport(report);
    expect(a.totals.outstanding).toBe(10_200_000);
    expect(a.totals.ownOutstanding).toBe(4_200_000);
    expect(a.totals.othersOutstanding).toBe(6_000_000);
    expect(a.totals.overdue).toBe(350_000);
    expect(a.maxOverdueDays).toBe(120);
    expect(a.openIncidents).toBe(1);
  });

  it("signaux : information négative, chèque, impayé de plus de 90 jours", () => {
    const a = analyseReport(report);
    expect(a.signals.sort()).toEqual(["BUREAU_CHEQUES", "BUREAU_IMPAYE_90", "BUREAU_NEGATIF"]);
    expect(a.findings.map((f) => f.textFr).join(" ")).toMatch(/consultations/);
  });

  it("contentieux et impayé de plus de 360 jours", () => {
    const a = analyseReport(normalizeReport({ lines: [{ institution: "B", overdue: 1, overdueDays: 400, status: "CONTENTIEUX" }] }));
    expect(a.signals).toEqual(expect.arrayContaining(["BUREAU_IMPAYE_360", "BUREAU_CONTENTIEUX", "BUREAU_NEGATIF"]));
    expect(a.signals).not.toContain("BUREAU_IMPAYE_90");
  });

  it("rapport sain : aucun signal ; écart avec l'engagement déclaré au dossier", () => {
    const clean = normalizeReport({ lines: [{ institution: "BP", ownBank: true, outstanding: 4_000_000 }] });
    expect(analyseReport(clean).signals).toEqual([]);
    expect(analyseReport(clean, { declaredExposure: 6_000_000 }).findings.map((f) => f.textFr).join(" ")).toMatch(/écart de 33 %/);
    expect(analyseReport(clean, { declaredExposure: 4_100_000 }).findings.some((f) => /écart/.test(f.textFr))).toBe(false);
  });

  it("ancienneté depuis la date de mise à jour du rapport", () => {
    expect(reportFreshness("2026-10-20", "2026-11-07", 30)).toMatchObject({ ageDays: 18, stale: false });
    const old = reportFreshness("2026-08-01", "2026-11-07", 30);
    expect(old.stale).toBe(true);
    expect(old.messageFr).toMatch(/Rafraîchissez-le dans l'outil du crédit bureau/);
  });

  it("contrôles : date requise, pas dans le futur, confrère anonymisé admis, montants positifs", () => {
    expect(checkReport("", report, "2026-11-07").join(" ")).toMatch(/Date de mise à jour/);
    expect(checkReport("2026-12-01", report, "2026-11-07").join(" ")).toMatch(/future/);
    // Les rapports de crédit bureau anonymisent les confrères : pas de nom exigé.
    const anon = normalizeReport({ lines: [{ institution: "", outstanding: "(1 000)" }] });
    expect(anon.lines[0].institution).not.toBe("");
    expect(anon.lines[0].outstanding).toBe(1000);
    expect(checkReport("2026-11-01", anon, "2026-11-07")).toEqual([]);
    const neg = { ...anon, lines: [{ ...anon.lines[0], outstanding: -1 }] };
    expect(checkReport("2026-11-01", neg, "2026-11-07")).toHaveLength(1);
    expect(checkReport("2026-11-01", report, "2026-11-07")).toEqual([]);
  });
});

describe("Fiche juridique (InfoRisque) : contrôles et signaux", () => {
  const profile = normalizeProfile({
    reportDate: "2026-10-01",
    identity: { name: "STE Conserverie Atlantique SA", legalForm: "S.A.", ice: "001234567000089", rc: "12345", capital: "10 000 000", creationDate: "2024-05-02" },
    managers: [{ name: "A. Benali", role: "Président", since: "2026-03-01" }],
    shareholders: [{ name: "Holding Atlas", pct: 70, kind: "SOCIETE" }, { name: "A. Benali", pct: 30, kind: "personne" }],
    beneficialOwners: [],
    group: { name: "Groupe Atlas", parent: "Holding Atlas" },
    financials: [
      { year: "2025", revenue: 120_000_000, netIncome: 4_000_000, equity: 30_000_000, totalAssets: 90_000_000 },
      { year: "2024", revenue: 100_000_000, netIncome: 3_000_000, equity: 26_000_000, totalAssets: 80_000_000 },
    ],
    legalEvents: [
      { date: "2026-03-01", kind: "CHANGEMENT_DIRIGEANT", labelFr: "Nomination du président" },
      { date: "2026-09-15", kind: "redressement", labelFr: "Ouverture d'une procédure" },
      { date: "2019-01-01", kind: "PAS_UN_TYPE" },
    ],
  });

  it("lecture tolérante : nombres, natures, événements inconnus", () => {
    expect(profile.identity.capital).toBe(10_000_000);
    expect(profile.shareholders[1].kind).toBe("PERSONNE");
    expect(profile.legalEvents.map((e) => e.kind)).toEqual(["REDRESSEMENT", "CHANGEMENT_DIRIGEANT", "AUTRE"]);
    expect(checkProfile(profile, "2026-11-07")).toEqual([]);
    expect(checkProfile({ ...profile, shareholders: [{ name: "A", pct: 80, kind: "" }, { name: "B", pct: 40, kind: "" }] }, "2026-11-07").join(" ")).toMatch(/120 %/);
  });

  it("identité, jeune entreprise, événements légaux, bénéficiaires effectifs, groupe", () => {
    const a = analyseProfile(profile, {
      fiche: { name: "Conserverie Atlantique", ice: "001234567000090", rc: "12345", legalForm: "SA" },
      today: "2026-11-07",
      maxAgeDays: 365,
    });
    const text = a.findings.map((f) => f.textFr).join(" | ");
    expect(text).toMatch(/ICE différent/);
    expect(text).not.toMatch(/Raison sociale différente/); // « STE » et la forme juridique ne comptent pas
    expect(text).not.toMatch(/Forme juridique/); // « S.A. » = « SA »
    expect(text).toMatch(/Jeune entreprise/);
    expect(text).toMatch(/E15/);
    expect(text).toMatch(/S14/);
    expect(text).toMatch(/Bénéficiaires effectifs non renseignés/);
    expect(text).toMatch(/Groupe Atlas/);
    expect(a.signals.sort()).toEqual(["LEGAL_DIRIGEANTS", "LEGAL_REDRESSEMENT"]);
    expect(a.stale).toBe(false);
  });

  it("comptes déposés au greffe contre bilan remis à la banque (tolérance 5 %)", () => {
    const a = analyseProfile(profile, {
      statements: [
        { year: "2025", revenue: 150_000_000, netIncome: 4_000_000, equity: 30_500_000 },
        { year: "2024", revenue: 101_000_000, netIncome: 3_000_000, equity: null },
      ],
      today: "2026-11-07",
      maxAgeDays: 365,
    });
    const text = a.findings.map((f) => f.textFr).join(" | ");
    expect(text).toMatch(/Exercice 2025 : bilan remis à la banque différent des comptes déposés au greffe — chiffre d'affaires/);
    expect(text).not.toMatch(/2025.*capitaux propres/);
    expect(text).toMatch(/Exercice 2024 : bilan cohérent/);
  });

  it("liquidation ou radiation ; fiche ancienne", () => {
    const p = normalizeProfile({ reportDate: "2025-01-01", identity: { status: "Radiée" }, legalEvents: [{ date: "2024-01-01", kind: "LIQUIDATION" }] });
    const a = analyseProfile(p, { today: "2026-11-07", maxAgeDays: 365 });
    expect(a.signals).toEqual(["LEGAL_LIQUIDATION"]);
    expect(a.stale).toBe(true);
  });
});

describe("Critères BAM proposés par les sources externes", () => {
  it("un signal propose le critère à vérifier ; il ne le coche jamais", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, undefined, new Set(["BUREAU_NEGATIF", "LEGAL_REDRESSEMENT", "BUREAU_IMPAYE_180"]));
    const state = (code: string) => r.items.find((i) => i.code === code)?.state;
    expect(state("S03")).toBe("SUGGERE");
    expect(state("E15")).toBe("SUGGERE");
    expect(state("E12")).toBe("SUGGERE");
    expect(state("E04")).toBe("NON");
    expect(r.effect).toBeNull();
  });

  it("coché par l'analyste : l'effet s'applique (créance douteuse)", () => {
    const r = computeClassification(DEFAULT_CLASSIFICATION, { E15: { date: "2026-10-01", comment: "Jugement du 15/09" } }, new Set(["LEGAL_REDRESSEMENT"]));
    expect(r.items.find((i) => i.code === "E15")?.state).toBe("COCHE");
    expect(r.family).toBe("DOUTEUX");
  });

  it("les rapports de solvabilité sont cloisonnés au périmètre du client", () => {
    expect(SCOPED_MODELS.CreditReport(["e1"])).toEqual({ counterparty: { entityId: { in: ["e1"] } } });
  });
});
