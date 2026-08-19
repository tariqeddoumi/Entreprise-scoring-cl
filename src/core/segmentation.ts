import type { RatingInput, Segment, SegmentationRuleConfig } from "./types";

export interface SegmentationResult {
  segment: Segment | null;
  source: "PROVIDED" | "COMPUTED" | "UNDETERMINED";
  explanationFr: string;
}

/**
 * Moteur de segmentation TPE/PME/GE — règle seed paramétrable, à confirmer
 * dans le corpus BAM applicable (segmentation prudentielle des entreprises).
 *
 * Règle seed :
 *  - GE  : CA HT entreprise/groupe > geTurnoverThreshold (175 MMAD)
 *  - PME : CA > smeTurnoverThreshold (10 MMAD) et <= geTurnoverThreshold ;
 *          ou CA <= smeTurnoverThreshold avec exposition globale > smeExposureThreshold (2 MMAD)
 *  - TPE : CA <= smeTurnoverThreshold et exposition globale <= smeExposureThreshold
 *
 * Si le segment ne peut être déterminé, le scoring final est bloqué.
 */
export function determineSegment(
  input: RatingInput,
  rule: SegmentationRuleConfig
): SegmentationResult {
  if (input.segment) {
    return {
      segment: input.segment,
      source: "PROVIDED",
      explanationFr: `Segment ${input.segment} fourni par l'appelant (référentiel amont).`,
    };
  }

  const data = input.segmentationData;
  const turnover =
    data?.groupAnnualTurnover !== undefined
      ? Math.max(data.groupAnnualTurnover, data.annualTurnover ?? 0)
      : data?.annualTurnover;

  if (turnover === undefined || turnover === null || turnover < 0) {
    return {
      segment: null,
      source: "UNDETERMINED",
      explanationFr:
        "Segment indéterminable : chiffre d'affaires entreprise/groupe absent ou invalide. Scoring bloqué.",
    };
  }

  if (turnover > rule.geTurnoverThreshold) {
    return {
      segment: "GE",
      source: "COMPUTED",
      explanationFr: `GE : CA HT ${fmtMad(turnover)} > ${fmtMad(rule.geTurnoverThreshold)} (règle seed ${rule.status}).`,
    };
  }

  if (turnover > rule.smeTurnoverThreshold) {
    return {
      segment: "PME",
      source: "COMPUTED",
      explanationFr: `PME : CA HT ${fmtMad(turnover)} compris entre ${fmtMad(rule.smeTurnoverThreshold)} et ${fmtMad(rule.geTurnoverThreshold)} (règle seed ${rule.status}).`,
    };
  }

  const exposure = data?.globalBankExposure;
  if (exposure === undefined || exposure === null || exposure < 0) {
    return {
      segment: null,
      source: "UNDETERMINED",
      explanationFr:
        "Segment indéterminable : CA <= seuil TPE/PME mais exposition globale banque/groupe absente. Scoring bloqué.",
    };
  }

  if (exposure > rule.smeExposureThreshold) {
    return {
      segment: "PME",
      source: "COMPUTED",
      explanationFr: `PME : CA HT ${fmtMad(turnover)} <= ${fmtMad(rule.smeTurnoverThreshold)} mais exposition globale ${fmtMad(exposure)} > ${fmtMad(rule.smeExposureThreshold)} (règle seed ${rule.status}).`,
    };
  }

  return {
    segment: "TPE",
    source: "COMPUTED",
    explanationFr: `TPE : CA HT ${fmtMad(turnover)} <= ${fmtMad(rule.smeTurnoverThreshold)} et exposition globale ${fmtMad(exposure)} <= ${fmtMad(rule.smeExposureThreshold)} (règle seed ${rule.status}).`,
  };
}

function fmtMad(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR")} MMAD`;
  return `${v.toLocaleString("fr-FR")} MAD`;
}
