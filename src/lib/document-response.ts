/**
 * Réponse de téléchargement d'une pièce conservée (client ou dossier). La
 * pièce est servie en pièce jointe, avec un type neutralisé pour tout ce qui
 * n'est pas un PDF, une image ou un tableur : un fichier déposé ne s'exécute
 * jamais dans le navigateur.
 */
const SAFE_INLINE = new Set(["application/pdf", "image/png", "image/jpeg"]);

export function documentResponse(doc: { fileName: string; mimeType: string; content: Uint8Array | Buffer }): Response {
  const type = SAFE_INLINE.has(doc.mimeType) ? doc.mimeType : "application/octet-stream";
  const name = doc.fileName.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "content-type": type,
      "content-disposition": `${SAFE_INLINE.has(type) ? "inline" : "attachment"}; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, no-store",
    },
  });
}
