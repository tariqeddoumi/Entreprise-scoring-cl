/**
 * Exporte la grille du modèle standard et calcule, avec le moteur réel, des
 * cas d'entreprises FICTIVES — matière de la présentation et du simulateur
 * Excel, qui est vérifié contre ces résultats.
 *
 * Usage : npx tsx scripts/diagnostics/export-grille-cas.mts <dossier de sortie>
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeRating } from "../../src/core/engine.js";
import type { RatingInput } from "../../src/core/types.js";
import { CORP_STD_V1 as m } from "../../src/models/index.js";
import { engineOptions } from "../../src/lib/rating-service.js";

const out = process.argv[2] ?? ".";

const grid = {
  modelId: m.modelId,
  version: m.version,
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
    unavailableScore: c.unavailableScore ?? 25,
    bins: c.binsBySegment ?? null,
    anchors: c.anchors ?? null,
    gate: c.materialityGate?.flag ?? null,
    transferTo: c.notApplicableRule?.transferWeightTo ?? null,
  })),
  grades: m.gradeScale.bands,
  caps: m.nonCompensatoryRules.map((r) => ({ code: r.code, trigger: r.trigger, maxGrade: r.maxGrade, labelFr: r.labelFr })),
  redFlags: m.redFlags.map((r) => ({ code: r.code, level: r.level, labelFr: r.labelFr })),
  confidence: m.confidence,
  coverage: m.coverage,
  groupSupport: { maxNotches: m.groupSupport.maxNotches },
};

type Answers = Record<string, number | "MISSING">;
/** Profil de base : PME correcte, toutes les données disponibles. */
const BASE: Answers = {
  "D1.1": 75, "D1.2": 50, "D1.3": 50, "D1.4": 30, "D1.5": 2.2, "D1.6": 1.3, "D1.7": 50, "D1.8": 75,
  "D2.1": 4, "D2.2": 1.4, "D2.3": 10, "D2.4": 50, "D2.5": 1.1, "D2.6": 75,
  "D3.1": 0, "D3.2": 100, "D3.3": 75, "D3.4": 95, "D3.5": 100, "D3.6": 100, "D3.7": 75,
  "D4.1": 50, "D4.2": 50, "D4.3": 20, "D4.4": 20, "D4.5": 50, "D4.6": 75, "D4.7": 50, "D4.8": 50,
  "D5.1": 75, "D5.2": 50, "D5.3": 50, "D5.4": 75, "D5.5": 50, "D5.6": 75, "D5.7": 50,
  "D6.1": 75, "D6.2": 100, "D6.3": 1, "D6.4": 75, "D6.5": 75,
  "D7.1": 50, "D7.2": 50, "D7.3": 75, "D7.4": 50,
};

interface Case {
  id: string;
  nom: string;
  profilFr: string;
  answers: Answers;
  flags?: Record<string, boolean>;
  redFlags?: string[];
  defaultTriggered?: boolean;
  materiality?: Record<string, boolean>;
  confidence?: RatingInput["confidence"];
  groupSupport?: RatingInput["groupSupport"];
}

const CASES: Case[] = [
  {
    id: "A",
    nom: "Atlas Agro SA",
    profilFr: "PME agro-industrielle saine : fonds propres solides, endettement modéré, compte sans incident.",
    answers: { ...BASE, "D1.2": 75, "D1.4": 38, "D1.5": 1.2, "D1.6": 1.6, "D2.2": 1.7, "D2.1": 6, "D2.3": 22, "D2.5": 1.45, "D3.3": 100, "D3.4": 115, "D4.2": 75, "D5.3": 75, "D6.1": 100 },
    materiality: { esgPhysicalMaterial: true },
  },
  {
    id: "B",
    nom: "Souss Négoce SARL",
    profilFr: "Comptes corrects, mais compte courant tendu : retards de 20 jours, dépassements, incidents d'effets.",
    answers: { ...BASE, "D3.1": 20, "D3.2": 25, "D3.3": 25, "D3.4": 65, "D3.5": 25, "D3.7": 25 },
    redFlags: ["RF07"],
  },
  {
    id: "C",
    nom: "Tanger Logistique SA",
    profilFr: "Score correct, mais service de la dette non couvert en scénario de base (DSCR 0,9) : exception non compensatoire.",
    answers: { ...BASE, "D2.2": 0.9, "D2.5": 0.85 },
    flags: { baseDscrBelow1: true },
  },
  {
    id: "D",
    nom: "Rif Bâtiment SARL",
    profilFr: "Dossier incomplet : comptes partiels, comportement bancaire et activité non documentés.",
    answers: {
      ...BASE,
      "D1.1": "MISSING", "D1.2": "MISSING", "D1.3": "MISSING", "D1.6": "MISSING", "D1.7": "MISSING", "D1.8": "MISSING",
      "D2.1": "MISSING", "D2.3": "MISSING", "D2.4": "MISSING", "D2.5": "MISSING", "D2.6": "MISSING",
      "D3.2": "MISSING", "D3.3": "MISSING", "D3.4": "MISSING", "D3.5": "MISSING", "D3.6": "MISSING", "D3.7": "MISSING",
      "D4.2": "MISSING", "D4.3": "MISSING", "D4.4": "MISSING", "D4.5": "MISSING",
    },
    confidence: { completeness: 50, freshness: 75, reliability: 75, provenance: 75 },
  },
  {
    id: "E",
    nom: "Fès Textile SA",
    profilFr: "Impayé de plus de 90 jours constaté : le défaut s'impose, quel que soit le score.",
    answers: { ...BASE, "D3.1": 95 },
    defaultTriggered: true,
    redFlags: ["RF06"],
  },
];

function toInput(c: Case): RatingInput {
  const criteria: RatingInput["criteria"] = {};
  for (const cr of m.criteria) {
    const v = c.answers[cr.code];
    if (cr.materialityGate && !(c.materiality ?? {})[cr.materialityGate.flag]) continue;
    if (v === "MISSING" || v === undefined) criteria[cr.code] = { status: "MISSING" };
    else if (cr.type === "QUANTITATIVE") criteria[cr.code] = { status: "AVAILABLE", value: v };
    else criteria[cr.code] = { status: "AVAILABLE", score: v as 0 | 25 | 50 | 75 | 100 };
  }
  return {
    modelId: m.modelId,
    segment: "PME",
    asOfDate: "2026-06-30",
    criteria,
    confidence: c.confidence ?? { completeness: 100, freshness: 100, reliability: 75, provenance: 75 },
    structuralFlags: c.flags ?? {},
    redFlags: c.redFlags ?? [],
    defaultTriggered: c.defaultTriggered ?? false,
    ...(c.defaultTriggered ? { defaultGrade: "DEF1" as const } : {}),
    materiality: c.materiality ?? {},
    ...(c.groupSupport ? { groupSupport: c.groupSupport } : {}),
  } as RatingInput;
}

const cases = CASES.map((c) => {
  const r = computeRating(m, toInput(c), engineOptions());
  return {
    ...c,
    result: {
      ratingStatus: r.ratingStatus,
      rawScore: r.rawScore,
      engineGrade: r.engineGrade,
      standaloneGrade: r.standaloneGrade,
      finalGrade: r.finalGrade,
      coveragePct: r.coverage.globalObservedBps / 100,
      deficientDomains: r.coverage.deficientDomains,
      confidence: { score: r.confidence.score, classCode: r.confidence.classCode },
      domains: r.domainResults.map((d) => ({ code: d.code, score: d.score, weightPct: d.weightBps / 100, observedPct: d.weightBps ? (100 * d.observedWeightBps) / d.weightBps : 0 })),
      appliedRules: r.appliedRules.map((x) => x.code),
      redFlags: r.triggeredRedFlags.map((x) => x.code),
      explanationFr: r.explanationFr,
      strengths: r.topStrengthsFr,
      weaknesses: r.topWeaknessesFr,
    },
  };
});

writeFileSync(join(out, "grille.json"), JSON.stringify(grid, null, 1));
writeFileSync(join(out, "cas.json"), JSON.stringify(cases, null, 1));
for (const c of cases) {
  console.log(c.id, c.nom, c.result.ratingStatus, c.result.rawScore?.toFixed(2), c.result.engineGrade, c.result.finalGrade, `couv ${c.result.coveragePct}`, c.result.confidence.classCode, c.result.appliedRules.join(","));
  console.log("   ", c.result.domains.map((d) => `${d.code}:${d.score?.toFixed(1)}`).join(" "));
}
