"use server";

import { revalidatePath } from "next/cache";
import { normalizeFormat, type StatementFormat } from "@/financials/statement-format";
import { auditWithin } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/rating-scale";
import { getPerimeter, getSessionIdentity } from "@/lib/session";
import {
  checkFormatVersion,
  FINANCIAL_FORMAT_KEY,
  forgetFormatVersions,
  loadFormatVersions,
  storedFormatVersions,
} from "@/lib/statement-format";

export interface FormatActionState {
  okFr?: string;
  errorFr?: string;
  warnings?: string[];
}

const GROUP_ONLY = "Réservé à un administrateur du groupe : le format du bilan s'applique à toutes les banques et filiales.";
const MAX_BYTES = 200_000;

async function save(next: StatementFormat[], identity: { name: string; role: string }, action: string, detail: unknown) {
  await prisma.$transaction(async (tx) => {
    await tx.appSetting.upsert({
      where: { key: FINANCIAL_FORMAT_KEY },
      update: { value: JSON.stringify(next), updatedBy: identity.name },
      create: { key: FINANCIAL_FORMAT_KEY, value: JSON.stringify(next), updatedBy: identity.name },
    });
    await auditWithin(tx, {
      actor: identity.name,
      actorRole: identity.role,
      action,
      resourceType: "FinancialFormat",
      resourceId: FINANCIAL_FORMAT_KEY,
      detail,
    });
  });
  forgetFormatVersions();
  revalidatePath("/admin/bilan");
  revalidatePath("/cases", "layout");
}

/**
 * Enregistre une nouvelle version du format (ou modifie une version future
 * encore sans effet). Une version en vigueur ne se modifie jamais.
 */
export async function saveFormatVersionAction(json: string, replacing?: string): Promise<FormatActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  if (Buffer.byteLength(json, "utf8") > MAX_BYTES) return { errorFr: "Format trop volumineux." };
  let candidate: StatementFormat;
  try {
    candidate = normalizeFormat(JSON.parse(json) as Partial<StatementFormat>);
  } catch {
    return { errorFr: "Format illisible." };
  }
  delete candidate.createdBy;
  delete candidate.createdAt;
  const all = await loadFormatVersions({ fresh: true });
  const { errors, warnings } = checkFormatVersion(all, candidate, today(), replacing || undefined);
  if (errors.length > 0) return { errorFr: errors.slice(0, 10).join(" "), warnings };
  try {
    const stored = (await storedFormatVersions()).filter((v) => v.version !== replacing);
    const entry: StatementFormat = { ...candidate, createdBy: session.identity.name, createdAt: new Date().toISOString() };
    await save([...stored, entry], session.identity, replacing ? "FINANCIAL_FORMAT_UPDATED" : "FINANCIAL_FORMAT_CREATED", {
      replacing: replacing ?? null,
      version: entry.version,
      effectiveFrom: entry.effectiveFrom,
    });
  } catch {
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  return {
    okFr: `Format ${candidate.version} enregistré : il s'appliquera aux bilans chargés et aux notations calculées à partir du ${candidate.effectiveFrom}. Les notations antérieures gardent leur format.`,
    warnings,
  };
}

/** Retrait d'une version future (pas encore en vigueur). */
export async function deleteFormatVersionAction(version: string): Promise<FormatActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: GROUP_ONLY };
  const stored = await storedFormatVersions();
  const target = stored.find((v) => v.version === version);
  if (!target) return { errorFr: `Version ${version} introuvable (le format embarqué ne se retire pas).` };
  if (target.effectiveFrom <= today()) return { errorFr: `La version ${version} est en vigueur ou l'a été : elle est figée.` };
  try {
    await save(stored.filter((v) => v.version !== version), session.identity, "FINANCIAL_FORMAT_DELETED", { version });
  } catch {
    return { errorFr: "Retrait impossible : la base de données ne répond pas." };
  }
  return { okFr: `Version ${version} retirée.` };
}
