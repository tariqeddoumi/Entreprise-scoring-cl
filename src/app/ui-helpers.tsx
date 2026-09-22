/**
 * Composants d'affichage partagés entre pages serveur et client.
 *
 * Purement cosmétiques : les couleurs ici n'entrent dans aucun calcul et ne
 * dérivent d'aucune règle métier. Elles servent uniquement à donner un repère
 * visuel rapide (favorable / à surveiller / défavorable) dans les tableaux et
 * badges. La seule vérité sur un grade ou un red flag reste le moteur.
 */
import type { CSSProperties } from "react";

/**
 * Couleur d'un grade.
 *
 * Chaque modèle porte désormais son échelle propre — STD-P1…STD-P8 pour le
 * modèle standard, TPE-B1…TPE-B6 pour le comportemental — et les deux n'ont
 * ni la même longueur ni la même signification (constat C03). La couleur est
 * donc calculée sur la POSITION RELATIVE dans l'échelle du grade lu, à partir
 * du nombre de grades que porte son préfixe, et non sur un numéro absolu.
 *
 * Reste purement cosmétique : aucun calcul métier n'en dépend.
 */
const SCALE_LENGTHS: Record<string, number> = { "STD-P": 8, "TPE-B": 6 };

export function gradeAccent(grade: string | null | undefined): string {
  if (!grade) return "var(--muted)";
  if (grade.startsWith("DEF")) return "var(--bad)";
  const match = /^([A-Z]+-[A-Z])(\d+)$/.exec(grade);
  if (!match) return "var(--muted)";
  const total = SCALE_LENGTHS[match[1]];
  if (!total) return "var(--muted)";
  const position = Number(match[2]) / total;
  if (position <= 0.4) return "var(--good)";
  if (position <= 0.75) return "var(--warn)";
  return "var(--bad)";
}

function badgeStyle(color: string, fontSize: number): CSSProperties {
  return {
    display: "inline-block",
    padding: "1px 8px",
    borderRadius: 999,
    fontSize,
    fontWeight: 700,
    lineHeight: "16px",
    color,
    border: `1px solid ${color}`,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    whiteSpace: "nowrap",
  };
}

export function GradeBadge({
  grade,
  size = "sm",
}: {
  grade: string | null | undefined;
  /** "sm" pour une cellule de tableau, "lg" pour une métrique mise en avant. */
  size?: "sm" | "lg";
}) {
  if (!grade) return <span className="muted">—</span>;
  return <span style={badgeStyle(gradeAccent(grade), size === "lg" ? 16 : 12)}>{grade}</span>;
}

/** Couleur d'un niveau de red flag : jamais décorative pour BLOCK/DEFAULT_CHECK. */
export function redFlagAccent(level: string): string {
  switch (level) {
    case "BLOCK":
    case "DEFAULT_CHECK":
      return "var(--bad)";
    case "REFER":
    case "WARNING":
      return "var(--warn)";
    default:
      return "var(--muted)";
  }
}

export function RedFlagLevelBadge({ level }: { level: string }) {
  return <span style={badgeStyle(redFlagAccent(level), 11)}>{level}</span>;
}

/**
 * Libellé d'un statut de notation persisté.
 *
 * Une base en exploitation contient deux vocabulaires : celui du moteur
 * courant (RATED, NO_RATING_*) et celui des moteurs antérieurs (SCORED,
 * BLOCKED_*). Les afficher bruts, côte à côte dans la même colonne, oblige le
 * lecteur à savoir lequel est lequel — et laisse croire que « SCORED » et
 * « RATED » sont deux états différents alors qu'ils nomment le même.
 *
 * Le libellé est donc traduit, et l'origine ancienne est signalée plutôt que
 * masquée : une notation d'archive n'a pas été produite par les règles
 * d'aujourd'hui.
 */
const OUTCOME_LABELS: Record<string, string> = {
  // Vocabulaire courant (RatingResult.ratingStatus).
  RATED: "Notation produite",
  DEFAULTED: "Grade de défaut constaté",
  NO_RATING_INSUFFICIENT_DATA: "Aucun grade — information insuffisante",
  NO_RATING_SEGMENT_UNDETERMINED: "Aucun grade — segment indéterminable",
  NO_RATING_ROUTED_OTHER_MODEL: "Dossier routé hors de cette grille",
};

const LEGACY_OUTCOME_LABELS: Record<string, string> = {
  // Vocabulaire des moteurs antérieurs, conservé en base par immuabilité.
  SCORED: "Notation produite",
  DEFAULT_GRADE: "Grade de défaut constaté",
  BLOCKED_DATA: "Aucun grade — information insuffisante",
  BLOCKED_RED_FLAG: "Aucun grade — signal bloquant",
  BLOCKED_SEGMENTATION: "Aucun grade — segment indéterminable",
  NO_GRADE_CONFIDENCE: "Aucun grade — qualité de données insuffisante",
};

export function isLegacyOutcome(outcome: string): boolean {
  return !(outcome in OUTCOME_LABELS) && outcome in LEGACY_OUTCOME_LABELS;
}

export function OutcomeLabel({ outcome }: { outcome: string }) {
  const current = OUTCOME_LABELS[outcome];
  if (current) return <span>{current}</span>;

  const legacy = LEGACY_OUTCOME_LABELS[outcome];
  if (legacy) {
    return (
      <span>
        {legacy}{" "}
        <span className="muted" style={{ fontSize: 11 }} title={`Statut « ${outcome} » d'un moteur antérieur`}>
          (archive)
        </span>
      </span>
    );
  }
  // Statut inconnu des deux vocabulaires : affiché tel quel, jamais deviné.
  return <span className="muted">{outcome}</span>;
}
