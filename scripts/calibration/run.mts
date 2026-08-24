/**
 * Exécute la calibration du modèle sur portefeuille simulé et produit :
 *   - l'artefact de calibration    src/models/calibrations/<id>.json
 *   - le rapport de validation     docs/06-rapport-calibration.md
 *
 * Entièrement déterministe : à graine égale, la calibration est identique au
 * bit près. C'est la condition pour qu'un validateur indépendant puisse la
 * rejouer.
 *
 * Usage : npx tsx scripts/calibration/run.mts [--seed 20260823] [--cohorts 8]
 *                                             [--per-cohort 6000] [--moc 0.10]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tiedGrades, validateCalibration } from "../../src/core/calibration.js";
import { getModel, listModels } from "../../src/models/index.js";
import { buildSamples, fitCalibration, type SampleValidation } from "../../src/calibration/fit.js";
import type { Segment } from "../../src/core/types.js";
import { DEFAULT_ASSUMPTIONS, simulatePortfolio } from "../../src/calibration/simulate.js";
import { wiringFor } from "../../src/calibration/wiring.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`--${name} : valeur numérique attendue`);
  return v;
}

function strArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const modelId = strArg("model", "CORP_STD_V1");
const model = getModel(modelId);
if (!model) {
  console.error(
    `Modèle inconnu : ${modelId}. Disponibles : ${listModels().map((m) => m.modelId).join(", ")}`
  );
  process.exit(1);
}

const seed = arg("seed", 20260823);
const cohorts = arg("cohorts", 8);
const perCohort = arg("per-cohort", 6000);
const moc = arg("moc", 0.1);
const developmentCohorts = Math.max(1, cohorts - 3);
const calibrationId = `${model.modelId}-SYNTH-${seed}`;

console.log(`Calibration ${calibrationId}`);
console.log(`  modèle ${model.modelId} v${model.version} · graine ${seed}`);
console.log(`  ${cohorts} cohortes × ${perCohort} contreparties, dont ${developmentCohorts} en développement\n`);

const t0 = Date.now();
const sim = simulatePortfolio({ model, seed, cohorts, obligorsPerCohort: perCohort });
console.log(`  portefeuille simulé en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const samples = buildSamples(sim.obligors, developmentCohorts, 0.3, seed + 1);
console.log(
  `  développement ${samples.development.length} · hors-échantillon ${samples.holdout.length} · hors-période ${samples.outOfTime.length}`
);

const { calibration, validation } = fitCalibration({
  model,
  samples,
  seed,
  calibrationId,
  marginOfConservatism: moc,
  dataSource: "SYNTHETIC",
});

const errors = validateCalibration(calibration);
if (errors.length > 0) {
  console.error("\nCalibration REFUSÉE :");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("  contrôles d'intégrité : monotonie, bornes et plancher respectés\n");

// --- Artefact ---------------------------------------------------------------
const outDir = join(root, "src", "models", "calibrations");
mkdirSync(outDir, { recursive: true });
const artefact = join(outDir, `${calibrationId}.json`);
writeFileSync(artefact, `${JSON.stringify(calibration, null, 2)}\n`, "utf8");
console.log(`  artefact : ${artefact}`);

// --- Rapport ----------------------------------------------------------------
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)} %`;
const num = (x: number, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "n/d");

function sampleBlock(v: SampleValidation): string {
  const l: string[] = [];
  l.push(`#### Échantillon ${v.name}`);
  l.push("");
  l.push(`Effectif ${v.n.toLocaleString("fr-FR")} · ${v.defaults.toLocaleString("fr-FR")} défauts · taux observé ${pct(v.observedRate)} · PD moyenne affectée ${pct(v.predictedRate)}.`);
  l.push("");
  l.push("| Indicateur | Valeur | Lecture |");
  l.push("|---|---:|---|");
  l.push(`| Gini | ${num(v.gini)} | pouvoir de séparation des défauts |`);
  l.push(`| AUC | ${num(v.auc)} | aire sous la courbe ROC |`);
  l.push(`| Kolmogorov-Smirnov | ${num(v.ks)} | écart maximal entre sains et défauts |`);
  l.push(`| Brier | ${num(v.brier, 5)} | erreur quadratique de la PD |`);
  l.push(`| Adéquation par grade | p = ${num(v.gradeFitP)} | valeur-p faible = désaccord PD / défauts |`);
  l.push(`| Adéquation avant marge | p = ${num(v.gradeFitPBeforeMoc)} | isole l'effet de la marge de prudence |`);
  l.push("");
  l.push("| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |");
  l.push("|---|---:|---:|---:|---:|---:|");
  for (const g of v.grades) {
    l.push(
      `| ${g.grade} | ${g.n.toLocaleString("fr-FR")} | ${pct(g.assignedPd, 3)} | ${pct(g.observedRate, 3)} | ${g.observedDefaults} | ${g.pValue < 0.0001 ? "< 0,0001" : num(g.pValue)}${g.underestimates ? " ⚠" : ""} |`
    );
  }
  l.push("");
  if (v.breaches.length === 0) {
    l.push("Taux de défaut observés strictement croissants sur toute l'échelle.");
  } else {
    l.push("Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle");
    l.push("sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de");
    l.push("celle portée par des centaines de défauts, qui traduit un vrai défaut");
    l.push("d'ordonnancement.");
    l.push("");
    l.push("| Grades | Taux | Effectifs | Défauts | p | Lecture |");
    l.push("|---|---|---|---|---:|---|");
    for (const b of v.breaches) {
      const lecture = b.pValue < 0.05 ? "**écart significatif**" : "compatible avec le bruit";
      l.push(
        `| ${b.from} → ${b.to} | ${pct(b.fromRate, 2)} → ${pct(b.toRate, 2)} | ${b.fromN} / ${b.toN} | ${b.fromDefaults} / ${b.toDefaults} | ${b.pValue < 0.0001 ? "< 0,0001" : num(b.pValue)} | ${lecture} |`
      );
    }
  }
  l.push("");
  return l.join("\n");
}

const a = DEFAULT_ASSUMPTIONS;
const wiring = wiringFor(model.modelId);
const segmentsCouverts = (Object.keys(wiring.segmentMix) as Segment[]).filter(
  (x) => (wiring.segmentMix[x] ?? 0) > 0
);
const cohortRates = Array.from({ length: cohorts }, (_, c) => {
  const sub = sim.obligors.filter((o) => o.cohort === c && !o.alreadyInDefault && o.finalGrade !== null);
  return { c, f: sim.systematicFactors[c], rate: sub.reduce((x, o) => x + o.defaulted, 0) / Math.max(1, sub.length) };
});
const truePdMean =
  sim.obligors.filter((o) => !o.alreadyInDefault && o.finalGrade !== null).reduce((x, o) => x + o.truePd, 0) /
  Math.max(1, sim.obligors.filter((o) => !o.alreadyInDefault && o.finalGrade !== null).length);

// Constats calculés sur le portefeuille plutôt qu'affirmés : ils dépendent du
// modèle et du tirage, et doivent donc être relus à chaque exécution.
const notes = sim.obligors.filter((o) => !o.alreadyInDefault && o.finalGrade !== null && o.rawScore !== null);
const ordreGrades = model.masterScale.map((b) => b.grade);
const parGrade = ordreGrades
  .map((grade) => {
    const sub = notes.filter((o) => o.finalGrade === grade);
    return {
      grade,
      n: sub.length,
      part: sub.length / Math.max(1, notes.length),
      scoreMoyen: sub.length ? sub.reduce((x, o) => x + (o.rawScore as number), 0) / sub.length : NaN,
      // Seuls comptent les caps MORDANTS : ceux qui ont effectivement déplacé
      // le grade. Un cap déclaré mais moins sévère que le grade obtenu n'a rien
      // changé.
      partCap: sub.length ? sub.filter((o) => o.bindingCap !== null).length / sub.length : 0,
      partCapConfiance: sub.length
        ? sub.filter((o) => o.bindingCap === "CAP_CONFIDENCE").length / sub.length
        : 0,
    };
  })
  .filter((r) => r.n > 0);
const origineGrades = parGrade;
const inversionsScore: { from: string; to: string; fromScore: number; toScore: number }[] = [];
for (let i = 1; i < parGrade.length; i += 1) {
  if (parGrade[i].scoreMoyen > parGrade[i - 1].scoreMoyen) {
    inversionsScore.push({
      from: parGrade[i - 1].grade,
      to: parGrade[i].grade,
      fromScore: parGrade[i - 1].scoreMoyen,
      toScore: parGrade[i].scoreMoyen,
    });
  }
}
const concentrationMax = parGrade.reduce((best, r) => (r.part > best.part ? r : best), parGrade[0]);

const md: string[] = [];
md.push(`# Rapport de calibration — ${model.modelId}`);
md.push("");
md.push(`*${model.labelFr ?? model.modelId}*`);
md.push("");
md.push("> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration");
md.push("> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle");
md.push("> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de");
md.push("> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une");
md.push("> exigence en fonds propres, ni une décision d'octroi.");
md.push("");
md.push(`Calibration \`${calibrationId}\` · modèle ${model.modelId} v${model.version} · graine ${seed} · horizon 12 mois.`);
md.push("");
md.push("---");
md.push("");
md.push("## 1. Ce que cet exercice peut et ne peut pas établir");
md.push("");
md.push("**Ce qu'il établit.** Que le score du moteur ordonne le risque de façon exploitable ;");
md.push("que l'échelle maîtresse produit des PD monotones ; que la chaîne « données →");
md.push("moteur → score → grade → PD » tourne de bout en bout ; que la batterie de");
md.push("validation détecte effectivement les défauts de calibration lorsqu'il y en a.");
md.push("");
md.push("**Ce qu'il n'établit pas.** Le niveau des PD. Celui-ci est une conséquence");
md.push("arithmétique des hypothèses du simulateur — au premier rang desquelles la tendance");
md.push("centrale du taux de défaut, qui est POSÉE, non estimée. Le pouvoir discriminant");
md.push("obtenu est de la même nature : il découle du bruit que le simulateur introduit");
md.push("entre la qualité latente et les critères observés. Un Gini élevé sur données");
md.push("simulées ne dit rien du Gini sur le portefeuille réel.");
md.push("");
md.push("## 2. Processus générateur");
md.push("");
md.push("Les scores ne sont jamais simulés directement : le simulateur produit des données");
md.push("d'entrée (ratios, ancrages, flags, qualité de l'information) et c'est le moteur réel");
md.push("`computeRating` qui en tire un score et un grade. Un raccourci « score simulé → PD »");
md.push("aurait rendu l'exercice circulaire.");
md.push("");
md.push("```");
md.push("Q_i ~ N(0,1)                     qualité de crédit latente");
md.push("B_i ~ N(0,1)                     biais propre au dossier, non informatif sur le défaut");
md.push("signal_ij = a·Q_i + b·B_i + c·e_ij       → percentile → bande de barème ou ancrage");
md.push("");
md.push("p_i = Φ(m_s − k_s·Q_i)           PD vraie, avec m_s tel que E[p_i] = tendance centrale");
md.push("défaut ⟺ √ρ·F_t + √(1−ρ)·ε_i < Φ⁻¹(p_i)          (Vasicek / ASRF)");
md.push("```");
md.push("");
md.push("Conditionnellement à Q, score et défaut sont indépendants : le score n'est");
md.push("informatif que parce qu'il mesure Q, imparfaitement. Le terme B est essentiel —");
md.push("sans lui, l'agrégation de 45 critères ferait disparaître le bruit et produirait un");
md.push("pouvoir discriminant irréaliste.");
md.push("");
md.push("### Hypothèses posées");
md.push("");
md.push("| Hypothèse | Valeur | Statut |");
md.push("|---|---:|---|");
for (const seg of segmentsCouverts) {
  md.push(
    `| Tendance centrale du taux de défaut ${seg} | ${pct(a.centralDefaultRate[seg])} | **posée** — à remplacer par l'observé de la banque |`
  );
}
md.push(`| Corrélation d'actifs ρ | ${a.assetCorrelation} | ordre de grandeur du dispositif de Bâle pour les entreprises |`);
md.push(`| Part du signal portée par la qualité latente (a) | ${a.signalOnQuality} | **posée** — détermine le pouvoir discriminant |`);
md.push(`| Part portée par le biais de dossier (b) | ${a.signalOnFileBias} | **posée** — borne le pouvoir discriminant |`);
md.push(
  `| Répartition du portefeuille | ${segmentsCouverts.map((x) => `${x} ${pct(wiring.segmentMix[x] ?? 0, 0)}`).join(" · ")} | **posée** |`
);
md.push("");
md.push("## 3. Portefeuille simulé");
md.push("");
md.push(`${sim.obligors.length.toLocaleString("fr-FR")} contreparties sur ${cohorts} cohortes annuelles.`);
md.push("");
md.push("| Cohorte | Facteur systématique | Taux de défaut | Usage |");
md.push("|---:|---:|---:|---|");
for (const r of cohortRates) {
  md.push(`| ${r.c} | ${r.f.toFixed(3)} | ${pct(r.rate)} | ${r.c < developmentCohorts ? "développement / hors-échantillon" : "hors-période" } |`);
}
md.push("");
md.push(`La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **${pct(truePdMean)}**.`);
md.push("Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur");
md.push("systématique : c'est cette dispersion qui rend la distinction entre une PD");
md.push("« travers-le-cycle » et un taux ponctuel observable.");
md.push("");
md.push("### Population écartée de la calibration");
md.push("");
md.push("| Motif | Effectif | Part |");
md.push("|---|---:|---:|");
const ex = validation.excluded;
md.push(`| Déjà en défaut à l'observation | ${ex.alreadyInDefault.toLocaleString("fr-FR")} | ${pct(ex.alreadyInDefault / ex.total)} |`);
md.push(`| Scoring bloqué (donnée critique) | ${ex.blocked.toLocaleString("fr-FR")} | ${pct(ex.blocked / ex.total)} |`);
md.push(`| Aucun grade final (confiance insuffisante) | ${ex.noGrade.toLocaleString("fr-FR")} | ${pct(ex.noGrade / ex.total)} |`);
md.push("");
md.push("Une contrepartie déjà en défaut est écartée par construction : une PD est une");
md.push("probabilité de PASSER en défaut. La conserver gonflerait mécaniquement le pouvoir");
md.push("discriminant mesuré.");
md.push("");
md.push("## 4. Méthode d'affectation");
md.push("");
md.push(calibration.methodFr);
md.push("");
md.push("**Pourquoi calibrer sur le grade et non sur le score.** Le grade final intègre les");
md.push("caps — qualité de l'information, situations structurelles — qui déplacent une");
md.push("contrepartie vers le bas sans toucher à son score brut. Le score moyen n'est donc");
md.push("pas monotone dans l'échelle : un grade plafonné rassemble des dossiers bien notés.");
md.push("Dériver la PD d'une courbe du score réaffecterait à ces dossiers la PD de leur");
md.push("score et annulerait l'effet du cap.");
md.push("");
if (inversionsScore.length === 0) {
  md.push("Sur ce portefeuille, le score moyen reste néanmoins ordonné sur toute l'échelle.");
} else {
  md.push("Inversions constatées du score moyen sur ce portefeuille :");
  md.push("");
  for (const inv of inversionsScore) {
    md.push(
      `- ${inv.from} score moyen ${inv.fromScore.toFixed(1)} puis ${inv.to} score moyen ${inv.toScore.toFixed(1)} — soit ${inv.toScore > inv.fromScore ? "une remontée" : "une baisse"} de ${Math.abs(inv.toScore - inv.fromScore).toFixed(1)} point(s) en descendant d'un grade`
    );
  }
}
md.push("");
md.push("### Origine des grades : barème ou cap de qualité d'information ?");
md.push("");
md.push("| Grade | Effectif | Part | Score moyen | Déplacé par un cap | dont cap de confiance |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const r of origineGrades) {
  md.push(
    `| ${r.grade} | ${r.n.toLocaleString("fr-FR")} | ${pct(r.part, 1)} | ${r.scoreMoyen.toFixed(1)} | ${pct(r.partCap, 0)} | ${pct(r.partCapConfiance, 0)} |`
  );
}
md.push("");
md.push(`Concentration de l'échelle (Herfindahl) : **${num(validation.gradeHerfindahl)}**.`);
if (concentrationMax.part > 0.25) {
  md.push("");
  md.push(
    `Le grade ${concentrationMax.grade} rassemble à lui seul ${pct(concentrationMax.part, 1)} du portefeuille, et ${pct(concentrationMax.partCapConfiance, 0)} de ces dossiers y ont été déplacés par le cap de qualité d'information — pas par l'analyse du risque. C'est le comportement voulu du modèle, mais il a une conséquence opérationnelle directe : améliorer la collecte d'information déplacerait davantage de dossiers que réviser les pondérations.`
  );
}
md.push("");
md.push(`Marge de prudence appliquée : **+${(moc * 100).toFixed(0)} % en relatif**. Plancher : ${pct(calibration.floor, 2)}.`);
md.push("");
md.push("## 5. Échelle calibrée");
md.push("");
md.push("| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |");
md.push("|---|---:|---:|---:|---:|---:|");
for (const g of calibration.gradePd) {
  const check = validation.development.grades.find((x) => x.grade === g.grade);
  const vraie = check?.truePd ?? null;
  md.push(
    `| ${g.grade} | ${g.count.toLocaleString("fr-FR")} | ${pct(g.pd, 3)} | ${g.observedRate !== null ? pct(g.observedRate, 3) : "n/d"} | ${vraie !== null ? pct(vraie, 3) : "n/d"} | ${vraie ? `× ${(g.pd / vraie).toFixed(2)}` : "n/d"} |`
  );
}
md.push("| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |");
md.push("");
const fusions = tiedGrades(calibration);
if (fusions.length > 0) {
  md.push("**Grades fusionnés par la régression isotone.**");
  md.push("");
  for (const f of fusions) {
    md.push(`- ${f.grades.join(" et ")} portent la même PD (${pct(f.pd, 3)}).`);
  }
  md.push("");
  md.push("Ce n'est pas un défaut de la calibration : c'est le résultat correct lorsque deux");
  md.push("grades ne se distinguent pas sur les données. C'est en revanche un constat de");
  md.push("premier ordre — une distinction de grade qui ne porte aucune différence de risque");
  md.push("n'apporte rien à la décision. Deux issues possibles : revoir ce qui alimente ces");
  md.push("grades, ou les fusionner dans l'échelle maîtresse.");
}
md.push("");
md.push("La colonne « PD vraie » n'existe que parce que les données sont simulées : sur");
md.push("données réelles, la PD du processus générateur est inconnaissable. C'est le seul");
md.push("apport propre de la simulation — mesurer l'erreur de la calibration, et pas");
md.push("seulement son adéquation apparente.");
md.push("");
md.push("## 6. Validation");
md.push("");
md.push(sampleBlock(validation.development));
md.push(sampleBlock(validation.holdout));
md.push(sampleBlock(validation.outOfTime));
md.push("### Stabilité et concentration");
md.push("");
md.push("| Indicateur | Valeur | Lecture |");
md.push("|---|---:|---|");
md.push(`| Gini développement | ${num(validation.giniCi.point)} | intervalle bootstrap à 95 % : [${num(validation.giniCi.lower)} ; ${num(validation.giniCi.upper)}] |`);
md.push(`| Stabilité hors-échantillon | ${num(validation.psiHoldout)} | < 0,10 stable |`);
md.push(`| Stabilité hors-période | ${num(validation.psiOutOfTime)} | < 0,10 stable |`);
md.push(`| Concentration des grades | ${num(validation.gradeHerfindahl)} | Herfindahl sur la répartition |`);
md.push("");
md.push("| Segment | Effectif | Gini |");
md.push("|---|---:|---:|");
for (const s of validation.perSegmentGini) {
  md.push(`| ${s.segment} | ${s.n.toLocaleString("fr-FR")} | ${num(s.gini)} |`);
}
md.push("");
md.push("## 7. Reproductibilité");
md.push("");
md.push("```");
md.push(`npx tsx scripts/calibration/run.mts --seed ${seed} --cohorts ${cohorts} --per-cohort ${perCohort} --moc ${moc}`);
md.push("```");
md.push("");
md.push("Aucun appel à `Math.random()` n'intervient dans la chaîne : le générateur est à");
md.push("graine explicite (xoshiro128**), y compris pour les intervalles bootstrap. À graine");
md.push("égale, l'artefact produit est identique au bit près.");
md.push("");
md.push("## 8. Ce qu'il faudrait pour une calibration utilisable");
md.push("");
md.push("1. **Un historique de défauts réels** couvrant au minimum un cycle complet, avec une");
md.push("   définition de défaut stable sur toute la période et alignée sur la définition");
md.push("   prudentielle applicable.");
md.push("2. **Une tendance centrale estimée**, non posée : moyenne de long terme des taux de");
md.push("   défaut annuels par segment, et non le taux de la dernière année observée.");
md.push("3. **Une marge de prudence justifiée**, dérivée de l'incertitude d'estimation et des");
md.push("   insuffisances de données constatées, et non fixée forfaitairement comme ici.");
md.push("4. **Une validation indépendante** de la fonction de validation des modèles, puis un");
md.push("   passage en comité modèles.");
md.push("5. **Un suivi de performance** périodique : dérive du pouvoir discriminant, stabilité");
md.push("   de la population, adéquation des PD par grade.");
md.push("");
const reportPath = join(
  root,
  "docs",
  `06-rapport-calibration-${model.modelId.toLowerCase().replace(/_/g, "-")}.md`
);
writeFileSync(reportPath, `${md.join("\n")}\n`, "utf8");
console.log(`  rapport  : ${reportPath}\n`);

console.log("Échelle calibrée :");
for (const g of calibration.gradePd) {
  console.log(`  ${g.grade.padEnd(4)} n=${String(g.count).padStart(6)}  PD ${(g.pd * 100).toFixed(3).padStart(7)} %`);
}
console.log(
  `\nGini ${validation.development.gini.toFixed(4)} (dév.) · ${validation.holdout.gini.toFixed(4)} (hors-éch.) · ${validation.outOfTime.gini.toFixed(4)} (hors-période)`
);
console.log("Données SIMULÉES : ne pas utiliser pour un calcul réglementaire.");
