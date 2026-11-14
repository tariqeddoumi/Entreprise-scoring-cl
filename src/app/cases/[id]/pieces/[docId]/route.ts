import { documentResponse } from "@/lib/document-response";
import { getDb, getSessionIdentity } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Pièce d'un dossier de notation ; cloisonnée au périmètre. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await getSessionIdentity("READONLY");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  const { id, docId } = await params;
  const doc = await (await getDb()).caseDocument.findFirst({ where: { id: docId, caseId: id }, select: { fileName: true, mimeType: true, content: true } });
  if (!doc) return new Response("Pièce introuvable.", { status: 404 });
  return documentResponse(doc);
}
