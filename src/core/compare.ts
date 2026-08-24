import type { RatingResult } from "./types";

/**
 * Comparaison de deux exécutions de notation.
 *
 * Répondre à « pourquoi la note a-t-elle changé ? » est une exigence de
 * contrôle : sans attribution, une migration de grade n'est pas justifiable
 * devant un comité ou un auditeur. La comparaison est une fonction pure, elle
 * n'exige donc ni base ni recalcul.
 *
 * Convention : `previous` est l'exécution la plus ancienne, `current` la plus
 * récente. Un écart positif traduit une amélioration.
 */

export interface CriterionDelta {
  code: string;
  labelFr: string;
  domainCode: string;
  previousScore: number | null;
  currentScore: number | null;
  /** Effet sur le score global, en points. */
  impact: number;
  natureFr: string;
}

export interface DomainDelta {
  code: string;
  labelFr: string;
  previousScore: number | null;
  currentScore: number | null;
  /** Effet sur le score global, en points. */
  contributionDelta: number;
}

export interface RunComparison {
  comparable: boolean;
  incomparableReasonFr?: string;
  previousScore: number | null;
  currentScore: number | null;
  scoreDelta: number | null;
  previousGrade: string | null;
  currentGrade: string | null;
  gradeChanged: boolean;
  domainDeltas: DomainDelta[];
  criterionDeltas: CriterionDelta[];
  capChangesFr: string[];
  redFlagChangesFr: string[];
  summaryFr: string;
}

export function compareRuns(previous: RatingResult, current: RatingResult): RunComparison {
  const empty: Omit<RunComparison, "comparable" | "incomparableReasonFr" | "summaryFr"> = {
    previousScore: previous.rawScore,
    currentScore: current.rawScore,
    scoreDelta: null,
    previousGrade: previous.finalGrade,
    currentGrade: current.finalGrade,
    gradeChanged: previous.finalGrade !== current.finalGrade,
    domainDeltas: [],
    criterionDeltas: [],
    capChangesFr: [],
    redFlagChangesFr: [],
  };

  // Deux modèles différents produisent des échelles non comparables : sans
  // table de correspondance validée, l'écart n'a pas de sens.
  if (previous.modelId !== current.modelId) {
    return {
      ...empty,
      comparable: false,
      incomparableReasonFr: `Modèles différents (${previous.modelId} puis ${current.modelId}) : les scores ne sont pas comparables sans table de correspondance validée.`,
      summaryFr: "Comparaison impossible : changement de modèle.",
    };
  }
  if (previous.segment !== current.segment) {
    return {
      ...empty,
      comparable: false,
      incomparableReasonFr: `Segment différent (${previous.segment} puis ${current.segment}) : les pondérations et les barèmes ne sont pas les mêmes.`,
      summaryFr: "Comparaison impossible : changement de segment.",
    };
  }
  if (previous.rawScore === null || current.rawScore === null) {
    return {
      ...empty,
      comparable: false,
      incomparableReasonFr:
        "L'une des exécutions n'a pas produit de score (blocage ou qualité insuffisante).",
      summaryFr: "Comparaison impossible : une exécution sans score.",
    };
  }

  const scoreDelta = current.rawScore - previous.rawScore;

  // --- Écarts par domaine ----------------------------------------------------
  const domainDeltas: DomainDelta[] = [];
  for (const cur of current.domainResults) {
    const prev = previous.domainResults.find((d) => d.code === cur.code);
    domainDeltas.push({
      code: cur.code,
      labelFr: cur.labelFr,
      previousScore: prev?.score ?? null,
      currentScore: cur.score,
      contributionDelta: (cur.globalContribution ?? 0) - (prev?.globalContribution ?? 0),
    });
  }
  domainDeltas.sort((a, b) => Math.abs(b.contributionDelta) - Math.abs(a.contributionDelta));

  // --- Écarts par critère ----------------------------------------------------
  const prevCriteria = new Map(
    previous.domainResults.flatMap((d) => d.criteria).map((c) => [c.code, c])
  );
  const criterionDeltas: CriterionDelta[] = [];
  for (const cur of current.domainResults.flatMap((d) => d.criteria)) {
    const prev = prevCriteria.get(cur.code);
    if (!prev) continue;
    if (prev.score === cur.score) continue;

    // L'effet sur le score global se mesure à poids constant : le poids d'un
    // critère ne varie qu'avec le segment, déjà contrôlé plus haut.
    const impact = ((cur.score ?? 0) - (prev.score ?? 0)) * (cur.weightBps / 10000);

    let natureFr: string;
    if (prev.score === null) natureFr = "critère désormais évalué";
    else if (cur.score === null) natureFr = "critère devenu non évalué";
    else natureFr = cur.score > prev.score ? "amélioration" : "dégradation";

    criterionDeltas.push({
      code: cur.code,
      labelFr: cur.labelFr,
      domainCode: cur.domainCode,
      previousScore: prev.score,
      currentScore: cur.score,
      impact,
      natureFr,
    });
  }
  criterionDeltas.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // --- Caps et red flags -----------------------------------------------------
  const prevCaps = new Set(previous.appliedCaps.map((c) => c.code));
  const curCaps = new Set(current.appliedCaps.map((c) => c.code));
  const capChangesFr = [
    ...[...curCaps]
      .filter((c) => !prevCaps.has(c))
      .map((c) => `Cap ${c} désormais appliqué : ${labelOfCap(current, c)}`),
    ...[...prevCaps]
      .filter((c) => !curCaps.has(c))
      .map((c) => `Cap ${c} levé : ${labelOfCap(previous, c)}`),
  ];

  const prevFlags = new Set(previous.triggeredRedFlags.map((f) => f.code));
  const curFlags = new Set(current.triggeredRedFlags.map((f) => f.code));
  const redFlagChangesFr = [
    ...[...curFlags]
      .filter((f) => !prevFlags.has(f))
      .map((f) => `Red flag ${f} apparu : ${labelOfFlag(current, f)}`),
    ...[...prevFlags]
      .filter((f) => !curFlags.has(f))
      .map((f) => `Red flag ${f} levé : ${labelOfFlag(previous, f)}`),
  ];

  return {
    comparable: true,
    previousScore: previous.rawScore,
    currentScore: current.rawScore,
    scoreDelta,
    previousGrade: previous.finalGrade,
    currentGrade: current.finalGrade,
    gradeChanged: previous.finalGrade !== current.finalGrade,
    domainDeltas,
    criterionDeltas,
    capChangesFr,
    redFlagChangesFr,
    summaryFr: buildSummary(scoreDelta, previous, current, criterionDeltas),
  };
}

function labelOfCap(r: RatingResult, code: string): string {
  return r.appliedCaps.find((c) => c.code === code)?.labelFr ?? code;
}
function labelOfFlag(r: RatingResult, code: string): string {
  return r.triggeredRedFlags.find((f) => f.code === code)?.labelFr ?? code;
}

function buildSummary(
  delta: number,
  previous: RatingResult,
  current: RatingResult,
  deltas: CriterionDelta[]
): string {
  const parts: string[] = [];
  const sens = delta > 0 ? "amélioration" : delta < 0 ? "dégradation" : "stabilité";
  parts.push(
    `Score ${previous.rawScore?.toFixed(2)} → ${current.rawScore?.toFixed(2)} (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} point${Math.abs(delta) >= 2 ? "s" : ""}, ${sens}).`
  );

  if (previous.finalGrade !== current.finalGrade) {
    parts.push(`Grade ${previous.finalGrade ?? "—"} → ${current.finalGrade ?? "—"}.`);
  } else {
    parts.push(`Grade inchangé (${current.finalGrade ?? "—"}).`);
  }

  const top = deltas.slice(0, 3);
  if (top.length > 0) {
    parts.push(
      `Contributions principales : ${top
        .map((d) => `${d.code} (${d.impact >= 0 ? "+" : ""}${d.impact.toFixed(2)})`)
        .join(", ")}.`
    );
  } else {
    parts.push("Aucun critère n'a changé de score.");
  }
  return parts.join(" ");
}
