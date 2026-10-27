import type { PrismaClient } from "@/generated/prisma";
import { rulesetForDate } from "@/reference/segmentation";

/**
 * Multi-devise.
 *
 * Le groupe consolide dans une devise de base, le dirham (MAD) : c'est la devise
 * des seuils de segmentation et du seuil de délégation. Une banque ou une
 * filiale saisit ses montants dans sa propre devise (XOF, XAF, GNF, EUR…) ; ils
 * sont convertis au cours en vigueur à la date d'arrêté, et la conversion —
 * montant d'origine, devise, cours et date du cours — est consignée dans le
 * dossier pour que la notation reste rejouable.
 *
 * Un cours manquant n'est jamais deviné : le dossier ne peut pas être soumis
 * tant que l'administrateur n'a pas saisi le cours.
 */

export const BASE_CURRENCY = "MAD";

/** Devises usuelles du groupe, proposées en premier dans les écrans. */
export const COMMON_CURRENCIES = ["MAD", "EUR", "USD", "XOF", "XAF", "GNF", "MUR"] as const;

export class FxError extends Error {}

export interface FxConversion {
  currency: string;
  baseCurrency: string;
  rate: number;
  rateDate: string;
  amounts: Record<string, { original: number; base: number }>;
}

/** Cours applicable à une date : le dernier cours publié à cette date ou avant. */
export async function rateOn(
  db: Pick<PrismaClient, "exchangeRate">,
  currency: string,
  date: string
): Promise<{ rate: number; rateDate: string } | null> {
  if (currency === BASE_CURRENCY) return { rate: 1, rateDate: date };
  const row = await db.exchangeRate.findFirst({
    where: { currency, effectiveDate: { lte: date } },
    orderBy: { effectiveDate: "desc" },
  });
  return row ? { rate: Number(row.rate), rateDate: row.effectiveDate } : null;
}

/**
 * Convertit des montants exprimés dans `currency` vers la devise de base.
 * Lève FxError si aucun cours n'est disponible à la date d'arrêté.
 */
export async function convertToBase(
  db: Pick<PrismaClient, "exchangeRate">,
  currency: string,
  date: string,
  amounts: Record<string, number | undefined>
): Promise<FxConversion> {
  const ruleset = rulesetForDate(date);
  if (ruleset.currency !== BASE_CURRENCY) {
    throw new FxError(
      `Le jeu de segmentation ${ruleset.rulesetId} est exprimé en ${ruleset.currency}, pas dans la devise de base ${BASE_CURRENCY}.`
    );
  }
  const found = await rateOn(db, currency, date);
  if (!found) {
    throw new FxError(
      `Aucun cours ${currency}/${BASE_CURRENCY} publié au ${date} ou avant : un administrateur doit le saisir (Paramétrage › Devises) avant la soumission.`
    );
  }
  const out: FxConversion["amounts"] = {};
  for (const [k, v] of Object.entries(amounts)) {
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    out[k] = { original: v, base: Math.round(v * found.rate * 100) / 100 };
  }
  return { currency, baseCurrency: BASE_CURRENCY, rate: found.rate, rateDate: found.rateDate, amounts: out };
}

/** Montant lisible, séparateur d'espace : « 95 000 000 MAD ». */
export function formatAmount(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const s = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value).replace(/ | /g, " ");
  return `${s} ${currency}`;
}
