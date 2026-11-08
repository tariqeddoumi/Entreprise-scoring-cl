import { getSessionIdentity } from "@/lib/session";
import { effectiveFormat } from "@/lib/statement-format";
import { formatPostes, inputKeys } from "@/financials/statement-format";
import { today } from "@/lib/rating-scale";
import { writeWorkbook, type WriteCell } from "@/lib/xlsx";
import { STOCK_COLUMNS, STOCK_SHEETS, type StockSheet } from "@/reference/stock-import";

export const dynamic = "force-dynamic";

/** Modèle du classeur de reprise du stock : une feuille d'explications, une feuille par nature de données. */
export async function GET() {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  const format = await effectiveFormat(today());
  const h = (v: string): WriteCell => ({ value: v, style: 3 });
  const t = (v: string): WriteCell => ({ value: v });
  const readme: WriteCell[][] = [
    [{ value: "Reprise du stock — mode d'emploi", style: 1 }],
    [t("Remplissez les feuilles utiles (une ou plusieurs), sans modifier les en-têtes. Les colonnes marquées * sont obligatoires.")],
    [t("Dates : AAAA-MM-JJ ou JJ/MM/AAAA. Montants : en unités de la devise du client (pas en milliers), espaces et virgule acceptés.")],
    [t("Clients : identifiés par le code client T24 ou, à défaut, l'ICE. Entité : code de l'entité (Administration › Banques et filiales).")],
    [t("Notes : sur l'échelle 1 à 10 ou DEF1 à DEF3 ; reportez la note d'origine et le modèle d'origine pour la traçabilité (table de correspondance validée en COPIL).")],
    [t("Bilans : une ligne par poste et par exercice (code du poste du format de bilan en vigueur, liste ci-dessous).")],
    [t("Watch list : une ligne par période (entrée, sortie éventuelle) ; niveau parmi les niveaux paramétrés.")],
    [t("Rien n'est écrasé : un client, une note (même date d'arrêté), un bilan (même clôture) ou un historique de watch list déjà présents sont conservés.")],
    [t("")],
    [{ value: "Exemples", style: 1 }],
    ...(Object.keys(STOCK_COLUMNS) as StockSheet[]).flatMap((k) => [
      [{ value: STOCK_SHEETS[k], style: 1 } as WriteCell],
      STOCK_COLUMNS[k].map((c) => h(`${c.header}${c.required ? " *" : ""}`)),
      STOCK_COLUMNS[k].map((c) => t(c.example)),
    ]),
    [t("")],
    [{ value: `Postes du format de bilan ${format.version}`, style: 1 }],
    [h("Code du poste"), h("Libellé"), h("Nature")],
    ...formatPostes(format).map((p) => [t(p.key), t(p.labelFr), t(inputKeys(format).includes(p.key) ? "poste saisi" : "total (si le détail n'est pas disponible)")]),
  ];
  const sheets = [
    { name: "Lisez-moi", rows: readme, widths: [40, 28, 22, 22, 22, 22, 22, 22, 22, 22, 22], freezeRows: 0 },
    ...(Object.keys(STOCK_COLUMNS) as StockSheet[]).map((k) => ({
      name: STOCK_SHEETS[k],
      rows: [STOCK_COLUMNS[k].map((c) => h(`${c.header}${c.required ? " *" : ""}`))],
      widths: STOCK_COLUMNS[k].map((c) => Math.max(14, c.header.length + 4)),
      freezeRows: 1,
    })),
  ];
  return new Response(Buffer.from(writeWorkbook(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-reprise-du-stock.xlsx"',
    },
  });
}
