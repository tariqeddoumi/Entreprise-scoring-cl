"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditWithin } from "@/lib/audit";
import { BASE_CURRENCY } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface FxActionState {
  okFr?: string;
  errorFr?: string;
}

const rateSchema = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Devise : code ISO à trois lettres")
    .refine((c) => c !== BASE_CURRENCY, `La devise de base (${BASE_CURRENCY}) vaut 1 par construction.`),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ"),
  rate: z.number().positive("Le cours doit être positif").max(1_000_000),
  source: z.string().max(120).optional(),
});

/**
 * Saisie d'un cours de change. Réservée à un administrateur du groupe : un cours
 * s'applique à toutes les filiales. Un cours publié ne se modifie pas — il a pu
 * servir à une notation — ; une correction se saisit à une date ultérieure.
 */
export async function fxAction(_prev: FxActionState | undefined, formData: FormData): Promise<FxActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };

  const parsed = rateSchema.safeParse({
    currency: String(formData.get("currency") ?? "").trim().toUpperCase(),
    effectiveDate: String(formData.get("effectiveDate") ?? ""),
    rate: Number(String(formData.get("rate") ?? "").replace(",", ".")),
    source: String(formData.get("source") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { errorFr: parsed.error.issues.map((i) => i.message).join(" ; ") };
  const v = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.exchangeRate.create({
        data: { ...v, createdBy: session.identity.name },
      });
      await auditWithin(tx, {
        actor: session.identity.name,
        actorRole: session.identity.role,
        action: "FX_RATE_CREATED",
        resourceType: "ExchangeRate",
        resourceId: row.id,
        detail: v,
      });
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { errorFr: `Un cours ${v.currency} existe déjà au ${v.effectiveDate} : saisissez la correction à une date ultérieure.` };
    }
    return { errorFr: "Enregistrement impossible : la base de données ne répond pas." };
  }
  revalidatePath("/admin/currencies");
  return { okFr: `Cours ${v.currency} au ${v.effectiveDate} enregistré : 1 ${v.currency} = ${v.rate} ${BASE_CURRENCY}.` };
}
