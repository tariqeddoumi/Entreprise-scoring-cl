import type { RatingResult } from "@/core/types";

/**
 * Lecture d'un instantané de notation persisté.
 *
 * Un instantané est immuable par construction : c'est ce qui rend une décision
 * historique opposable. La conséquence est qu'une base en exploitation contient
 * des instantanés produits par des moteurs antérieurs, dont la forme n'est plus
 * celle d'aujourd'hui. Un moteur v1 écrivait `confidenceScore`,
 * `applicableWeightBps` et `appliedCaps` ; la V3 lit `confidence`, `coverage`,
 * `usageRights` et `appliedRules`.
 *
 * Les convertir silencieusement en objets V3 serait une falsification : il
 * faudrait inventer un taux de couverture et une classe de confiance qui
 * n'existaient pas au moment de la notation. Le parti retenu est donc de les
 * RECONNAÎTRE et de les afficher pour ce qu'ils sont — une archive — plutôt que
 * de les maquiller ou, comme c'était le cas, de laisser la page planter sur un
 * déréférencement.
 *
 * La reconnaissance est structurelle et non fondée sur un numéro de version :
 * une version peut être mal renseignée, une forme non.
 */

/** Champs qu'un instantané antérieur est susceptible de porter. */
export interface LegacySnapshot {
  modelId?: string;
  modelVersion?: string;
  engineVersion?: string;
  asOfDate?: string;
  segment?: string | null;
  rawScore?: number | null;
  confidenceScore?: number | null;
  engineGrade?: string | null;
  cappedGrade?: string | null;
  finalGrade?: string | null;
  explanationFr?: string;
  appliedCaps?: Array<{ code?: string; labelFr?: string; maxGrade?: string }>;
  domainResults?: Array<{ code?: string; labelFr?: string; score?: number | null }>;
  triggeredRedFlags?: Array<{ code?: string; labelFr?: string; level?: string }>;
  blockingReasonsFr?: string[];
}

export type SnapshotRead =
  | { kind: "V3"; result: RatingResult }
  | { kind: "LEGACY"; raw: LegacySnapshot; reasonFr: string }
  | { kind: "UNREADABLE"; reasonFr: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Un instantané est exploitable par les composants V3 s'il porte les quatre
 * structures que ceux-ci déréférencent sans garde : la couverture, la classe de
 * confiance, les droits d'usage et la liste des exceptions appliquées.
 */
export function isV3Snapshot(value: unknown): value is RatingResult {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.coverage) &&
    isRecord(value.confidence) &&
    isRecord(value.usageRights) &&
    Array.isArray(value.appliedRules) &&
    Array.isArray(value.domainResults) &&
    Array.isArray(value.triggeredRedFlags)
  );
}

/** Champs de l'ancienne forme, utiles pour expliquer précisément le refus. */
function legacyMarkers(value: Record<string, unknown>): string[] {
  const markers: string[] = [];
  if ("confidenceScore" in value) markers.push("confidenceScore");
  if ("appliedCaps" in value) markers.push("appliedCaps");
  if ("applicableWeightBps" in value) markers.push("applicableWeightBps");
  return markers;
}

export function readResultSnapshot(json: string): SnapshotRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      kind: "UNREADABLE",
      reasonFr: "Instantané illisible : le JSON persisté n'a pas pu être analysé.",
    };
  }

  if (isV3Snapshot(parsed)) return { kind: "V3", result: parsed };

  if (!isRecord(parsed)) {
    return {
      kind: "UNREADABLE",
      reasonFr: "Instantané illisible : le contenu persisté n'est pas un objet.",
    };
  }

  const markers = legacyMarkers(parsed);
  const version = typeof parsed.engineVersion === "string" ? parsed.engineVersion : null;
  return {
    kind: "LEGACY",
    raw: parsed as LegacySnapshot,
    reasonFr:
      `Instantané produit par un moteur antérieur${version ? ` (v${version})` : ""}` +
      (markers.length > 0 ? `, reconnu à ses champs ${markers.join(", ")}` : "") +
      ". Il est affiché tel qu'archivé : la classe de confiance et la couverture " +
      "n'existaient pas au moment de cette notation et ne sont pas reconstituées.",
  };
}
