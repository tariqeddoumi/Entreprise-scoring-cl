/**
 * Consultation du journal d'audit (Administration › Journal d'audit).
 * Lecture seule : le journal est en ajout seul. Le client cloisonné limite
 * un administrateur d'entité aux événements de son périmètre.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma";
import { AUDIT_ACTION_LABELS, AUDIT_RESOURCE_LABELS } from "./audit-labels";

export interface JournalFilters {
  resourceType: string;
  action: string;
  actor: string;
  from: string;
  to: string;
  page: number;
}

export const JOURNAL_PAGE_SIZE = 100;
export const JOURNAL_EXPORT_MAX = 10_000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseJournalFilters(sp: Record<string, string | string[] | undefined>): JournalFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v ?? "").trim().slice(0, 80);
  };
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one("page"), 10) || 1));
  return {
    resourceType: /^[A-Za-z]+$/.test(one("type")) ? one("type") : "",
    action: /^[A-Z0-9_]+$/.test(one("action")) ? one("action") : "",
    actor: one("acteur"),
    from: DATE.test(one("du")) ? one("du") : "",
    to: DATE.test(one("au")) ? one("au") : "",
    page,
  };
}

export function journalWhere(f: JournalFilters): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};
  if (f.resourceType) where.resourceType = f.resourceType;
  if (f.action) where.action = f.action;
  if (f.actor) where.actor = { contains: f.actor, mode: "insensitive" };
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
      ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}),
    };
  }
  return where;
}

export function journalQuery(f: JournalFilters): string {
  const q = new URLSearchParams();
  if (f.resourceType) q.set("type", f.resourceType);
  if (f.action) q.set("action", f.action);
  if (f.actor) q.set("acteur", f.actor);
  if (f.from) q.set("du", f.from);
  if (f.to) q.set("au", f.to);
  return q.toString();
}

/** Résumé lisible du détail JSON : valeurs simples, tronqué. */
export function summarizeDetail(detail: string | null, max = 240): string {
  if (!detail) return "";
  let d: unknown;
  try {
    d = JSON.parse(detail);
  } catch {
    return detail.slice(0, max);
  }
  const fmt = (v: unknown): string =>
    v === null || v === undefined ? "—" : typeof v === "object" ? (Array.isArray(v) ? `${v.length} élément(s)` : "{…}") : String(v);
  const text = Array.isArray(d)
    ? d.map((x) => (x && typeof x === "object" && "key" in x ? `${(x as { key: string }).key} : ${fmt((x as { before?: unknown }).before)} → ${fmt((x as { after?: unknown }).after)}` : fmt(x))).join(" · ")
    : d && typeof d === "object"
      ? Object.entries(d as Record<string, unknown>)
          .map(([k, v]) => `${k} : ${fmt(v)}`)
          .join(" · ")
      : fmt(d);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function loadJournal(db: PrismaClient, f: JournalFilters) {
  const where = journalWhere(f);
  // Listes des filtres : le catalogue des libellés, pas un parcours de toute
  // la table (coûteux au-delà de quelques centaines de milliers d'événements).
  const actions = [...new Set([...Object.keys(AUDIT_ACTION_LABELS), ...(f.action ? [f.action] : [])])].sort();
  const types = [...new Set([...Object.keys(AUDIT_RESOURCE_LABELS), ...(f.resourceType ? [f.resourceType] : [])])].sort();
  const [total, rows] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * JOURNAL_PAGE_SIZE,
      take: JOURNAL_PAGE_SIZE,
      select: { id: true, createdAt: true, actor: true, actorRole: true, action: true, resourceType: true, resourceId: true, detail: true },
    }),
  ]);
  return { total, rows, actions, types };
}
