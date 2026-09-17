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
