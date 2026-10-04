import { NextResponse } from "next/server";

/**
 * Modèle d'erreur RFC 9457 (application/problem+json).
 * Jamais de stack trace ni de détail interne dans la réponse.
 */
export function problem(
  status: number,
  title: string,
  detail?: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      type: "about:blank",
      title,
      status,
      ...(detail ? { detail } : {}),
      ...extra,
    },
    {
      status,
      headers: { "Content-Type": "application/problem+json" },
    }
  );
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as unknown as Record<string, unknown>, { status });
}

/**
 * Colonnes décimales d'un run exposées en nombres (D-43).
 *
 * Prisma restitue une colonne DECIMAL sous forme d'objet Decimal, que la
 * sérialisation JSON transforme en chaîne (« 87.3125 »). Le même score
 * apparaissait donc en chaîne dans la ligne du run et en nombre dans son
 * instantané, au sein d'une même réponse — et en nombre dans le contrat
 * OpenAPI comme dans les webhooks. La précision de la colonne (4 décimales)
 * est conservée ; l'instantané reste la référence à pleine précision.
 */
export function runScoresAsNumbers<T extends object>(run: T): T {
  const out = { ...run } as Record<string, unknown>;
  for (const key of ["rawScore", "confidenceScore"]) {
    const v = out[key];
    if (v !== null && v !== undefined) out[key] = Number(v);
  }
  return out as T;
}

/** Sérialisation JSON déterministe (clés triées) pour snapshots et signatures. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)])
    );
  }
  return value;
}
