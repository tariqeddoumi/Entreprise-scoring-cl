import { buildTemplate } from "@/financials/excel-template";
import { getSessionIdentity } from "@/lib/session";
import { XLSX_MIME } from "@/lib/xlsx";

/** Gabarit Excel vierge de saisie du bilan (aucune donnée de client). */
export async function GET() {
  const session = await getSessionIdentity("READONLY");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  return new Response(Buffer.from(buildTemplate()), {
    headers: {
      "content-type": XLSX_MIME,
      "content-disposition": 'attachment; filename="gabarit-bilan-cgnc.xlsx"',
    },
  });
}
