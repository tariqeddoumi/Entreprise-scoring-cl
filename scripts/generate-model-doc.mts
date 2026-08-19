/**
 * Génère la section « Grilles détaillées » de la note méthodologique
 * DIRECTEMENT depuis la configuration du modèle exécutée par le moteur.
 *
 * Objectif : rendre impossible une divergence entre le document remis au
 * comité modèles et le calcul réellement appliqué en production. Toute
 * modification d'un poids ou d'un seuil dans `src/models/` se répercute dans
 * la documentation à la régénération.
 *
 * Usage : npx tsx scripts/generate-model-doc.mts > docs/_grilles-generees.md
 */
import { CORP_STD_V1, CORP_TPE_BEHAV_V1 } from "../src/models/index.js";
import type { Bin, CriterionConfig, ModelConfig, Segment } from "../src/core/types.js";

const out: string[] = [];
const w = (s = "") => out.push(s);

function pct(bps: number | undefined): string {
  return `${((bps ?? 0) / 100).toFixed(2)} %`;
}

function binToText(b: Bin, unit?: string): string {
  const u = unit ?? "";
  if (b.min === null && b.max !== null) {
    return `${b.maxInclusive ? "≤" : "<"} ${b.max}${u}`;
  }
  if (b.max === null && b.min !== null) {
    return `${b.minInclusive ? "≥" : ">"} ${b.min}${u}`;
  }
  if (b.min === null && b.max === null) return "toutes valeurs";
  const lo = `${b.minInclusive ? "[" : "]"}${b.min}${u}`;
  const hi = `${b.max}${u}${b.maxInclusive ? "]" : "["}`;
  return `${lo} ; ${hi}`;
}

function domainWeights(model: ModelConfig, domainCode: string, seg: Segment): number {
  return model.criteria
    .filter((c) => c.domainCode === domainCode)
    .reduce((a, c) => a + (c.weightsBps[seg] ?? 0), 0);
}

function renderCriterion(model: ModelConfig, c: CriterionConfig, segments: Segment[]) {
  w(`#### ${c.code} — ${c.labelFr}`);
  w();
  if (c.descriptionFr) {
    w(c.descriptionFr);
    w();
  }
  if (c.formulaFr) {
    w(`**Formule :** \`${c.formulaFr}\``);
    w();
  }

  const weightCells = segments.map((s) => `${s} ${pct(c.weightsBps[s])}`).join(" · ");
  const nature = c.type === "QUANTITATIVE" ? "quantitatif" : "qualitatif ancré";
  const policy = c.critical
    ? "donnée critique — absence bloquante"
    : `politique en cas d'absence : ${c.missingPolicy}`;
  w(`**Poids :** ${weightCells} · **Nature :** ${nature} · **${policy}**`);
  w();

  if (c.type === "QUANTITATIVE" && c.binsBySegment) {
    const perSegment = segments.filter((s) => c.binsBySegment?.[s]);
    if (perSegment.length > 0) {
      w(`| Segment | 100 | 75 | 50 | 25 | 0 |`);
      w(`|---|---|---|---|---|---|`);
      for (const s of perSegment) {
        const bins = c.binsBySegment[s]!;
        const cells = [100, 75, 50, 25, 0].map((score) => {
          const b = bins.find((x) => x.score === score);
          return b ? binToText(b, c.unit) : "—";
        });
        w(`| ${s} | ${cells.join(" | ")} |`);
      }
    } else if (c.binsBySegment.ALL) {
      const bins = c.binsBySegment.ALL;
      w(`| Score | Bande |`);
      w(`|---:|---|`);
      for (const score of [100, 75, 50, 25, 0]) {
        const b = bins.find((x) => x.score === score);
        w(`| ${score} | ${b ? binToText(b, c.unit) : "—"} |`);
      }
    }
    w();
  } else if (c.anchors) {
    w(`| Score | Ancrage et preuves attendues |`);
    w(`|---:|---|`);
    for (const a of [...c.anchors].sort((x, y) => y.score - x.score)) {
      w(`| ${a.score} | ${a.labelFr} |`);
    }
    w();
  }

  if (c.specialCasesFr && c.specialCasesFr.length > 0) {
    w(`**Cas particuliers :** ${c.specialCasesFr.join(" ; ")}.`);
    w();
  }
  if (c.evidenceRequiredFr && c.evidenceRequiredFr.length > 0) {
    w(`**Justificatifs requis :** ${c.evidenceRequiredFr.join(" ; ")}.`);
    w();
  }
}

function renderModel(model: ModelConfig, title: string) {
  const segments = model.segments;
  w(`## ${title}`);
  w();
  w(
    `Identifiant \`${model.modelId}\` · version ${model.version} · statut ${model.status} · date d'effet ${model.effectiveFrom}.`
  );
  w();
  w(model.conventionFr);
  w();

  w(`### Pondération des domaines`);
  w();
  w(`| Domaine | ${segments.join(" | ")} |`);
  w(`|---|${segments.map(() => "---:").join("|")}|`);
  for (const d of model.domains) {
    const cells = segments.map((s) => pct(domainWeights(model, d.code, s)));
    w(`| ${d.code} — ${d.labelFr} | ${cells.join(" | ")} |`);
  }
  const totals = segments.map((s) =>
    pct(model.criteria.reduce((a, c) => a + (c.weightsBps[s] ?? 0), 0))
  );
  w(`| **Total** | ${totals.map((t) => `**${t}**`).join(" | ")} |`);
  w();

  w(`### Pondération des ${model.criteria.length} critères élémentaires`);
  w();
  w(`| Code | Critère | ${segments.join(" | ")} |`);
  w(`|---|---|${segments.map(() => "---:").join("|")}|`);
  for (const c of model.criteria) {
    const cells = segments.map((s) => pct(c.weightsBps[s]));
    w(`| ${c.code} | ${c.labelFr} | ${cells.join(" | ")} |`);
  }
  w();

  for (const d of model.domains) {
    const criteria = model.criteria.filter((c) => c.domainCode === d.code);
    if (criteria.length === 0) continue;
    w(`### ${d.code} — ${d.labelFr}`);
    w();
    for (const c of criteria) renderCriterion(model, c, segments);
  }

  w(`### Échelle interne (master scale)`);
  w();
  w(`| Grade | Score | Libellé | Décision indicative |`);
  w(`|---|---|---|---|`);
  for (const b of model.masterScale) {
    const range =
      b.minScore === null
        ? `< ${b.maxScore}`
        : b.maxScore === null
          ? `≥ ${b.minScore}`
          : `[${b.minScore} ; ${b.maxScore}[`;
    w(`| ${b.grade} | ${range} | ${b.labelFr} | ${b.indicativeDecisionFr} |`);
  }
  w(
    `| DEF1 · DEF2 · DEF3 | définition de défaut déclenchée | Grades défaut internes | Recouvrement et classification par les dispositifs dédiés |`
  );
  w();

  w(`### Caps structurels`);
  w();
  w(`| Code | Situation | Plafond de grade | Source de la règle |`);
  w(`|---|---|---|---|`);
  for (const c of model.structuralCaps) {
    const cap = c.maxGrade === "NO_GRADE" ? "aucun grade final" : `pas mieux que ${c.maxGrade}`;
    w(`| ${c.code} | ${c.labelFr} | ${cap} | ${c.source} |`);
  }
  w();

  w(`### Niveau de confiance et conséquence sur le grade`);
  w();
  w(
    `Confiance = ${model.confidenceWeights.completeness} % complétude + ${model.confidenceWeights.freshness} % fraîcheur + ${model.confidenceWeights.reliability} % fiabilité + ${model.confidenceWeights.provenance} % provenance.`
  );
  w();
  w(`| Score de confiance | Niveau | Conséquence |`);
  w(`|---|---|---|`);
  for (const b of [...model.confidenceCaps].sort((a, z) => z.minConfidence - a.minConfidence)) {
    const range =
      b.maxConfidence === null
        ? `≥ ${b.minConfidence}`
        : `[${b.minConfidence} ; ${b.maxConfidence}[`;
    const eff =
      b.maxGrade === "NONE"
        ? "aucun cap lié à la qualité des données"
        : b.maxGrade === "NO_GRADE"
          ? "aucun grade final : dossier incomplet ou modèle alternatif requis"
          : `le grade final ne peut être meilleur que ${b.maxGrade}`;
    w(`| ${range} | ${b.levelFr} | ${eff} |`);
  }
  w();

  w(`### Red flags`);
  w();
  w(`| Code | Signal | Niveau | Source | Traitement |`);
  w(`|---|---|---|---|---|`);
  for (const f of model.redFlags) {
    w(`| ${f.code} | ${f.labelFr} | ${f.level} | ${f.source} | ${f.treatmentFr} |`);
  }
  w();
}

renderModel(CORP_STD_V1, "Modèle standard — CORP_STD_V1");
renderModel(CORP_TPE_BEHAV_V1, "Modèle TPE comportemental — CORP_TPE_BEHAV_V1");

process.stdout.write(out.join("\n"));
