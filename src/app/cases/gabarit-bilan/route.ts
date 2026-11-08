import { buildTemplate } from "@/financials/excel-template";
import { getSessionIdentity } from "@/lib/session";
import { today } from "@/lib/rating-scale";
import { effectiveFormat } from "@/lib/statement-format";
import { XLSX_MIME } from "@/lib/xlsx";

/** Gabarit Excel vierge de saisie du bilan (aucune donnée de client). */
export async function GET() {
  const session = await getSessionIdentity("READONLY");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  return new Response(Buffer.from(buildTemplate(await effectiveFormat(today()))), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": 'attachment; filename="gabarit-bilan-cgnc.xlsx"',
    },
  });
}
