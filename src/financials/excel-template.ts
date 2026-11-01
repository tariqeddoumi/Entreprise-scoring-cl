import { excelDate, readXlsx, writeXlsx, type WriteCell } from "@/lib/xlsx";
import { FINANCIAL_CHART_VERSION, POSTES, SECTION_LABELS, type PosteSection, type StatementModel } from "./chart";
import { MAX_FISCAL_YEARS, type FinancialYearDraft } from "./compute";

/**
 * Gabarit Excel de la banque pour la saisie du bilan.
 *
 * Le gabarit porte en colonne A le code de chaque poste : l'import relit ces
 * codes, jamais les libellés, et reste donc exact même si un libellé est
 * retouché. Les totaux ne se saisissent pas : ils sont recalculés.
 */

export const TEMPLATE_MARKER = "GABARIT_BILAN_CGNC";
const META_ROWS = { EXERCICE: "Exercice (année)", DATE_CLOTURE: "Date de clôture (AAAA-MM-JJ)", MODELE: "Modèle : NORMAL ou SIMPLIFIE", CERTIFIES: "Comptes certifiés : OUI ou NON" } as const;

export function buildTemplate(): Uint8Array {
  const rows: WriteCell[][] = [
    [{ value: TEMPLATE_MARKER, style: 1 }, { value: `Gabarit de saisie du bilan et du CPC (CGNC) — ${FINANCIAL_CHART_VERSION}`, style: 1 }],
    [{ value: "" }, { value: "Montants en unités de la devise des comptes, sans séparateur. Ne pas modifier la colonne A. Les totaux sont recalculés par l'outil.", style: 4 }],
    [{ value: "" }],
    [{ value: "Code", style: 3 }, { value: "Rubrique", style: 3 }, { value: "Exercice N", style: 3 }, { value: "Exercice N−1", style: 3 }, { value: "Exercice N−2", style: 3 }],
    ...Object.entries(META_ROWS).map(([k, l]) => [{ value: k }, { value: l, style: 1 as const }, { value: "" }, { value: "" }, { value: "" }]),
  ];
  let section: PosteSection | null = null;
  for (const p of POSTES) {
    if (p.section !== section) {
      section = p.section;
      rows.push([{ value: "" }]);
      rows.push([{ value: "" }, { value: SECTION_LABELS[section], style: 3 }, { value: "", style: 3 }, { value: "", style: 3 }, { value: "", style: 3 }]);
    }
    if (p.kind === "TOTAL") {
      rows.push([{ value: "" }, { value: `${p.labelFr} — calculé par l'outil`, style: 4 }]);
      continue;
    }
    rows.push([{ value: p.key }, { value: p.onlyN ? `${p.labelFr} (exercice N)` : p.labelFr }, { value: "", style: 2 }, { value: "", style: 2 }, { value: "", style: 2 }]);
  }
  return writeXlsx("Bilan", rows, [30, 70, 18, 18, 18]);
}

export interface TemplateImport {
  statementModel: StatementModel | "";
  certified: boolean;
  years: FinancialYearDraft[];
  /** Postes reconnus, toutes années confondues. */
  recognized: number;
}

/** Relit un gabarit rempli ; null si le classeur n'est pas le gabarit de la banque. */
export function parseTemplate(bytes: Uint8Array): TemplateImport | null {
  const sheets = readXlsx(bytes);
  const sheet = sheets.find((s) => s.rows.some((r) => r[0] === TEMPLATE_MARKER));
  if (!sheet) return null;
  const keys = new Set(POSTES.filter((p) => p.kind !== "TOTAL").map((p) => p.key));
  const years: FinancialYearDraft[] = Array.from({ length: MAX_FISCAL_YEARS }, () => ({ fiscalYear: "", closingDate: "", values: {} }));
  let statementModel: StatementModel | "" = "";
  let certified = false;
  let recognized = 0;
  for (const r of sheet.rows) {
    const code = (r[0] ?? "").trim().toUpperCase();
    const cells = [r[2] ?? "", r[3] ?? "", r[4] ?? ""];
    if (code === "EXERCICE") cells.forEach((c, i) => (years[i].fiscalYear = c.replace(/\.0+$/, "").slice(0, 20)));
    else if (code === "DATE_CLOTURE") cells.forEach((c, i) => (years[i].closingDate = excelDate(c)));
    else if (code === "MODELE") {
      const m = cells[0].trim().toUpperCase();
      statementModel = m.startsWith("SIMPL") ? "SIMPLIFIE" : m.startsWith("NORM") ? "NORMAL" : "";
    } else if (code === "CERTIFIES") certified = /^(OUI|O|VRAI|TRUE|1|YES)$/i.test(cells[0].trim());
    else if (keys.has(code)) {
      cells.forEach((c, i) => {
        const v = c.trim();
        if (v !== "") {
          years[i].values[code] = v;
          recognized++;
        }
      });
    }
  }
  // Les colonnes gardent leur rang (N, N−1, N−2) : seules les dernières vides sont retirées.
  let last = -1;
  years.forEach((y, i) => {
    if (Object.keys(y.values).length > 0 || y.closingDate) last = i;
  });
  return { statementModel, certified, years: years.slice(0, Math.max(2, last + 1)), recognized };
}
