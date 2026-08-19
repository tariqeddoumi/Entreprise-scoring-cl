import { checkBins } from "./binning";
import type { ModelConfig, Segment } from "./types";

/**
 * Validateur de configuration de modèle. Une version de modèle ne peut être
 * publiée (ni même chargée par le moteur) si une seule de ces règles échoue :
 *  - somme des poids critères = 10 000 bps (100,00 %) par segment ;
 *  - somme des poids d'un domaine = poids affiché du domaine ;
 *  - barèmes quantitatifs exhaustifs, sans trou ni chevauchement ;
 *  - master scale exhaustive sur [0, 100] ;
 *  - pondérations de confiance = 100 ; bandes de confiance exhaustives ;
 *  - références domaine/critère cohérentes.
 */
export function validateModel(model: ModelConfig): string[] {
  const issues: string[] = [];

  const domainCodes = new Set(model.domains.map((d) => d.code));
  for (const c of model.criteria) {
    if (!domainCodes.has(c.domainCode)) {
      issues.push(`${c.code} : domaine inconnu ${c.domainCode}`);
    }
    if (c.type === "QUANTITATIVE") {
      if (!c.binsBySegment) {
        issues.push(`${c.code} : critère quantitatif sans barème`);
      } else {
        for (const [seg, bins] of Object.entries(c.binsBySegment)) {
          for (const issue of checkBins(bins)) {
            issues.push(`${c.code} [${seg}] : ${issue}`);
          }
        }
        // Chaque segment pondéré doit avoir un barème (spécifique ou ALL).
        for (const seg of model.segments) {
          if ((c.weightsBps[seg] ?? 0) > 0 && !c.binsBySegment[seg] && !c.binsBySegment.ALL) {
            issues.push(`${c.code} : aucun barème pour le segment pondéré ${seg}`);
          }
        }
      }
    } else {
      if (!c.anchors || c.anchors.length !== 5) {
        issues.push(`${c.code} : critère qualitatif sans les 5 ancrages 0/25/50/75/100`);
      } else {
        const scores = [...c.anchors.map((a) => a.score)].sort((a, b) => a - b);
        if (scores.join(",") !== "0,25,50,75,100") {
          issues.push(`${c.code} : ancrages incomplets (${scores.join(",")})`);
        }
      }
    }
  }

  for (const seg of model.segments) {
    let total = 0;
    for (const c of model.criteria) total += c.weightsBps[seg] ?? 0;
    if (total !== 10000) {
      issues.push(
        `Segment ${seg} : somme des poids critères = ${total} bps (attendu 10000)`
      );
    }
  }

  // Master scale : couvre [0, 100] sans trou, bornes min incluses / max exclues.
  const scale = model.masterScale;
  if (scale.length === 0) {
    issues.push("Master scale vide");
  } else {
    if (scale[scale.length - 1].minScore !== null && scale[scale.length - 1].minScore !== 0) {
      // dernière bande = la pire ; elle doit couvrir jusqu'à 0 inclus
    }
    const sorted = [...scale].sort(
      (a, b) => (b.minScore ?? -1) - (a.minScore ?? -1)
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.minScore === null) {
        issues.push(`Master scale : bande ${cur.grade} sans borne minimale mais non terminale`);
        continue;
      }
      if (next.maxScore !== cur.minScore) {
        issues.push(
          `Master scale : discontinuité entre ${next.grade} (max=${next.maxScore}) et ${cur.grade} (min=${cur.minScore})`
        );
      }
    }
    const worst = sorted[sorted.length - 1];
    if (worst.minScore !== null && worst.minScore > 0) {
      issues.push(`Master scale : les scores < ${worst.minScore} ne sont pas couverts`);
    }
    const best = sorted[0];
    if (best.maxScore !== null && best.maxScore <= 100) {
      issues.push(`Master scale : les scores >= ${best.maxScore} ne sont pas couverts`);
    }
  }

  const cw = model.confidenceWeights;
  const cwTotal = cw.completeness + cw.freshness + cw.reliability + cw.provenance;
  if (cwTotal !== 100) {
    issues.push(`Pondérations de confiance : somme = ${cwTotal} (attendu 100)`);
  }

  // Bandes de confiance : exhaustives sur [0, 100].
  const cc = [...model.confidenceCaps].sort((a, b) => a.minConfidence - b.minConfidence);
  if (cc.length === 0) {
    issues.push("Aucune bande de confiance");
  } else {
    if (cc[0].minConfidence !== 0) {
      issues.push(`Bandes de confiance : ne couvrent pas 0 (min=${cc[0].minConfidence})`);
    }
    for (let i = 0; i < cc.length - 1; i++) {
      if (cc[i].maxConfidence !== cc[i + 1].minConfidence) {
        issues.push(
          `Bandes de confiance : discontinuité à ${cc[i].maxConfidence}/${cc[i + 1].minConfidence}`
        );
      }
    }
    if (cc[cc.length - 1].maxConfidence !== null) {
      issues.push("Bandes de confiance : la dernière bande doit être ouverte (max=null)");
    }
  }

  // Caps : grades référencés existants.
  const gradeSet = new Set(model.masterScale.map((b) => b.grade));
  for (const cap of model.structuralCaps) {
    if (cap.maxGrade !== "NO_GRADE" && !gradeSet.has(cap.maxGrade)) {
      issues.push(`Cap ${cap.code} : grade plafond inconnu ${cap.maxGrade}`);
    }
  }
  for (const band of model.confidenceCaps) {
    if (band.maxGrade !== "NONE" && band.maxGrade !== "NO_GRADE" && !gradeSet.has(band.maxGrade)) {
      issues.push(`Bande de confiance ${band.levelFr} : grade plafond inconnu ${band.maxGrade}`);
    }
  }

  return issues;
}

/** Somme des poids d'un domaine pour un segment, en bps. */
export function domainWeightBps(model: ModelConfig, domainCode: string, segment: Segment): number {
  return model.criteria
    .filter((c) => c.domainCode === domainCode)
    .reduce((acc, c) => acc + (c.weightsBps[segment] ?? 0), 0);
}
