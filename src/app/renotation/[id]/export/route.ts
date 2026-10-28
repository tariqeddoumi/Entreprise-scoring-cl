import { csvLine } from "@/lib/csv";
import { ITEM_STATUS_LABELS, MOVEMENT_LABELS } from "@/lib/renotation";
import { getDb, getSessionIdentity } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Export CSV d'un lot (séparateur « ; », Excel FR), depuis la session de l'interface. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity("READONLY");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const batch = await db.renotationBatch.findUnique({ where: { id }, select: { id: true, name: true, asOfDate: true } });
  if (!batch) return new Response("Lot introuvable.", { status: 404 });
  const items = await db.renotationItem.findMany({
    where: { batchId: id },
    orderBy: { id: "asc" },
    include: { counterparty: { select: { name: true, ice: true, segment: true, sectorCode: true, economicGroup: { select: { code: true } } } } },
  });
  const lines = [
    csvLine(["Contrepartie", "ICE", "Segment", "Secteur", "Groupe d'affaires", "Note avant", "Note après", "Crans", "Mouvement", "Statut", "Dossier de revue", "Motif"]),
    ...items.map((it) =>
      csvLine([
        it.counterparty.name,
        it.counterparty.ice,
        it.counterparty.segment,
        it.counterparty.sectorCode,
        it.counterparty.economicGroup?.code,
        it.previousGrade,
        it.newGrade,
        it.notchDelta,
        it.movement ? MOVEMENT_LABELS[it.movement] : "",
        ITEM_STATUS_LABELS[it.status] ?? it.status,
        it.caseId,
        it.messageFr,
      ])
    ),
  ];
  const file = `renotation-${batch.asOfDate}-${batch.id.slice(-6)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
