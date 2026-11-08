import { AUDIT_RESOURCE_LABELS, auditLabel } from "@/lib/audit-labels";
import { JOURNAL_EXPORT_MAX, journalWhere, parseJournalFilters } from "@/lib/audit-journal";
import { today } from "@/lib/rating-scale";
import { getDb, getSessionIdentity } from "@/lib/session";
import { writeXlsx, XLSX_MIME, type WriteCell } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** Export du journal d'audit filtré (Excel). L'export lui-même n'est pas une écriture du journal métier. */
export async function GET(req: Request) {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  const f = parseJournalFilters(Object.fromEntries(new URL(req.url).searchParams));
  const db = await getDb();
  const rows = await db.auditEvent.findMany({
    where: journalWhere(f),
    orderBy: { createdAt: "desc" },
    take: JOURNAL_EXPORT_MAX,
    select: { createdAt: true, actor: true, actorRole: true, action: true, resourceType: true, resourceId: true, entityId: true, detail: true },
  });
  const h = (v: string): WriteCell => ({ value: v, style: 3 });
  const sheet: WriteCell[][] = [
    ["Date (UTC)", "Acteur", "Profil", "Code action", "Action", "Objet", "Identifiant", "Entité", "Détail (JSON)"].map(h),
    ...rows.map((e) =>
      [e.createdAt.toISOString(), e.actor, e.actorRole ?? "", e.action, auditLabel(e.action), AUDIT_RESOURCE_LABELS[e.resourceType] ?? e.resourceType, e.resourceId, e.entityId ?? "", (e.detail ?? "").slice(0, 30_000)].map(
        (v): WriteCell => ({ value: v })
      )
    ),
  ];
  return new Response(Buffer.from(writeXlsx("Journal", sheet, [20, 18, 14, 26, 32, 18, 28, 26, 80])), {
    headers: { "content-type": XLSX_MIME, "content-disposition": `attachment; filename="journal-audit-${today()}.xlsx"` },
  });
}
