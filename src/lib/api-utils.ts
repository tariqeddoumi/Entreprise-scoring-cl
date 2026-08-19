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
