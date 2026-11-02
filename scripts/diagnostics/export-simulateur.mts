/**
 * Export du moteur pour le simulateur Excel : les quatre grilles publiées, le
 * gabarit du bilan, les liens bilan → critères, et des cas FICTIFS calculés
 * par le moteur réel (référence de contrôle du classeur).
 *
 * Usage : npx tsx scripts/diagnostics/export-simulateur.mts <dossier de sortie>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { computeRating } from "../../src/core/engine.js";
import type { CriterionInput, ModelConfig, RatingInput } from "../../src/core/types.js";
import { listModels } from "../../src/models/index.js";
import { CAP_TRIGGER_TO_FLAG } from "../../src/core/structural-flags.js";
import { POSTES } from "../../src/financials/chart.js";
import { GRID_LINKS, INDICATOR_BY_KEY } from "../../src/financials/compute.js";
import { pmeFinancials } from "../../tests/fixtures.js";

const out = process.argv[2] ?? ".";
mkdirSync(out, { recursive: true });

function grid(m: ModelConfig) {
  return {
    modelId: m.modelId,
    version: m.version,
    labelFr: m.labelFr,
    routeFamily: m.routeFamily,
    segments: m.segments,
    domains: m.domains.map((d) => ({ code: d.code, labelFr: d.labelFr })),
    criteria: m.criteria.map((c) => ({
      code: c.code,
      domain: c.domainCode,
      labelFr: c.labelFr,
      type: c.type,
      unit: c.unit?.trim() ?? "",
      weightsBps: c.weightsBps,
      critical: c.unavailablePolicy === "BLOCK",
      unavailableScore: c.unavailableScore ?? 0,
      bins: c.binsBySegment ?? null,
      anchors: c.anchors ?? null,
      specialCases: (c.specialCases ?? []).map((s) => ({ code: s.code, labelFr: s.labelFr, score: s.score })),
      gate: c.materialityGate?.flag ?? null,
      transferTo: c.notApplicableRule?.transferWeightTo ?? null,
      notApplicable: !!c.notApplicableRule && !c.materialityGate,
    })),
    scaleId: m.gradeScale.scaleId,
    grades: m.gradeScale.bands,
    caps: m.nonCompensatoryRules.map((r) => ({
      code: r.code,
      trigger: r.trigger,
      flag: CAP_TRIGGER_TO_FLAG[r.trigger] ?? null,
      maxGrade: r.maxGrade,
      labelFr: r.labelFr,
      derivation: r.derivation ?? null,
    })),
    mandatoryReviews: m.mandatoryReviews ?? [],
    redFlags: m.redFlags.map((r) => ({ code: r.code, level: r.level, labelFr: r.labelFr })),
    confidence: m.confidence,
    coverage: m.coverage,
    groupSupport: { maxNotches: m.groupSupport.maxNotches },
    links: Object.entries(GRID_LINKS[m.modelId] ?? {}).map(([criterion, l]) => ({
      criterion,
      indicator: l.indicator,
      indicatorLabelFr: INDICATOR_BY_KEY.get(l.indicator)?.labelFr ?? l.indicator,
      nonPositiveEbitdaCase: l.nonPositiveEbitdaCase ?? null,
      negativeCase: l.negativeCase ?? null,
    })),
  };
}

type Answer = number | "MISSING" | "NA" | { special: string };
interface Case {
  id: string;
  nom: string;
  profilFr: string;
  segment: string;
  answers: Record<string, Answer>;
  flags?: Record<string, boolean>;
  redFlags?: string[];
  defaultTriggered?: boolean;
  /** true : matériel ; false : non matériel justifié ; absent : inconnu. */
  materiality?: Record<string, boolean>;
  confidence?: RatingInput["confidence"];
  groupSupport?: RatingInput["groupSupport"];
}

const STD_BASE: Record<string, Answer> = {
  "D1.1": 75, "D1.2": 50, "D1.3": 50, "D1.4": 30, "D1.5": 2.2, "D1.6": 1.3, "D1.7": 50, "D1.8": 75,
  "D2.1": 4, "D2.2": 1.4, "D2.3": 10, "D2.4": 50, "D2.5": 1.1, "D2.6": 75,
  "D3.1": 0, "D3.2": 100, "D3.3": 75, "D3.4": 95, "D3.5": 100, "D3.6": 100, "D3.7": 75,
  "D4.1": 50, "D4.2": 50, "D4.3": 20, "D4.4": 20, "D4.5": 50, "D4.6": 75, "D4.7": 50, "D4.8": 50,
  "D5.1": 75, "D5.2": 50, "D5.3": 50, "D5.4": 75, "D5.5": 50, "D5.6": 75, "D5.7": 50,
  "D6.1": 75, "D6.2": 100, "D6.3": 1, "D6.4": 75, "D6.5": 75,
  "D7.1": 50, "D7.2": 50, "D7.3": 75, "D7.4": 50,
};
const NON_MAT = { esgPhysicalMaterial: false, esgTransitionMaterial: false };

const CASES: Record<string, Case[]> = {
  CORP_STD_V1: [
    { id: "A", nom: "Atlas Agro SA", segment: "PME", profilFr: "PME agro-industrielle saine : fonds propres solides, endettement modéré, compte sans incident.",
      answers: { ...STD_BASE, "D1.2": 75, "D1.4": 38, "D1.5": 1.2, "D1.6": 1.6, "D2.2": 1.7, "D2.1": 6, "D2.3": 22, "D2.5": 1.45, "D3.3": 100, "D3.4": 115, "D4.2": 75, "D5.3": 75, "D6.1": 100 },
      materiality: { esgPhysicalMaterial: true, esgTransitionMaterial: false } },
    { id: "B", nom: "Souss Négoce SARL", segment: "PME", profilFr: "Comptes corrects, mais compte courant tendu : retards de 20 jours, dépassements, incidents d'effets.",
      answers: { ...STD_BASE, "D3.1": 20, "D3.2": 25, "D3.3": 25, "D3.4": 65, "D3.5": 25, "D3.7": 25 }, redFlags: ["RF07"], materiality: NON_MAT },
    { id: "C", nom: "Tanger Logistique SA", segment: "PME", profilFr: "Score correct, mais DSCR de 0,9 en scénario de base : exception dérivée du ratio et revue risques obligatoire.",
      answers: { ...STD_BASE, "D2.2": 0.9, "D2.5": 0.85 }, materiality: NON_MAT },
    { id: "D", nom: "Rif Bâtiment SARL", segment: "PME", profilFr: "Dossier incomplet : liquidité, comportement bancaire et activité non documentés ; une donnée critique manque.",
      answers: { ...STD_BASE, "D1.1": "MISSING", "D1.2": "MISSING", "D1.6": "MISSING", "D1.7": "MISSING", "D1.8": "MISSING", "D2.3": "MISSING", "D2.4": "MISSING", "D3.2": "MISSING", "D3.3": "MISSING", "D3.4": "MISSING", "D4.2": "MISSING", "D4.3": "MISSING" },
      confidence: { completeness: 50, freshness: 75, reliability: 75, provenance: 75 }, materiality: NON_MAT },
    { id: "E", nom: "Fès Textile SA", segment: "PME", profilFr: "Impayé de plus de 90 jours constaté : le défaut s'impose, quel que soit le score.",
      answers: { ...STD_BASE, "D3.1": 95 }, defaultTriggered: true, redFlags: ["RF06"], materiality: NON_MAT },
    { id: "F", nom: "Oasis Distribution SARL", segment: "PME", profilFr: "EBE négatif : levier et conversion non calculables (cas particulier), qualitatifs moyens.",
      answers: { ...STD_BASE, "D1.5": { special: "EBITDA_LTE_0" }, "D1.8": { special: "EBITDA_LTE_0" }, "D2.1": 0.5, "D1.2": 25 }, materiality: NON_MAT },
  ],
  CORP_STD_CHALLENGER_V1: [
    { id: "S1", nom: "Cas chiffré du document 03", segment: "PME", profilFr: "PME de référence du modèle cible : 64,25 points.",
      answers: { F1: 30, F2: 3, F3: 1.6, F4: 1.1, F5: 50, F6: 80, B1: 0, B2: 2, B3: -5, B4: 50, A1: 50, A2: 25, A3: 75, G1: 75, G2: 50, C1: 50 } },
    { id: "S2", nom: "Même PME, DSCR 0,9", segment: "PME", profilFr: "F3 tombe à 0 : 55,25 points et revue risques obligatoire.",
      answers: { F1: 30, F2: 3, F3: 0.9, F4: 1.1, F5: 50, F6: 80, B1: 0, B2: 2, B3: -5, B4: 50, A1: 50, A2: 25, A3: 75, G1: 75, G2: 50, C1: 50 } },
  ],
  CORP_TPE_CHALLENGER_V1: [
    { id: "T1", nom: "TPE comportementale de référence", segment: "TPE", profilFr: "TPE sans comptes fiables, 30 mois de flux : 75 points.",
      answers: { T1: 0, T2: 2, T3: 1.6, T4: 2, T5: 20, T6: 35, T7: 75, T8: 50, T9: 50, T10: 75, T11: 75, T12: 50 } },
  ],
  CORP_TPE_BEHAV_V1: [],
};

/** Dossier « bon » généré depuis la grille : valeur au milieu de la classe 75 (à défaut 100 ou 50). */
function profile75(m: ModelConfig, segment: string): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const c of m.criteria) {
    if (c.type === "QUALITATIVE") {
      out[c.code] = 75;
      continue;
    }
    const bins = c.binsBySegment?.[segment as "TPE"] ?? c.binsBySegment?.ALL ?? [];
    const b = bins.find((x) => x.score === 75) ?? bins.find((x) => x.score === 100) ?? bins.find((x) => x.score === 50);
    if (!b) continue;
    out[c.code] = b.min !== null && b.max !== null ? (b.min + b.max) / 2 : b.min !== null ? b.min + 1 : (b.max as number) - 1;
  }
  return out;
}

function toInput(m: ModelConfig, c: Case): RatingInput {
  const criteria: Record<string, CriterionInput> = {};
  for (const cr of m.criteria) {
    const v = c.answers[cr.code];
    if (cr.materialityGate && c.materiality?.[cr.materialityGate.flag] === false) continue;
    if (v === undefined || v === "MISSING") criteria[cr.code] = { status: "MISSING" };
    else if (v === "NA") criteria[cr.code] = { status: "NOT_APPLICABLE" };
    else if (typeof v === "object") criteria[cr.code] = { status: "AVAILABLE", specialCase: v.special };
    else if (cr.type === "QUANTITATIVE") criteria[cr.code] = { status: "AVAILABLE", value: v };
    else criteria[cr.code] = { status: "AVAILABLE", score: v as CriterionInput["score"] };
  }
  const evidence = Object.fromEntries(Object.entries(c.materiality ?? {}).filter(([, b]) => b === false).map(([k]) => [k, "Analyse sectorielle et localisation des sites"]));
  return {
    modelId: m.modelId,
    segment: c.segment,
    asOfDate: "2026-06-30",
    criteria,
    confidence: c.confidence ?? { completeness: 100, freshness: 100, reliability: 75, provenance: 75 },
    structuralFlags: c.flags ?? {},
    redFlags: c.redFlags ?? [],
    defaultTriggered: c.defaultTriggered ?? false,
    ...(c.defaultTriggered ? { defaultGrade: "DEF1" as const } : {}),
    materiality: c.materiality ?? {},
    ...(Object.keys(evidence).length ? { materialityEvidence: evidence } : {}),
    routing: { reliableFinancialStatements: m.routeFamily === "STANDARD", behavioralHistoryMonths: 36 },
    ...(c.groupSupport ? { groupSupport: c.groupSupport } : {}),
  } as RatingInput;
}

{
  const tpe = listModels().find((x) => x.modelId === "CORP_TPE_BEHAV_V1")!;
  const base = profile75(tpe, "TPE");
  CASES.CORP_TPE_BEHAV_V1 = [
    { id: "B1", nom: "Épicerie fine Derb SARL (fictive)", segment: "TPE", profilFr: "TPE sans comptes fiables, 36 mois de flux réguliers, aucun incident.", answers: base, materiality: NON_MAT },
    { id: "B2", nom: "Même TPE, retards de 40 jours", segment: "TPE", profilFr: "Retards de paiement et encaissements en baisse : la note se dégrade.", answers: { ...base, "B1.1": 40, "B1.3": -25 }, materiality: NON_MAT },
  ];
}

const models = listModels().map((m) => {
  const cases = (CASES[m.modelId] ?? []).map((c) => {
    const r = computeRating(m, toInput(m, c), { nowIso: "2026-06-30T12:00:00.000Z" });
    return {
      ...c,
      result: {
        ratingStatus: r.ratingStatus,
        rawScore: r.rawScore,
        scoreUpperBound: r.scoreUpperBound,
        engineGrade: r.engineGrade,
        finalGrade: r.finalGrade,
        coveragePct: r.coverage.globalObservedBps / 100,
        confidence: { score: r.confidence.score, classCode: r.confidence.classCode },
        appliedRules: r.appliedRules.map((x) => x.code),
        mandatoryReviews: r.mandatoryReviewsFr,
        explanationFr: r.explanationFr,
      },
    };
  });
  for (const c of cases) console.log(m.modelId, c.id, c.result.ratingStatus, c.result.rawScore?.toFixed(2), c.result.finalGrade, c.result.appliedRules.join(","));
  return { grid: grid(m), cases };
});

writeFileSync(
  join(out, "simulateur.json"),
  JSON.stringify({ models, exampleBalanceSheet: pmeFinancials(), postes: POSTES.map((p) => ({ key: p.key, labelFr: p.labelFr, section: p.section, kind: p.kind, sum: p.sum ?? null, onlyN: !!p.onlyN, declared: !!p.declared })) }, null, 1)
);
console.log("ok", join(out, "simulateur.json"));
