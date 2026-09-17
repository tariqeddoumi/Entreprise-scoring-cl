import { describe, expect, it } from "vitest";
import { computeRating } from "@/core/engine";
import { areComparable } from "@/core/grades";
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "@/models";
import type { RatingInput } from "@/core/types";
import { FULL_CONFIDENCE, tpeGoldenInput } from "./fixtures";

const AT = "2026-09-17T00:00:00Z";

describe("Vecteurs de contrôle — agrégation", () => {
  it("reproduit l'exemple de référence : D1 TPE = 61,00", () => {
    const result = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    const d1 = result.domainResults.find((d) => d.code === "D1")!;
    expect(d1.score).toBeCloseTo(61.0, 10);
  });

  it("agrège le score global exactement (64,50 → STD-P5)", () => {
    const result = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(result.ratingStatus).toBe("RATED");
    expect(result.rawScore).toBeCloseTo(64.5, 10);
    expect(result.engineGrade).toBe("STD-P5");
    expect(result.finalGrade).toBe("STD-P5");
  });

  it("est reproductible : même snapshot => même résultat", () => {
    const a = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    const b = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(a).toEqual(b);
  });
});

describe("Poids total constant (constat C07)", () => {
  /**
   * Le cœur du constat : en V2, une donnée manquante sortait du dénominateur.
   * Deux dossiers n'étaient alors plus comparables, et l'absence d'une
   * information défavorable pouvait améliorer un score.
   */
  it("le poids total appliqué ne dépend pas des données manquantes", () => {
    const complet = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    const lacunaire = computeRating(
      CORP_STD_V1,
      {
        ...tpeGoldenInput(),
        criteria: { ...tpeGoldenInput().criteria, "D4.1": { status: "MISSING" } },
      },
      AT
    );
    const total = (r: typeof complet) =>
      r.domainResults.reduce((acc, d) => acc + d.weightBps, 0);
    expect(total(lacunaire)).toBe(total(complet));
    expect(total(complet)).toBe(10000);
  });

  it("une information absente ne peut jamais améliorer le score", () => {
    const base = tpeGoldenInput();
    // D4.1 vaut 50 dans le vecteur de référence ; l'effacer applique la
    // catégorie prudente (25) et doit donc dégrader, jamais améliorer.
    const avec = computeRating(CORP_STD_V1, base, AT);
    const sans = computeRating(
      CORP_STD_V1,
      { ...base, criteria: { ...base.criteria, "D4.1": { status: "MISSING" } } },
      AT
    );
    expect(sans.rawScore!).toBeLessThan(avec.rawScore!);
  });

  it("marque le critère imputé et le retire de la couverture observée", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      { ...base, criteria: { ...base.criteria, "D4.1": { status: "MISSING" } } },
      AT
    );
    const crit = r.domainResults
      .flatMap((d) => d.criteria)
      .find((c) => c.code === "D4.1")!;
    expect(crit.imputed).toBe(true);
    expect(crit.score).toBe(25);
    expect(r.coverage.globalObservedBps).toBeLessThan(10000);
  });

  it("refuse une non-applicabilité que le modèle n'a pas prévue", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      { ...base, criteria: { ...base.criteria, "D3.2": { status: "NOT_APPLICABLE" } } },
      AT
    );
    const crit = r.domainResults
      .flatMap((d) => d.criteria)
      .find((c) => c.code === "D3.2")!;
    // Traitée comme manquante, et l'incohérence est signalée.
    expect(crit.imputed).toBe(true);
    expect(r.inconsistenciesFr.join(" ")).toContain("D3.2");
  });

  it("une donnée critique manquante interdit toute notation", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      { ...base, criteria: { ...base.criteria, "D1.5": { status: "MISSING" } } },
      AT
    );
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
    expect(r.finalGrade).toBeNull();
    expect(r.blockingReasonsFr.join(" ")).toContain("D1.5");
  });
});

describe("Porte de couverture et classe de confiance (constats C07 et H02)", () => {
  it("la confiance ne plafonne plus le grade", () => {
    const base = tpeGoldenInput();
    const forte = computeRating(CORP_STD_V1, base, AT);
    const moyenne = computeRating(
      CORP_STD_V1,
      { ...base, confidence: { completeness: 75, freshness: 75, reliability: 75, provenance: 75 } },
      AT
    );
    expect(moyenne.finalGrade).toBe(forte.finalGrade);
    expect(moyenne.confidence.classCode).toBe("B");
    expect(moyenne.confidence.affectsGrade).toBe(false);
  });

  it("sous la classe minimale, aucun grade n'est produit mais le score est conservé", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      { ...base, confidence: { completeness: 25, freshness: 25, reliability: 25, provenance: 25 } },
      AT
    );
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
    expect(r.confidence.classCode).toBe("U");
    expect(r.finalGrade).toBeNull();
    expect(r.rawScore).toBeCloseTo(64.5, 10);
  });

  it("sous le seuil de couverture, aucun grade n'est produit", () => {
    const base = tpeGoldenInput();
    // Toutes les données non critiques deviennent manquantes : le score reste
    // calculable par la catégorie prudente, mais il ne mesure plus rien.
    const critiques = new Set(
      CORP_STD_V1.criteria.filter((c) => c.unavailablePolicy === "BLOCK").map((c) => c.code)
    );
    const criteria = Object.fromEntries(
      Object.entries(base.criteria).map(([code, v]) =>
        critiques.has(code) ? [code, v] : [code, { status: "MISSING" as const }]
      )
    );
    const r = computeRating(CORP_STD_V1, { ...base, criteria }, AT);
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
    expect(r.coverage.meetsPolicy).toBe(false);
    expect(r.rawScore).not.toBeNull();
  });

  it("une valeur estimée ne compte pas comme une observation", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      {
        ...base,
        criteria: { ...base.criteria, "D4.1": { status: "ESTIMATED", score: 50 } },
      },
      AT
    );
    expect(r.coverage.globalObservedBps).toBeLessThan(10000);
    expect(r.warningsFr.join(" ")).toContain("estimée");
  });
});

describe("Ordre canonique du pipeline (constat H14)", () => {
  it("l'exception non compensatoire s'applique APRÈS le grade moteur", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), structuralFlags: { baseDscrBelow1: true } },
      AT
    );
    // Le grade moteur reste celui du score ; seul le grade autonome est ramené.
    expect(r.engineGrade).toBe("STD-P5");
    expect(r.standaloneGrade).toBe("STD-P7");
    expect(r.rawScore).toBeCloseTo(64.5, 10);
    expect(r.appliedRules.map((x) => x.code)).toContain("NC01");
  });

  it("l'exception déclare le critère qui porte sa contribution centrale", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), structuralFlags: { baseDscrBelow1: true } },
      AT
    );
    expect(r.appliedRules.find((x) => x.code === "NC01")!.centralCriterion).toBe("D2.2");
  });

  it("plusieurs exceptions : la plus contraignante l'emporte", () => {
    const r = computeRating(
      CORP_STD_V1,
      {
        ...tpeGoldenInput(),
        structuralFlags: { baseDscrBelow1: true, materialGroupFileIncomplete: true },
      },
      AT
    );
    expect(r.standaloneGrade).toBe("STD-P7");
  });

  it("un défaut constaté s'impose quel que soit le score", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), defaultTriggered: true, defaultGrade: "DEF2" },
      AT
    );
    expect(r.ratingStatus).toBe("DEFAULTED");
    expect(r.finalGrade).toBe("DEF2");
    expect(r.rawScore).toBeCloseTo(64.5, 10);
  });
});

describe("Séparation des finalités (constat C06)", () => {
  it("les quatre autres moteurs restent explicitement non évalués", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(r.decisionStatus).toBe("NOT_EVALUATED");
    expect(r.regulatoryClassStatus).toBe("NOT_EVALUATED");
    expect(r.ifrs9Status).toBe("NOT_EVALUATED");
  });

  it("un blocage conformité n'empêche plus de noter une exposition existante", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), redFlags: ["RF01"], existingExposure: true },
      AT
    );
    expect(r.complianceStatus).toBe("BLOCKED");
    expect(r.ratingStatus).toBe("RATED");
    expect(r.finalGrade).toBe("STD-P5");
    expect(r.usageRights.restrictionsFr.join(" ")).toContain("conformité");
  });

  it("l'échelle ne porte aucune décision indicative", () => {
    for (const band of CORP_STD_V1.gradeScale.bands) {
      expect(Object.keys(band)).not.toContain("indicativeDecisionFr");
    }
  });
});

describe("Échelles propres aux modèles (constat C03)", () => {
  it("les deux modèles portent des échelles distinctes", () => {
    expect(CORP_STD_V1.gradeScale.scaleId).not.toBe(CORP_TPE_BEHAV_V1.gradeScale.scaleId);
  });

  it("aucune comparabilité n'est déclarée tant que l'échelle est provisoire", () => {
    expect(areComparable(CORP_STD_V1.gradeScale, CORP_TPE_BEHAV_V1.gradeScale)).toBe(false);
    expect(CORP_STD_V1.gradeScale.status).toBe("PROVISIONAL");
  });

  it("les grades produits portent le préfixe de leur modèle", () => {
    const std = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(std.finalGrade).toMatch(/^STD-P\d$/);
    expect(std.gradeScaleId).toBe("STD-P-2026.1");
  });
});

describe("Exposition de la probabilité de défaut (constat C02)", () => {
  it("aucune PD n'est exposée hors bac à sable", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), { nowIso: AT });
    expect(r.pd12m).toBeNull();
    expect(r.pdStatus).toBe("CALIBRATED_SYNTHETIC");
    expect(r.usageRights.purpose).toBe("PILOT_SHADOW");
    expect(r.usageRights.pdDisclosed).toBe(false);
  });

  it("la PD n'apparaît qu'en bac à sable explicitement déclaré", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), {
      nowIso: AT,
      syntheticPdAllowed: true,
    });
    expect(r.pd12m).not.toBeNull();
    expect(r.usageRights.purpose).toBe("SIMULATION_ONLY");
  });

  it("les restrictions d'usage accompagnent toujours le résultat", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), { nowIso: AT });
    const texte = r.usageRights.restrictionsFr.join(" ");
    expect(texte).toContain("IFRS 9");
    expect(texte).toContain("SIMULÉES");
    expect(r.usageRights.permittedUsesFr.length).toBeGreaterThan(0);
  });
});

describe("Routage (constats C04 et C08)", () => {
  it("un modèle non publié pour le segment refuse de noter", () => {
    const r = computeRating(
      CORP_TPE_BEHAV_V1,
      { ...tpeGoldenInput(), modelId: "CORP_TPE_BEHAV_V1", segment: "GE" },
      AT
    );
    expect(r.ratingStatus).toBe("NO_RATING_ROUTED_OTHER_MODEL");
  });

  it("une entreprise de moins de deux ans est routée hors grille, pas plafonnée", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), structuralFlags: { companyAgeYears: 1 } },
      AT
    );
    expect(r.ratingStatus).toBe("NO_RATING_ROUTED_OTHER_MODEL");
    expect(r.finalGrade).toBeNull();
    expect(r.blockingReasonsFr.join(" ")).toContain("jeune entreprise");
  });

  it("segment indéterminable : aucun segment par défaut", () => {
    const input: RatingInput = {
      ...tpeGoldenInput(),
      segment: undefined,
      segmentationData: {},
    };
    const r = computeRating(CORP_STD_V1, input, AT);
    expect(r.ratingStatus).toBe("NO_RATING_SEGMENT_UNDETERMINED");
  });

  it("le jeu de règles de segmentation est tracé dans le résultat", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(r.segmentationRulesetId).toBe("SEG-2026.1");
  });
});

describe("Support groupe (constat H05)", () => {
  const base = tpeGoldenInput();

  it("refuse le relèvement si une seule condition manque", () => {
    const r = computeRating(
      CORP_STD_V1,
      {
        ...base,
        groupSupport: {
          claimed: true,
          capacityDocumented: true,
          willingnessDocumented: true,
          legallyBinding: false,
          fundsTransferable: true,
          requestedNotches: 2,
        },
      },
      AT
    );
    expect(r.groupSupport!.granted).toBe(false);
    expect(r.finalGrade).toBe(r.standaloneGrade);
    expect(r.groupSupport!.missingConditionsFr.join(" ")).toContain("contraignant");
  });

  it("accorde un relèvement plafonné et conserve la note autonome", () => {
    const r = computeRating(
      CORP_STD_V1,
      {
        ...base,
        groupSupport: {
          claimed: true,
          capacityDocumented: true,
          willingnessDocumented: true,
          legallyBinding: true,
          fundsTransferable: true,
          requestedNotches: 4,
        },
      },
      AT
    );
    expect(r.groupSupport!.granted).toBe(true);
    expect(r.groupSupport!.notchesApplied).toBe(2); // plafond
    expect(r.standaloneGrade).toBe("STD-P5");
    expect(r.finalGrade).toBe("STD-P3");
  });
});

describe("Matérialité ESG (constat H09)", () => {
  it("transfère le poids d'un risque non matériel selon la règle déclarée", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    const d7 = r.domainResults.find((d) => d.code === "D7")!;
    const d71 = d7.criteria.find((c) => c.code === "D7.1")!;
    const d73 = d7.criteria.find((c) => c.code === "D7.3")!;
    expect(d71.effectiveWeightBps).toBe(0);
    expect(d73.effectiveWeightBps).toBe(200); // 100 propre + 100 transféré
    expect(d7.weightBps).toBe(300);
  });

  it("évalue le critère lorsque le risque est matériel", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), materiality: { esgPhysicalMaterial: true } },
      AT
    );
    const d71 = r.domainResults
      .flatMap((d) => d.criteria)
      .find((c) => c.code === "D7.1")!;
    expect(d71.effectiveWeightBps).toBe(100);
    expect(d71.score).toBe(50);
  });
});

describe("Bornes des barèmes", () => {
  const cases: Array<[number, number]> = [
    [1.0, 100],
    [1.0001, 75],
    [2.0, 75],
    [2.0001, 50],
    [3.5, 50],
    [3.5001, 25],
    [5.0, 25],
    [5.0001, 0],
  ];
  for (const [value, expected] of cases) {
    it(`D1.5 TPE : valeur ${value} → score ${expected}`, () => {
      const base = tpeGoldenInput();
      const r = computeRating(
        CORP_STD_V1,
        { ...base, criteria: { ...base.criteria, "D1.5": { status: "AVAILABLE", value } } },
        AT
      );
      const c = r.domainResults.flatMap((d) => d.criteria).find((x) => x.code === "D1.5")!;
      expect(c.score).toBe(expected);
    });
  }

  it("cas spécial EBITDA ≤ 0 : score 0 explicite", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      {
        ...base,
        criteria: {
          ...base.criteria,
          "D1.5": { status: "AVAILABLE", specialCase: "EBITDA_LTE_0" },
        },
      },
      AT
    );
    const c = r.domainResults.flatMap((d) => d.criteria).find((x) => x.code === "D1.5")!;
    expect(c.score).toBe(0);
    expect(c.reasonCode).toContain("SPECIAL_EBITDA_LTE_0");
  });

  it("refuse un cas spécial non déclaré par le critère", () => {
    const base = tpeGoldenInput();
    const r = computeRating(
      CORP_STD_V1,
      {
        ...base,
        criteria: {
          ...base.criteria,
          "D1.4": { status: "AVAILABLE", value: 30, specialCase: "INVENTE" },
        },
      },
      AT
    );
    // D1.4 est critique : un cas spécial inconnu rend la donnée invalide,
    // donc bloquante — un appelant ne peut pas forcer un score.
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
  });
});

describe("Modèle TPE comportemental", () => {
  function behavInput(): RatingInput {
    const criteria: RatingInput["criteria"] = {};
    for (const c of CORP_TPE_BEHAV_V1.criteria) {
      criteria[c.code] =
        c.type === "QUANTITATIVE"
          ? { status: "AVAILABLE", value: quantValue(c.code) }
          : { status: "AVAILABLE", score: 75 };
    }
    return {
      modelId: "CORP_TPE_BEHAV_V1",
      segment: "TPE",
      asOfDate: "2026-06-30",
      confidence: { ...FULL_CONFIDENCE },
      criteria,
    };
  }
  function quantValue(code: string): number {
    switch (code) {
      case "B1.1":
        return 3; // ]0;7] => 75
      case "B1.3":
        return 100; // [90;110[ => 75
      case "B2.1":
        return 1.4; // [1.3;1.5[ => 75
      case "B2.2":
        return 20; // ]15;25] => 75
      case "B2.4":
        return 1.2; // [1.15;1.3[ => 75
      case "B3.2":
        return 6; // [5;7[ => 75
      case "B5.2":
        return 8; // ]5;10] => 75
      default:
        return 75;
    }
  }

  it("note un dossier par les flux, sur sa propre échelle", () => {
    const r = computeRating(CORP_TPE_BEHAV_V1, behavInput(), AT);
    expect(r.ratingStatus).toBe("RATED");
    expect(r.rawScore).toBeCloseTo(75, 10);
    expect(r.finalGrade).toMatch(/^TPE-B\d$/);
    expect(r.gradeScaleId).toBe("TPE-B-2026.1");
  });

  it("n'applique aucune exception non compensatoire", () => {
    expect(CORP_TPE_BEHAV_V1.nonCompensatoryRules).toHaveLength(0);
  });

  it("exige une classe de confiance plus élevée que le modèle standard", () => {
    expect(CORP_TPE_BEHAV_V1.confidence.minimumClassForRating).toBe("B");
    const r = computeRating(
      CORP_TPE_BEHAV_V1,
      {
        ...behavInput(),
        confidence: { completeness: 60, freshness: 60, reliability: 60, provenance: 60 },
      },
      AT
    );
    expect(r.ratingStatus).toBe("NO_RATING_INSUFFICIENT_DATA");
  });

  it("observe une fenêtre comportementale d'au moins 24 mois", () => {
    expect(CORP_TPE_BEHAV_V1.philosophy.observationWindowsMonths.behavioral).toBeGreaterThanOrEqual(24);
  });
});

describe("Codes de raison et corroboration des signaux", () => {
  it("produit des codes de raison stables et normalisés", () => {
    const r = computeRating(CORP_STD_V1, tpeGoldenInput(), AT);
    expect(r.reasonCodes.length).toBeGreaterThan(0);
    for (const code of r.reasonCodes) {
      expect(code).toMatch(/^D\d\.D\d_\d\.(POS|NEG|NEU)\.[A-Z0-9_]+$/);
    }
  });

  it("signale un red flag de défaut contredit par les données de retard", () => {
    const r = computeRating(
      CORP_STD_V1,
      { ...tpeGoldenInput(), redFlags: ["RF06"] },
      AT
    );
    expect(r.inconsistenciesFr.join(" ")).toContain("RF06");
  });
});

describe("Philosophie de notation (constat H01)", () => {
  it("est déclarée et bornée à 12 mois", () => {
    for (const m of [CORP_STD_V1, CORP_TPE_BEHAV_V1]) {
      expect(m.philosophy.horizonMonths).toBe(12);
      expect(m.philosophy.type).toMatch(/PIT|TTC|HYBRID/);
      expect(m.philosophy.migrationRuleFr.length).toBeGreaterThan(40);
    }
  });
});
