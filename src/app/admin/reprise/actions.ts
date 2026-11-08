"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { formatPostes } from "@/financials/statement-format";
import { today } from "@/lib/rating-scale";
import { getDb, getPerimeter, getSessionIdentity } from "@/lib/session";
import { effectiveFormat } from "@/lib/statement-format";
import { runStockImport, type ImportReport } from "@/lib/stock-import";
import { readXlsx, XlsxError } from "@/lib/xlsx";
import { parseWorkbook } from "@/reference/stock-import";

export interface StockActionState {
  ok: boolean;
  report?: ImportReport;
  errorFr?: string;
}

/**
 * Reprise du stock : contrôle à blanc (mode « controle ») puis import (mode
 * « import ») du même classeur. Réservé à un administrateur ; les écritures
 * restent dans son périmètre.
 */
export async function stockImportAction(fd: FormData): Promise<StockActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { ok: false, errorFr: session.reasonFr };
  const file = fd.get("file");
  const mode = String(fd.get("mode") ?? "controle");
  if (!(file instanceof File) || !file.size) return { ok: false, errorFr: "Choisissez le classeur de reprise (.xlsx)." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, errorFr: "Classeur trop volumineux (20 Mo au plus) : découpez-le." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheets;
  try {
    sheets = readXlsx(bytes);
  } catch (e) {
    return { ok: false, errorFr: e instanceof XlsxError ? e.message : "Classeur Excel illisible (format .xlsx attendu)." };
  }
  const format = await effectiveFormat(today());
  const wb = parseWorkbook(sheets, { knownPostes: formatPostes(format).map((p) => p.key), today: today() });
  if (!wb.sheets.length) return { ok: false, errorFr: "Aucune feuille reconnue : Clients, Notes, Bilans ou Watch list (voir le modèle)." };
  try {
    const report = await runStockImport(await getDb(), await getPerimeter(), session.identity, wb, {
      dryRun: mode !== "import",
      fileName: file.name.slice(0, 200),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (mode === "import") {
      revalidatePath("/counterparties");
      revalidatePath("/surveillance");
    }
    return { ok: true, report };
  } catch (e) {
    console.error("[reprise]", e instanceof Error ? e.message : e);
    return { ok: false, errorFr: "Import interrompu (base indisponible ou conflit) : rien n'a été écrit. Relancez le contrôle." };
  }
}
