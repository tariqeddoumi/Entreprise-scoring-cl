import { describe, expect, it } from "vitest";
import {
  assembleKris,
  breakdown,
  checkSurveillance,
  DEFAULT_SCALE_INFO as S,
  DEFAULT_SURVEILLANCE,
  KRI_CATALOG,
  latestAt,
  migrationMatrix,
  monthEnds,
  monthlySeries,
  parseSurveillance,
  processKpis,
  ragOf,
  snapshot,
  snapshotKpis,
  watchlistAt,
  watchlistDue,
  type RatingObs,
  type WatchlistEvent,
} from "@/reference/portfolio";

const M = 1_000_000;
let n = 0;
function obs(id: string, effectiveDate: string, grade: string, exposure: number | null = 10 * M, extra: Partial<RatingObs> = {}): RatingObs {
  n++;
  return {
    counterpartyId: id,
    name: `Client ${id}`,
    entityId: "E1",
    segment: "PME",
    sectorCode: "C10",
    asOfDate: effectiveDate,
    effectiveDate,
    grade,
    modelGrade: grade,
    exposure,
    ...extra,
  };
}

describe("Surveillance du portefeuille : photographie", () => {
  it("une note n'est connue qu'à partir de sa date de validation ; la plus récente l'emporte", () => {
    const o = [obs("A", "2026-01-10", "5"), obs("A", "2026-04-10", "7"), obs("B", "2026-05-01", "3")];
    expect(latestAt(o, "2026-03-31").get("A")?.grade).toBe("5");
    expect(latestAt(o, "2026-03-31").has("B")).toBe(false);
    expect(latestAt(o, "2026-06-30").get("A")?.grade).toBe("7");
  });

  it("parts en exposition, note moyenne pondérée hors défaut, expiration", () => {
    const o = [
      obs("A", "2026-06-01", "2", 60 * M),
      obs("B", "2026-06-01", "8", 30 * M),
      obs("C", "2026-06-01", "DEF1", 10 * M),
      obs("D", "2024-01-01", "5", 0),
    ];
    const rows = snapshot(o, [], "2026-06-30", S, 12);
    const k = snapshotKpis(rows, 8, 5);
    expect(k.rated).toBe(4);
    expect(k.exposure).toBe(100 * M);
    expect(k.highRiskPct).toBeCloseTo(30);
    expect(k.defaultPct).toBeCloseTo(10);
    // (2×60 + 8×30) / 90 = 4 ; le défaut n'entre pas dans la moyenne.
    expect(k.avgGrade).toBeCloseTo(4);
    expect(k.expiredCount).toBe(1);
    expect(k.expiredPct).toBeCloseTo(25);
    // 3 notes valides sur 5 clients actifs.
    expect(k.coveragePct).toBeCloseTo(60);
  });

  it("sans aucune exposition connue, la note moyenne est simple", () => {
    const rows = snapshot([obs("A", "2026-01-01", "4", null), obs("B", "2026-01-01", "6", null)], [], "2026-02-01", S, 12);
    expect(snapshotKpis(rows, 8).avgGrade).toBe(5);
  });

  it("une note d'une échelle antérieure est hors photographie", () => {
    expect(snapshot([obs("A", "2026-01-01", "G4")], [], "2026-02-01", S, 12)).toHaveLength(0);
  });

  it("watch list à la date : entrée, changement de niveau, sortie", () => {
    const ev: WatchlistEvent[] = [
      { counterpartyId: "A", kind: "WL_ENTREE", effectiveDate: "2026-02-01", level: "WL1" },
      { counterpartyId: "A", kind: "WL_ENTREE", effectiveDate: "2026-04-01", level: "WL2" },
      { counterpartyId: "A", kind: "WL_SORTIE", effectiveDate: "2026-08-01", level: null },
    ];
    expect(watchlistAt(ev, "2026-01-31").get("A")).toBeUndefined();
    expect(watchlistAt(ev, "2026-03-01").get("A")).toBe("WL1");
    expect(watchlistAt(ev, "2026-05-01").get("A")).toBe("WL2");
    expect(watchlistAt(ev, "2026-09-01").get("A")).toBeUndefined();
    const rows = snapshot([obs("A", "2026-01-01", "8", 50 * M), obs("B", "2026-01-01", "3", 50 * M)], ev, "2026-05-01", S, 12);
    expect(snapshotKpis(rows, 8).watchlistPct).toBeCloseTo(50);
  });
});

describe("Surveillance du portefeuille : matrice de migration (cohorte)", () => {
  const o = [
    obs("A", "2025-06-01", "4"),
    obs("A", "2026-05-01", "4"), // stable
    obs("B", "2025-06-01", "5"),
    obs("B", "2026-05-01", "8"), // dégradation forte (3 crans)
    obs("C", "2025-06-01", "7"),
    obs("C", "2026-05-01", "6"), // amélioration
    obs("D", "2025-06-01", "9"),
    obs("D", "2026-05-01", "DEF1"), // passage en défaut
    obs("E", "2025-06-01", "3"), // note non renouvelée : expirée à la fin, hors cohorte
    obs("F", "2026-03-01", "2"), // entrée
  ];
  const m = migrationMatrix(o, "2025-06-30", "2026-06-30", S, { strongNotches: 2, validityMonths: 12 });

  it("lignes = note de départ, colonnes = note d'arrivée, défaut regroupé", () => {
    expect(m.labels).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "D"]);
    expect(m.cells[3][3]).toBe(1);
    expect(m.cells[4][7]).toBe(1);
    expect(m.cells[6][5]).toBe(1);
    expect(m.cells[8][10]).toBe(1);
    expect(m.cohort).toBe(4);
  });

  it("entrées et sorties à part : elles ne biaisent pas les taux", () => {
    expect(m.entrants).toBe(1);
    expect(m.withdrawnTotal).toBe(1);
    expect(m.withdrawn[2]).toBe(1);
    expect(m.cohortIds.sort()).toEqual(["A", "B", "C", "D"]);
  });

  it("sans durée de validité, une note ancienne reste dans la cohorte ; un client inactif sort", () => {
    expect(migrationMatrix(o, "2025-06-30", "2026-06-30", S).cohort).toBe(5);
    const m2 = migrationMatrix(o, "2025-06-30", "2026-06-30", S, { active: new Set(["A", "B", "C", "D", "F"]) });
    expect([m2.cohort, m2.withdrawnTotal]).toEqual([4, 1]);
  });

  it("taux, solde, dégradations fortes, défauts ; la variation moyenne exclut le défaut", () => {
    expect(m.upgradePct).toBeCloseTo(25);
    expect(m.downgradePct).toBeCloseTo(50);
    expect(m.stablePct).toBeCloseTo(25);
    expect(m.netPct).toBeCloseTo(25);
    expect(m.newDefaults).toBe(1);
    expect(m.strongDowngrades).toBe(2); // B (+3) et D (+2 jusqu'au défaut)
    // (0 + 3 − 1) / 3
    expect(m.avgNotch).toBeCloseTo(2 / 3);
    expect(m.moves[0].counterpartyId).toBe("B");
  });

  it("ventilation par segment avec taux de dégradation de la cohorte", () => {
    const o2 = o.map((x) => (x.counterpartyId === "C" ? { ...x, segment: "GE" } : x));
    const mm = migrationMatrix(o2, "2025-06-30", "2026-06-30", S, { validityMonths: 12 });
    const rows = snapshot(o2, [], "2026-06-30", S, 12);
    const b = breakdown(rows, (r) => r.segment ?? "?", 8, mm);
    const pme = b.find((r) => r.key === "PME")!;
    const ge = b.find((r) => r.key === "GE")!;
    expect(pme.cohort).toBe(3);
    expect(pme.downgradePct).toBeCloseTo(200 / 3);
    expect(ge.downgradePct).toBe(0);
    expect(b.reduce((s, r) => s + (r.sharePct ?? 0), 0)).toBeCloseTo(100);
  });
});

describe("Surveillance du portefeuille : série, processus, watch list", () => {
  it("fins de mois glissantes, le mois en cours arrêté à la date", () => {
    expect(monthEnds("2026-11-06", 3)).toEqual(["2026-09-30", "2026-10-31", "2026-11-06"]);
    expect(monthEnds("2026-03-31", 2)).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("série mensuelle : population à la date, notes validées dans le mois", () => {
    const o = [obs("A", "2026-01-15", "5"), obs("B", "2026-02-10", "9")];
    const pop = [
      { counterpartyId: "A", name: "A", entityId: "E1", segment: null, sectorCode: null, since: "2025-01-01" },
      { counterpartyId: "B", name: "B", entityId: "E1", segment: null, sectorCode: null, since: "2026-02-01" },
    ];
    const s = monthlySeries(o, [], pop, "2026-02-28", 2, S, 12, 8);
    expect(s.map((p) => [p.date, p.rated, p.population, p.validated])).toEqual([
      ["2026-01-31", 1, 1, 1],
      ["2026-02-28", 2, 2, 1],
    ]);
    expect(s[1].highRiskPct).toBeCloseTo(50);
  });

  it("dérogations, rejets et délai médian sur la période", () => {
    const o = [obs("A", "2026-03-01", "5", 1, { modelGrade: "6" }), obs("B", "2026-03-01", "7", 1, { modelGrade: "5" }), obs("C", "2026-03-01", "4")];
    const p = processKpis(
      o,
      [
        { status: "VALIDATED", submittedAt: "2026-02-01", decidedAt: "2026-02-11" },
        { status: "REJECTED", submittedAt: "2026-02-01", decidedAt: "2026-02-21" },
        { status: "VALIDATED", submittedAt: "2026-02-01", decidedAt: "2026-03-03" },
        { status: "SUBMITTED", submittedAt: "2026-02-01", decidedAt: null },
      ],
      "2025-12-31",
      "2026-06-30",
      S
    );
    expect(p.overrides).toBe(2);
    expect(p.favourableOverrides).toBe(1);
    expect(p.overridePct).toBeCloseTo(200 / 3);
    expect(p.decided).toBe(3);
    expect(p.rejectionPct).toBeCloseTo(100 / 3);
    expect(p.medianLeadDays).toBe(20);
  });

  it("watch list : revue et renotation en retard selon le niveau", () => {
    const ev: WatchlistEvent[] = [
      { counterpartyId: "A", kind: "WL_ENTREE", effectiveDate: "2026-01-01", level: "WL1" },
      { counterpartyId: "B", kind: "WL_ENTREE", effectiveDate: "2026-05-01", level: "WL2" },
      { counterpartyId: "C", kind: "WL_ENTREE", effectiveDate: "2026-01-01", level: "WL1" },
      { counterpartyId: "C", kind: "WL_SORTIE", effectiveDate: "2026-03-01", level: null },
    ];
    const rules = [
      { code: "WL1", reviewDays: 90, renotationDays: 60 },
      { code: "WL2", reviewDays: 30, renotationDays: 30 },
    ];
    const due = watchlistDue(ev, [obs("A", "2026-02-15", "8")], rules, "2026-05-20");
    expect(due.map((d) => d.counterpartyId).sort()).toEqual(["A", "B"]);
    const a = due.find((d) => d.counterpartyId === "A")!;
    expect(a.reviewLate).toBe(true); // 1er janvier + 90 j < 20 mai
    expect(a.renotationLate).toBe(false); // renoté le 15 février
    const b = due.find((d) => d.counterpartyId === "B")!;
    expect(b.reviewLate).toBe(false);
    expect(b.renotationLate).toBe(false);
  });
});

describe("Surveillance du portefeuille : seuils paramétrables", () => {
  it("catalogue valide par défaut ; feux selon le sens de l'indicateur", () => {
    expect(checkSurveillance(DEFAULT_SURVEILLANCE)).toEqual([]);
    const high = KRI_CATALOG.find((k) => k.code === "PART_RISQUE_ELEVE")!;
    expect(ragOf(high, 10)).toBe("VERT");
    expect(ragOf(high, 15)).toBe("ORANGE");
    expect(ragOf(high, 30)).toBe("ROUGE");
    const cov = KRI_CATALOG.find((k) => k.code === "COUVERTURE")!;
    expect(ragOf(cov, 99)).toBe("VERT");
    expect(ragOf(cov, 93)).toBe("ORANGE");
    expect(ragOf(cov, 80)).toBe("ROUGE");
    expect(ragOf(cov, null)).toBe("NA");
  });

  it("seuils incohérents refusés ; lecture tolérante du paramétrage", () => {
    const bad = { ...DEFAULT_SURVEILLANCE, thresholds: { ...DEFAULT_SURVEILLANCE.thresholds, PART_DEFAUT: { amber: 5, red: 3 } } };
    expect(checkSurveillance(bad).join(" ")).toMatch(/rouge/);
    expect(parseSurveillance(JSON.stringify(bad))).toEqual(DEFAULT_SURVEILLANCE);
    expect(parseSurveillance("{}")).toEqual(DEFAULT_SURVEILLANCE);
    expect(parseSurveillance(JSON.stringify({ highRiskFrom: 7 })).highRiskFrom).toBe(7);
    expect(parseSurveillance("pas du json")).toEqual(DEFAULT_SURVEILLANCE);
  });

  it("assemblage : un indicateur par entrée du catalogue, avec tendance", () => {
    const o = [obs("A", "2025-06-01", "4"), obs("A", "2026-05-01", "9")];
    const now = snapshotKpis(snapshot(o, [], "2026-06-30", S, 12), 8, 1);
    const before = snapshotKpis(snapshot(o, [], "2025-06-30", S, 12), 8, 1);
    const m = migrationMatrix(o, "2025-06-30", "2026-06-30", S);
    const k = assembleKris(DEFAULT_SURVEILLANCE, now, before, m, processKpis(o, [], "2025-06-30", "2026-06-30", S), 0);
    expect(k.map((x) => x.def.code)).toEqual(KRI_CATALOG.map((x) => x.code));
    const hr = k.find((x) => x.def.code === "PART_RISQUE_ELEVE")!;
    expect([hr.previous, hr.value, hr.rag]).toEqual([0, 100, "ROUGE"]);
    expect(k.find((x) => x.def.code === "TAUX_DEGRADATION")!.value).toBe(100);
  });
});
void n;

describe("Surveillance : flux d'encours (lignes d'engagement)", () => {
  const o = [obs("A", "2026-01-10", "5", 10 * M), obs("B", "2026-01-10", "9", 10 * M)];
  const positions = new Map([
    ["A", { counterpartyId: "A", asOfDate: "2026-06-01", exposure: 30 * M, outstanding: 20 * M, overdue: 1 * M, maxOverdueDays: 45, overrun: true }],
  ]);

  it("la position des lignes remplace l'engagement déclaré à partir de sa date", () => {
    const before = snapshot(o, [], "2026-05-31", S, 12, positions);
    const after = snapshot(o, [], "2026-06-30", S, 12, positions);
    expect(before.find((r) => r.counterpartyId === "A")).toMatchObject({ exposure: 10 * M, fromFacilities: false });
    expect(after.find((r) => r.counterpartyId === "A")).toMatchObject({ exposure: 30 * M, fromFacilities: true });
    expect(after.find((r) => r.counterpartyId === "B")).toMatchObject({ exposure: 10 * M, fromFacilities: false });
  });

  it("impayés rapportés à l'encours des lignes, part des clients en dépassement", () => {
    const k = snapshotKpis(snapshot(o, [], "2026-06-30", S, 12, positions), 8);
    expect(k.withFacilities).toBe(1);
    expect(k.overduePct).toBeCloseTo(5);
    expect(k.overrunPct).toBe(100);
    // Exposition totale : 30 (lignes) + 10 (notation) ; B en risque élevé : 25 %.
    expect(k.exposure).toBe(40 * M);
    expect(k.highRiskPct).toBeCloseTo(25);
  });

  it("sans ligne : indicateurs sans objet", () => {
    const k = snapshotKpis(snapshot(o, [], "2026-06-30", S, 12), 8);
    expect([k.withFacilities, k.overduePct, k.overrunPct]).toEqual([0, null, null]);
    const m = migrationMatrix(o, "2025-06-30", "2026-06-30", S);
    const kris = assembleKris(DEFAULT_SURVEILLANCE, k, k, m, processKpis(o, [], "2025-06-30", "2026-06-30", S), 0);
    expect(kris.find((x) => x.def.code === "TAUX_IMPAYES")!.rag).toBe("NA");
  });
});
