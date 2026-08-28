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
 * Couleur d'un grade, par tiers de l'échelle G1–G10 (+ DEF, toujours le pire).
 * Ne dépend pas de la master scale d'un modèle précis : les modèles publiés
 * partagent aujourd'hui la même échelle à dix grades, et cette fonction reste
 * une approximation d'affichage même si ce n'était plus le cas.
 */
export function gradeAccent(grade: string | null | undefined): string {
  if (!grade) return "var(--muted)";
  if (grade.startsWith("DEF")) return "var(--bad)";
  const match = /^G(\d+)$/.exec(grade);
  if (!match) return "var(--muted)";
  const n = Number(match[1]);
  if (n <= 4) return "var(--good)";
  if (n <= 7) return "var(--warn)";
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
