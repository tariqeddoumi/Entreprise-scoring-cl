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
  const policy = c.unavailablePolicy === "BLOCK"
    ? "donnée critique — absence bloquante"
    : `politique en cas d'absence : ${c.unavailableScore}`;
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

  if (c.specialCases && c.specialCases.length > 0) {
    // Les cas spéciaux sont typés : le document reprend le code exact attendu
    // en entrée, son libellé et le score imposé. Le lecteur du comité modèles
    // voit donc la même clé que celle acceptée par l'API.
    w(`**Cas particuliers :**`);
    w();
    w(`| Code | Cas | Score imposé |`);
    w(`|---|---|---:|`);
    for (const sc of c.specialCases) {
      w(`| \`${sc.code}\` | ${sc.labelFr} | ${sc.score} |`);
    }
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

  w(`### Échelle de grades propre au modèle — ${model.gradeScale.scaleId}`);
  w();
  w(
    `Statut : ${model.gradeScale.status === "PROVISIONAL" ? "provisoire" : "calibrée"}. ${
      model.gradeScale.comparableWith.length === 0
        ? "Aucune correspondance validée avec une autre échelle : ces grades ne sont comparables à ceux d'aucun autre modèle."
        : `Correspondance validée avec : ${model.gradeScale.comparableWith.join(", ")}.`
    } L'échelle ne porte aucune décision indicative — la décision de crédit relève d'un moteur distinct.`
  );
  w();
  w(`| Grade | Score | Libellé |`);
  w(`|---|---|---|`);
  for (const b of model.gradeScale.bands) {
    const range =
      b.minScore === null
        ? `< ${b.maxScore}`
        : b.maxScore === null
          ? `≥ ${b.minScore}`
          : `[${b.minScore} ; ${b.maxScore}[`;
    w(`| ${b.grade} | ${range} | ${b.labelFr} |`);
  }
  w();
  w(`Grades de défaut, communs aux modèles (un défaut est un état constaté) :`);
  w();
  w(`| Grade | Libellé | Critères d'entrée | Règle de guérison |`);
  w(`|---|---|---|---|`);
  for (const d of model.gradeScale.defaultGrades) {
    w(`| ${d.grade} | ${d.labelFr} | ${d.entryCriteriaFr.join(" ")} | ${d.cureRuleFr} |`);
  }
  w();

  w(`### Exceptions non compensatoires`);
  w();
  if (model.nonCompensatoryRules.length === 0) {
    w(
      `Aucune exception. Toutes les contributions sont continues : aucun effet marginal n'a à être isolé pour calibrer la grille.`
    );
    w();
  } else {
    w(`| Code | Situation | Plafond de grade | Contribution centrale | Source | Justification de l'effet incrémental |`);
    w(`|---|---|---|---|---|---|`);
    for (const c of model.nonCompensatoryRules) {
      const cap = c.maxGrade === "NO_GRADE" ? "aucun grade final" : `pas mieux que ${c.maxGrade}`;
      w(
        `| ${c.code} | ${c.labelFr} | ${cap} | ${c.centralCriterion ?? "—"} | ${c.source} | ${c.incrementalRationaleFr} |`
      );
    }
    w();
  }

  w(`### Classe de confiance et porte de couverture`);
  w();
  w(
    `Confiance = ${model.confidence.weights.completeness} % complétude + ${model.confidence.weights.freshness} % fraîcheur + ${model.confidence.weights.reliability} % fiabilité + ${model.confidence.weights.provenance} % provenance.`
  );
  w();
  w(
    `La classe de confiance ne plafonne pas le grade : elle est restituée à côté de lui. Sous la classe minimale (${model.confidence.minimumClassForRating}), aucun grade n'est produit.`
  );
  w();
  w(`| Score de confiance | Classe | Effet |`);
  w(`|---|---|---|`);
  for (const b of [...model.confidence.classes].sort((a, z) => z.minScore - a.minScore)) {
    const range = b.maxScore === null ? `≥ ${b.minScore}` : `[${b.minScore} ; ${b.maxScore}[`;
    const eff =
      b.code === "U"
        ? "aucun grade produit : dossier non notable en l'état"
        : "grade produit, classe restituée à côté du grade";
    w(`| ${range} | ${b.code} — ${b.labelFr} | ${eff} |`);
  }
  w();
  w(
    `Couverture minimale exigée : ${(model.coverage.minGlobalObservedBps / 100).toFixed(0)} % du poids total porté par une donnée observée, et ${(model.coverage.minDomainObservedBps / 100).toFixed(0)} % par domaine. Une estimation ne compte pas comme une observation.`
  );
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
