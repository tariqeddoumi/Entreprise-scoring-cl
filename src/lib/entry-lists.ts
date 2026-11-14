import type { PrismaClient } from "@/generated/prisma";
import { ENTRY_LIST_DEFAULTS, ENTRY_LIST_KEYS, parseEntryLists, type EntryLists } from "@/reference/entry-lists";

/** Listes de saisie paramétrées (une seule lecture des cinq listes). */
export async function loadEntryLists(db: PrismaClient): Promise<EntryLists> {
  try {
    const rows = await db.appSetting.findMany({ where: { key: { in: [...ENTRY_LIST_KEYS] } }, select: { key: true, value: true } });
    return parseEntryLists(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch {
    return parseEntryLists({});
  }
}

export const DEFAULT_ENTRY_LISTS: EntryLists = parseEntryLists({});
export { ENTRY_LIST_DEFAULTS };
