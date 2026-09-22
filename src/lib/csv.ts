/**
 * Sérialisation CSV des exports.
 *
 * Isolé du composant : une protection contre l'injection de formules doit être
 * testable sans monter de rendu React.
 */

/**
 * Échappement d'un champ CSV.
 *
 * Deux protections distinctes, à ne pas confondre :
 *
 *  1. le découpage en colonnes — guillemets doublés, champ entre guillemets dès
 *     qu'il contient un séparateur ou un saut de ligne ;
 *  2. l'interprétation par le tableur — un champ commençant par `=`, `+`, `-`,
 *     `@`, une tabulation ou un retour chariot est exécuté comme une formule à
 *     l'ouverture dans Excel ou LibreOffice. Le nom et l'ICE d'une contrepartie
 *     sont saisis par un utilisateur : sans neutralisation, un export ouvert par
 *     un tiers peut déclencher une requête externe (DDE, WEBSERVICE, HYPERLINK).
 *     Les guillemets n'y changent rien — la neutralisation passe par une
 *     apostrophe en tête, que le tableur consomme comme marqueur de texte.
 */
export function csvField(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r;]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
}

/** Assemble une ligne CSV séparée par des points-virgules (Excel FR). */
export function csvLine(values: readonly (string | number | null | undefined)[]): string {
  return values.map((v) => csvField(v === null || v === undefined ? "" : String(v))).join(";");
}
