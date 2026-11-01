import type { FinancialBasis, FinancialControl, FinancialGridRatio } from "@/core/types";
import {
  computeYear,
  FINANCIAL_CHART_VERSION,
  INPUT_POSTES,
  parseAmount,
  POSTES,
  SIMPLIFIED_MODEL_MAX_TURNOVER_MAD,
  type StatementModel,
  type YearValues,
} from "./chart";

/**
 * Calcul des indicateurs financiers et des ratios de la grille — DÉTERMINISTE.
 *
 * L'IA ou l'OCR lisent les postes ; les ratios sont toujours calculés ici, par
 * formule, à partir du gabarit CGNC (src/financials/chart.ts) et des
 * définitions du dictionnaire comptable (src/reference/cgnc.ts). L'analyste ne
 * corrige que les ratios qui servent à la grille, avec un motif obligatoire ;
 * la valeur calculée et la valeur retenue sont conservées toutes les deux.
 *
 * Module PUR : partagé par l'écran (aperçu immédiat) et le serveur (soumission).
 */

// --- Saisie ---------------------------------------------------------------------

export interface FinancialYearDraft {
  /** Libellé de l'exercice, ex. « 2025 ». */
  fiscalYear: string;
  /** Date de clôture AAAA-MM-JJ. */
  closingDate: string;
  /** Montants tels que saisis ou lus (unités de la devise de la contrepartie). */
  values: Record<string, string>;
  /** Origine de chaque valeur lue par l'IA : passage du document et confiance. */
  lineage?: Record<string, { source: string; confidence: number }>;
}

export interface FinancialsDraft {
  statementModel: StatementModel | "";
  certified: boolean;
  source: "" | "SAISIE" | "EXCEL" | "IA";
  document: { id: string; name: string; sha256: string } | null;
  /** [N, N−1, N−2]. */
  years: FinancialYearDraft[];
  /** Corrections des ratios de la grille : code critère → valeur et motif. */
  overrides: Record<string, { value: string; reason: string }>;
}

export const MAX_FISCAL_YEARS = 3;
/** Exercices exigés (N et N−1) ; N−2 est facultatif. */
export const REQUIRED_FISCAL_YEARS = 2;
/** Au-delà, les comptes sont périmés pour la notation (même règle que l'IA). */
export const STALE_AFTER_MONTHS = 18;

export function emptyYear(): FinancialYearDraft {
  return { fiscalYear: "", closingDate: "", values: {} };
}

export function emptyFinancials(): FinancialsDraft {
  return {
    statementModel: "",
    certified: false,
    source: "",
    document: null,
    years: [emptyYear(), emptyYear()],
    overrides: {},
  };
}

export function parseFinancials(raw: unknown): FinancialsDraft {
  const base = emptyFinancials();
  if (!raw || typeof raw !== "object") return base;
  const f = raw as Partial<FinancialsDraft>;
  const years = Array.isArray(f.years)
    ? f.years.slice(0, MAX_FISCAL_YEARS).map((y) => ({
        fiscalYear: String(y?.fiscalYear ?? ""),
        closingDate: String(y?.closingDate ?? ""),
        values: y?.values && typeof y.values === "object" ? { ...y.values } : {},
        ...(y?.lineage ? { lineage: y.lineage } : {}),
      }))
    : base.years;
  while (years.length < REQUIRED_FISCAL_YEARS) years.push(emptyYear());
  return {
    statementModel: f.statementModel === "NORMAL" || f.statementModel === "SIMPLIFIE" ? f.statementModel : "",
    certified: !!f.certified,
    source: f.source === "SAISIE" || f.source === "EXCEL" || f.source === "IA" ? f.source : "",
    document: f.document && typeof f.document === "object" ? f.document : null,
    years,
    overrides: f.overrides && typeof f.overrides === "object" ? { ...f.overrides } : {},
  };
}

/** Un exercice est renseigné dès qu'un poste porte un montant. */
export function yearHasData(y: FinancialYearDraft | undefined): boolean {
  return !!y && INPUT_POSTES.some((p) => parseAmount(y.values[p.key]) !== undefined);
}

export function hasFinancials(f: FinancialsDraft | undefined): boolean {
  return !!f && yearHasData(f.years[0]);
}

// --- Indicateurs ------------------------------------------------------------------

export type IndicatorUnit = "MAD" | "%" | "x" | "j";
export type IndicatorGroup = "AGREGATS" | "STRUCTURE" | "RENTABILITE" | "LIQUIDITE" | "ACTIVITE" | "REMBOURSEMENT";

export const INDICATOR_GROUP_LABELS: Record<IndicatorGroup, string> = {
  AGREGATS: "Agrégats",
  STRUCTURE: "Structure financière et endettement",
  RENTABILITE: "Activité et rentabilité",
  LIQUIDITE: "Liquidité",
  ACTIVITE: "Cycle d'exploitation",
  REMBOURSEMENT: "Capacité de remboursement",
};

interface Outcome {
  value: number | null;
  noteFr?: string;
  /** EBITDA retraité nul ou négatif : ratio non calculable, cas défavorable. */
  nonPositiveEbitda?: boolean;
}

interface Ctx {
  years: YearValues[];
  present: boolean[];
}

export interface IndicatorDef {
  key: string;
  labelFr: string;
  unit: IndicatorUnit;
  group: IndicatorGroup;
  formulaFr: string;
  /** Calculé pour l'exercice N seulement (moyenne pluriannuelle, données complémentaires). */
  onlyN?: boolean;
  compute: (ctx: Ctx, i: number) => Outcome;
}

const v = (y: YearValues | undefined, k: string): number => y?.[k] ?? 0;
const has = (y: YearValues | undefined, k: string): boolean => y?.[k] !== undefined;
const ratio = (num: number, den: number, scale = 1): number | null =>
  den === 0 ? null : (num / den) * scale;
const missing = (labels: string[]): Outcome => ({
  value: null,
  noteFr: `Non calculable : ${labels.join(", ")} à renseigner.`,
});

/** EBE CGNC (excédent brut d'exploitation), hors retraitements. */
function ebe(y: YearValues): number {
  return (
    v(y, "CHIFFRE_AFFAIRES") +
    v(y, "VARIATION_STOCKS_PRODUITS") +
    v(y, "IMMOBILISATIONS_PRODUITES") +
    v(y, "SUBVENTIONS_EXPLOITATION") -
    v(y, "ACHATS_REVENDUS") -
    v(y, "ACHATS_CONSOMMES") -
    v(y, "AUTRES_CHARGES_EXTERNES") -
    v(y, "IMPOTS_TAXES") -
    v(y, "CHARGES_PERSONNEL")
  );
}
/** EBE retraité (équivalent EBITDA) : redevances de crédit-bail réintégrées (exercice N). */
function ebeRetraite(ctx: Ctx, i: number): number {
  const y = ctx.years[i];
  return ebe(y) + (i === 0 ? v(y, "REDEVANCES_CREDIT_BAIL") : 0);
}
function detteBrute(ctx: Ctx, i: number): number {
  const y = ctx.years[i];
  const n = i === 0 ? v(y, "ENCOURS_CREDIT_BAIL") + v(y, "CCA_A_VUE") : 0;
  return v(y, "DETTES_FINANCEMENT") + v(y, "TRESORERIE_PASSIF") + n;
}
function tresorerieLibre(y: YearValues): number {
  return v(y, "TRESORERIE_ACTIF") + v(y, "TITRES_PLACEMENT");
}
function bfr(y: YearValues): number {
  return v(y, "STOCKS") + v(y, "CREANCES_CLIENTS") + v(y, "AUTRES_CREANCES") - v(y, "FOURNISSEURS") - v(y, "AUTRES_DETTES_CIRCULANTES");
}
function fpt(ctx: Ctx, i: number): number {
  const y = ctx.years[i];
  return (
    v(y, "CAPITAUX_PROPRES") +
    (i === 0 ? v(y, "CCA_BLOQUES") : 0) -
    v(y, "IMMO_NON_VALEURS") -
    v(y, "IMMO_INCORPORELLES") -
    v(y, "ECARTS_REEVALUATION") -
    v(y, "CREANCES_ASSOCIES")
  );
}
function totalAjuste(y: YearValues): number {
  return v(y, "TOTAL_ACTIF") - v(y, "IMMO_NON_VALEURS") - v(y, "IMMO_INCORPORELLES") - v(y, "ECARTS_REEVALUATION") - v(y, "CREANCES_ASSOCIES");
}
/** Flux de trésorerie d'exploitation : EBE retraité − impôt sur les résultats − variation du BFR. */
function cfo(ctx: Ctx, i: number): number | null {
  if (!ctx.present[i] || !ctx.present[i + 1]) return null;
  return ebeRetraite(ctx, i) - v(ctx.years[i], "IMPOTS_RESULTATS") - (bfr(ctx.years[i]) - bfr(ctx.years[i + 1]));
}
function capex(ctx: Ctx, i: number): { value: number | null; estimated: boolean } {
  const y = ctx.years[i];
  if (has(y, "ACQUISITIONS_IMMOBILISATIONS")) return { value: v(y, "ACQUISITIONS_IMMOBILISATIONS"), estimated: false };
  if (!ctx.present[i + 1]) return { value: null, estimated: true };
  const p = ctx.years[i + 1];
  const immo = (x: YearValues) => v(x, "IMMO_NON_VALEURS") + v(x, "IMMO_INCORPORELLES") + v(x, "IMMO_CORPORELLES");
  return { value: Math.max(0, immo(y) - immo(p) + v(y, "DOTATIONS_EXPLOITATION")), estimated: true };
}
function serviceDette(ctx: Ctx): { value: number | null; noteFr?: string } {
  const y = ctx.years[0];
  const interests = v(y, "CHARGES_INTERETS");
  const lease = v(y, "REDEVANCES_CREDIT_BAIL");
  if (has(y, "SERVICE_DETTE_PRINCIPAL_12M")) {
    return { value: interests + lease + v(y, "SERVICE_DETTE_PRINCIPAL_12M") };
  }
  if (has(y, "REMBOURSEMENTS_DETTES_FIN")) {
    return {
      value: interests + lease + v(y, "REMBOURSEMENTS_DETTES_FIN"),
      noteFr: "Principal pris dans le tableau de financement (remboursements de l'exercice écoulé) : à remplacer par l'échéancier à 12 mois s'il diffère.",
    };
  }
  return { value: null, noteFr: "Non calculable : principal exigible à 12 mois (échéancier) à renseigner." };
}

export const INDICATORS: IndicatorDef[] = [
  // Agrégats
  { key: "CA", labelFr: "Chiffre d'affaires", unit: "MAD", group: "AGREGATS", formulaFr: "Ventes de marchandises + ventes de biens et services produits.", compute: (c, i) => (has(c.years[i], "CHIFFRE_AFFAIRES") ? { value: v(c.years[i], "CHIFFRE_AFFAIRES") } : missing(["chiffre d'affaires"])) },
  { key: "TOTAL_BILAN", labelFr: "Total bilan", unit: "MAD", group: "AGREGATS", formulaFr: "Total de l'actif (immobilisé + circulant + trésorerie).", compute: (c, i) => (has(c.years[i], "TOTAL_ACTIF") ? { value: v(c.years[i], "TOTAL_ACTIF") } : missing(["postes de l'actif"])) },
  { key: "EBE", labelFr: "Excédent brut d'exploitation (EBE)", unit: "MAD", group: "AGREGATS", formulaFr: "CA + variation de stocks de produits + production immobilisée + subventions d'exploitation − achats revendus − achats consommés − autres charges externes − impôts et taxes − charges de personnel.", compute: (c, i) => (has(c.years[i], "CHIFFRE_AFFAIRES") ? { value: ebe(c.years[i]) } : missing(["chiffre d'affaires"])) },
  { key: "EBE_RETRAITE", labelFr: "EBE retraité (équivalent EBITDA)", unit: "MAD", group: "AGREGATS", formulaFr: "EBE + redevances de crédit-bail réintégrées (exercice N).", compute: (c, i) => (has(c.years[i], "CHIFFRE_AFFAIRES") ? { value: ebeRetraite(c, i) } : missing(["chiffre d'affaires"])) },
  { key: "RESULTAT_NET", labelFr: "Résultat net", unit: "MAD", group: "AGREGATS", formulaFr: "Résultat d'exploitation + résultat financier + résultat non courant − impôts sur les résultats.", compute: (c, i) => (has(c.years[i], "RESULTAT_NET") ? { value: v(c.years[i], "RESULTAT_NET") } : missing(["CPC"])) },
  { key: "CAF", labelFr: "Capacité d'autofinancement (simplifiée)", unit: "MAD", group: "AGREGATS", formulaFr: "Résultat net + dotations d'exploitation − reprises d'exploitation.", compute: (c, i) => (has(c.years[i], "RESULTAT_NET") ? { value: v(c.years[i], "RESULTAT_NET") + v(c.years[i], "DOTATIONS_EXPLOITATION") - v(c.years[i], "REPRISES_EXPLOITATION") } : missing(["CPC"])) },
  { key: "FRNG", labelFr: "Fonds de roulement", unit: "MAD", group: "AGREGATS", formulaFr: "Financement permanent − actif immobilisé.", compute: (c, i) => (has(c.years[i], "FINANCEMENT_PERMANENT") ? { value: v(c.years[i], "FINANCEMENT_PERMANENT") - v(c.years[i], "TOTAL_ACTIF_IMMOBILISE") } : missing(["passif"])) },
  { key: "BFR", labelFr: "Besoin en fonds de roulement", unit: "MAD", group: "AGREGATS", formulaFr: "Stocks + clients + autres créances − fournisseurs − autres dettes circulantes.", compute: (c, i) => (c.present[i] ? { value: bfr(c.years[i]) } : missing(["bilan"])) },
  { key: "TRESORERIE_NETTE", labelFr: "Trésorerie nette", unit: "MAD", group: "AGREGATS", formulaFr: "Trésorerie actif − trésorerie passif.", compute: (c, i) => (c.present[i] ? { value: v(c.years[i], "TRESORERIE_ACTIF") - v(c.years[i], "TRESORERIE_PASSIF") } : missing(["bilan"])) },
  { key: "DETTE_BRUTE", labelFr: "Dette financière brute économique", unit: "MAD", group: "AGREGATS", formulaFr: "Dettes de financement + trésorerie passif + encours de crédit-bail + comptes courants d'associés à vue (exercice N).", compute: (c, i) => (c.present[i] ? { value: detteBrute(c, i) } : missing(["bilan"])) },
  { key: "DETTE_NETTE", labelFr: "Dette financière nette", unit: "MAD", group: "AGREGATS", formulaFr: "Dette brute économique − trésorerie actif − titres et valeurs de placement.", compute: (c, i) => (c.present[i] ? { value: detteBrute(c, i) - tresorerieLibre(c.years[i]) } : missing(["bilan"])) },
  { key: "FPT", labelFr: "Fonds propres tangibles", unit: "MAD", group: "AGREGATS", formulaFr: "Capitaux propres + comptes courants bloqués (catégorie 3) − non-valeurs − incorporels − écarts de réévaluation − comptes d'associés débiteurs.", compute: (c, i) => (has(c.years[i], "CAPITAUX_PROPRES") ? { value: fpt(c, i) } : missing(["capitaux propres"])) },

  // Structure
  { key: "AUTONOMIE_FINANCIERE", labelFr: "Autonomie financière", unit: "%", group: "STRUCTURE", formulaFr: "Capitaux propres / total bilan.", compute: (c, i) => (has(c.years[i], "CAPITAUX_PROPRES") && v(c.years[i], "TOTAL_ACTIF") ? { value: ratio(v(c.years[i], "CAPITAUX_PROPRES"), v(c.years[i], "TOTAL_ACTIF"), 100) } : missing(["capitaux propres", "total bilan"])) },
  { key: "FPT_TOTAL_BILAN", labelFr: "Fonds propres tangibles / total bilan ajusté", unit: "%", group: "STRUCTURE", formulaFr: "Fonds propres tangibles / (total actif − non-valeurs − incorporels − écarts de réévaluation − comptes d'associés débiteurs).", compute: (c, i) => (has(c.years[i], "CAPITAUX_PROPRES") && totalAjuste(c.years[i]) > 0 ? { value: ratio(fpt(c, i), totalAjuste(c.years[i]), 100) } : missing(["capitaux propres", "total bilan"])) },
  { key: "GEARING", labelFr: "Endettement / capitaux propres (gearing)", unit: "x", group: "STRUCTURE", formulaFr: "Dette brute économique / capitaux propres.", compute: (c, i) => { const cp = v(c.years[i], "CAPITAUX_PROPRES"); if (!has(c.years[i], "CAPITAUX_PROPRES")) return missing(["capitaux propres"]); return cp <= 0 ? { value: null, noteFr: "Capitaux propres nuls ou négatifs : ratio non significatif." } : { value: ratio(detteBrute(c, i), cp) }; } },
  { key: "DETTE_NETTE_EBE", labelFr: "Dette nette / EBE retraité", unit: "x", group: "STRUCTURE", formulaFr: "Dette financière nette économique / EBE retraité.", compute: (c, i) => { if (!has(c.years[i], "CHIFFRE_AFFAIRES")) return missing(["CPC"]); const e = ebeRetraite(c, i); return e <= 0 ? { value: null, nonPositiveEbitda: true, noteFr: "EBE retraité nul ou négatif : levier non calculable, cas défavorable." } : { value: ratio(detteBrute(c, i) - tresorerieLibre(c.years[i]), e) }; } },

  // Rentabilité
  { key: "CROISSANCE_CA", labelFr: "Croissance du chiffre d'affaires", unit: "%", group: "RENTABILITE", formulaFr: "CA de l'exercice / CA de l'exercice précédent − 1.", compute: (c, i) => { const p = c.years[i + 1]; if (!has(c.years[i], "CHIFFRE_AFFAIRES") || !has(p, "CHIFFRE_AFFAIRES") || !v(p, "CHIFFRE_AFFAIRES")) return missing(["CA de l'exercice précédent"]); return { value: (v(c.years[i], "CHIFFRE_AFFAIRES") / v(p, "CHIFFRE_AFFAIRES") - 1) * 100 }; } },
  { key: "MARGE_EBE", labelFr: "Marge d'EBE", unit: "%", group: "RENTABILITE", formulaFr: "EBE / chiffre d'affaires.", compute: (c, i) => (v(c.years[i], "CHIFFRE_AFFAIRES") ? { value: ratio(ebe(c.years[i]), v(c.years[i], "CHIFFRE_AFFAIRES"), 100) } : missing(["chiffre d'affaires"])) },
  { key: "MARGE_NETTE", labelFr: "Marge nette", unit: "%", group: "RENTABILITE", formulaFr: "Résultat net / chiffre d'affaires.", compute: (c, i) => (v(c.years[i], "CHIFFRE_AFFAIRES") && has(c.years[i], "RESULTAT_NET") ? { value: ratio(v(c.years[i], "RESULTAT_NET"), v(c.years[i], "CHIFFRE_AFFAIRES"), 100) } : missing(["chiffre d'affaires"])) },
  { key: "ROA", labelFr: "Rentabilité de l'actif (ROA)", unit: "%", group: "RENTABILITE", formulaFr: "Résultat net / total bilan.", compute: (c, i) => (v(c.years[i], "TOTAL_ACTIF") && has(c.years[i], "RESULTAT_NET") ? { value: ratio(v(c.years[i], "RESULTAT_NET"), v(c.years[i], "TOTAL_ACTIF"), 100) } : missing(["total bilan", "résultat net"])) },
  { key: "ROE", labelFr: "Rentabilité des capitaux propres (ROE)", unit: "%", group: "RENTABILITE", formulaFr: "Résultat net / capitaux propres.", compute: (c, i) => { const cp = v(c.years[i], "CAPITAUX_PROPRES"); if (!has(c.years[i], "RESULTAT_NET") || !has(c.years[i], "CAPITAUX_PROPRES")) return missing(["capitaux propres", "résultat net"]); return cp <= 0 ? { value: null, noteFr: "Capitaux propres nuls ou négatifs : ratio non significatif." } : { value: ratio(v(c.years[i], "RESULTAT_NET"), cp, 100) }; } },

  // Liquidité
  { key: "LIQUIDITE_GENERALE", labelFr: "Liquidité générale", unit: "x", group: "LIQUIDITE", formulaFr: "(Actif circulant + trésorerie actif) / (passif circulant + trésorerie passif).", compute: (c, i) => { const y = c.years[i]; const den = v(y, "TOTAL_PASSIF_CIRCULANT") + v(y, "TRESORERIE_PASSIF"); if (!c.present[i]) return missing(["bilan"]); return den === 0 ? { value: null, noteFr: "Aucune dette à court terme : ratio non significatif." } : { value: ratio(v(y, "TOTAL_ACTIF_CIRCULANT") + v(y, "TRESORERIE_ACTIF"), den) }; } },
  { key: "LIQUIDITE_REDUITE", labelFr: "Liquidité réduite (hors stocks)", unit: "x", group: "LIQUIDITE", formulaFr: "(Actif circulant − stocks + trésorerie actif) / (passif circulant + trésorerie passif).", compute: (c, i) => { const y = c.years[i]; const den = v(y, "TOTAL_PASSIF_CIRCULANT") + v(y, "TRESORERIE_PASSIF"); if (!c.present[i]) return missing(["bilan"]); return den === 0 ? { value: null, noteFr: "Aucune dette à court terme : ratio non significatif." } : { value: ratio(v(y, "TOTAL_ACTIF_CIRCULANT") - v(y, "STOCKS") + v(y, "TRESORERIE_ACTIF"), den) }; } },

  // Cycle d'exploitation
  { key: "DSO", labelFr: "Délai clients", unit: "j", group: "ACTIVITE", formulaFr: "Clients / chiffre d'affaires × 365 (créances TTC rapportées au CA HT : convention de la banque).", compute: (c, i) => (v(c.years[i], "CHIFFRE_AFFAIRES") && has(c.years[i], "CREANCES_CLIENTS") ? { value: ratio(v(c.years[i], "CREANCES_CLIENTS"), v(c.years[i], "CHIFFRE_AFFAIRES"), 365) } : missing(["clients", "chiffre d'affaires"])) },
  { key: "DPO", labelFr: "Délai fournisseurs", unit: "j", group: "ACTIVITE", formulaFr: "Fournisseurs / (achats revendus + achats consommés + autres charges externes) × 365.", compute: (c, i) => { const y = c.years[i]; const achats = v(y, "ACHATS_REVENDUS") + v(y, "ACHATS_CONSOMMES") + v(y, "AUTRES_CHARGES_EXTERNES"); return achats && has(y, "FOURNISSEURS") ? { value: ratio(v(y, "FOURNISSEURS"), achats, 365) } : missing(["fournisseurs", "achats"]); } },
  { key: "DIO", labelFr: "Rotation des stocks", unit: "j", group: "ACTIVITE", formulaFr: "Stocks / (achats revendus + achats consommés) × 365.", compute: (c, i) => { const y = c.years[i]; const achats = v(y, "ACHATS_REVENDUS") + v(y, "ACHATS_CONSOMMES"); return achats && has(y, "STOCKS") ? { value: ratio(v(y, "STOCKS"), achats, 365) } : missing(["stocks", "achats"]); } },
  { key: "BFR_JOURS", labelFr: "BFR en jours de chiffre d'affaires", unit: "j", group: "ACTIVITE", formulaFr: "BFR / chiffre d'affaires × 365.", compute: (c, i) => (v(c.years[i], "CHIFFRE_AFFAIRES") ? { value: ratio(bfr(c.years[i]), v(c.years[i], "CHIFFRE_AFFAIRES"), 365) } : missing(["chiffre d'affaires"])) },

  // Capacité de remboursement
  { key: "COUVERTURE_INTERETS", labelFr: "Couverture des intérêts", unit: "x", group: "REMBOURSEMENT", formulaFr: "EBE retraité / charges d'intérêts.", compute: (c, i) => { const y = c.years[i]; if (!has(y, "CHIFFRE_AFFAIRES")) return missing(["CPC"]); if (!v(y, "CHARGES_INTERETS")) return { value: null, noteFr: "Aucune charge d'intérêts : ratio non significatif, à apprécier par l'analyste." }; return { value: ratio(ebeRetraite(c, i), v(y, "CHARGES_INTERETS")) }; } },
  { key: "CFO", labelFr: "Flux de trésorerie d'exploitation", unit: "MAD", group: "REMBOURSEMENT", formulaFr: "EBE retraité − impôts sur les résultats − variation du BFR (exige l'exercice précédent).", compute: (c, i) => { const x = cfo(c, i); return x === null ? missing(["exercice précédent"]) : { value: x }; } },
  { key: "CONVERSION_CFO_EBE", labelFr: "Conversion de l'EBE en trésorerie", unit: "%", group: "REMBOURSEMENT", onlyN: true, formulaFr: "Moyenne pondérée de CFO / EBE retraité : 50 % N, 30 % N−1, 20 % N−2 (poids répartis sur les exercices calculables).", compute: (c) => { if (!has(c.years[0], "CHIFFRE_AFFAIRES")) return missing(["CPC"]); if (ebeRetraite(c, 0) <= 0) return { value: null, nonPositiveEbitda: true, noteFr: "EBE retraité nul ou négatif : conversion non mesurable." }; const w = [0.5, 0.3, 0.2]; let sum = 0; let wt = 0; let k = 0; for (let i = 0; i < 3; i++) { const f = cfo(c, i); const e = c.present[i] ? ebeRetraite(c, i) : 0; if (f === null || e <= 0) continue; sum += w[i] * (f / e); wt += w[i]; k++; } return wt === 0 ? missing(["exercice précédent"]) : { value: (sum / wt) * 100, noteFr: k < 3 ? `Moyenne sur ${k} exercice(s) calculable(s).` : undefined }; } },
  { key: "CAPEX", labelFr: "Investissements de l'exercice", unit: "MAD", group: "REMBOURSEMENT", formulaFr: "Acquisitions d'immobilisations ; à défaut, variation des immobilisations nettes + dotations d'exploitation (estimation).", compute: (c, i) => { const x = capex(c, i); return x.value === null ? missing(["investissements ou exercice précédent"]) : { value: x.value, noteFr: x.estimated ? "Estimé par la variation des immobilisations." : undefined }; } },
  { key: "FCF", labelFr: "Free cash-flow", unit: "MAD", group: "REMBOURSEMENT", formulaFr: "Flux de trésorerie d'exploitation − investissements.", compute: (c, i) => { const f = cfo(c, i); const k = capex(c, i); if (f === null || k.value === null) return missing(["exercice précédent"]); return { value: f - k.value, noteFr: k.estimated ? "Investissements estimés." : undefined }; } },
  { key: "FCF_DETTE", labelFr: "Free cash-flow / dette brute moyenne", unit: "%", group: "REMBOURSEMENT", onlyN: true, formulaFr: "FCF de l'exercice N / moyenne de la dette brute économique N et N−1.", compute: (c) => { const f = cfo(c, 0); const k = capex(c, 0); if (f === null || k.value === null) return missing(["exercice précédent"]); const d = (detteBrute(c, 0) + detteBrute(c, 1)) / 2; return d === 0 ? { value: null, noteFr: "Aucune dette financière : ratio non significatif." } : { value: ((f - k.value) / d) * 100, noteFr: k.estimated ? "Investissements estimés par la variation des immobilisations." : undefined }; } },
  { key: "SERVICE_DETTE", labelFr: "Service de la dette à 12 mois", unit: "MAD", group: "REMBOURSEMENT", onlyN: true, formulaFr: "Charges d'intérêts + redevances de crédit-bail + principal exigible à 12 mois.", compute: (c) => serviceDette(c) },
  { key: "DSCR", labelFr: "Couverture du service de la dette (DSCR)", unit: "x", group: "REMBOURSEMENT", onlyN: true, formulaFr: "Flux de trésorerie d'exploitation (CFADS) / service de la dette à 12 mois.", compute: (c) => { const s = serviceDette(c); if (s.value === null) return { value: null, noteFr: s.noteFr }; if (s.value === 0) return { value: null, noteFr: "Aucun service de dette : ratio non significatif." }; const f = cfo(c, 0); const base = f ?? ebeRetraite(c, 0) - v(c.years[0], "IMPOTS_RESULTATS"); const notes = [s.noteFr, f === null ? "Sans exercice précédent, la variation du BFR n'est pas déduite." : undefined].filter(Boolean); return { value: base / s.value, noteFr: notes.length ? notes.join(" ") : undefined }; } },
];

export const INDICATOR_BY_KEY: ReadonlyMap<string, IndicatorDef> = new Map(INDICATORS.map((d) => [d.key, d]));

// --- Liens avec les grilles --------------------------------------------------------

export interface GridLink {
  indicator: string;
  /** Cas spécial du critère quand l'EBITDA retraité est nul ou négatif. */
  nonPositiveEbitdaCase?: string;
  /** Cas spécial du critère quand la valeur calculée est négative. */
  negativeCase?: string;
  noteFr?: string;
}

/**
 * Critères de chaque grille calculés depuis le bilan. Les grilles
 * comportementales (TPE) n'en ont pas : leurs critères se lisent sur les flux
 * bancaires. Le bilan reste restitué sur la fiche.
 */
export const GRID_LINKS: Record<string, Record<string, GridLink>> = {
  CORP_STD_V1: {
    "D1.4": { indicator: "FPT_TOTAL_BILAN", negativeCase: "NEGATIVE_TANGIBLE_EQUITY" },
    "D1.5": { indicator: "DETTE_NETTE_EBE", nonPositiveEbitdaCase: "EBITDA_LTE_0" },
    "D1.6": { indicator: "LIQUIDITE_GENERALE" },
    "D1.8": { indicator: "CONVERSION_CFO_EBE", nonPositiveEbitdaCase: "EBITDA_LTE_0" },
    "D2.1": { indicator: "COUVERTURE_INTERETS" },
    "D2.2": { indicator: "DSCR" },
    "D2.3": { indicator: "FCF_DETTE" },
  },
  CORP_STD_CHALLENGER_V1: {
    F1: { indicator: "FPT_TOTAL_BILAN" },
    F2: { indicator: "DETTE_NETTE_EBE", nonPositiveEbitdaCase: "EBITDA_NON_POSITIF" },
    F3: { indicator: "DSCR", noteFr: "DSCR historique : le critère attend le DSCR prévisionnel à 12 mois ; corrigez si le prévisionnel diffère." },
    F6: { indicator: "CONVERSION_CFO_EBE", nonPositiveEbitdaCase: "EBITDA_NON_POSITIF" },
  },
};

export function gridLinks(modelId: string): Record<string, GridLink> {
  return GRID_LINKS[modelId] ?? {};
}

// --- Calcul complet ---------------------------------------------------------------

export interface IndicatorResult {
  key: string;
  values: Array<number | null>;
  notes: Array<string | undefined>;
}

export interface FinancialComputation {
  years: YearValues[];
  present: boolean[];
  indicators: IndicatorResult[];
  gridRatios: FinancialGridRatio[];
  controls: FinancialControl[];
  /** Les comptes de l'exercice N ont plus de 18 mois à la date d'arrêté. */
  stale: boolean;
}

const round = (n: number | null, d = 2): number | null =>
  n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;

/** Valeur numérique d'une correction de ratio (virgule décimale admise). */
export function parseRatio(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function monthsBetween(fromIso: string, toIso: string): number | null {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() - a.getUTCDate()) / 31;
}

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

export function computeFinancials(
  f: FinancialsDraft,
  modelId: string,
  ctx: { asOfDate: string; declaredTurnover?: number }
): FinancialComputation {
  const years = f.years.map((y) => computeYear(y.values));
  const present = f.years.map((y) => yearHasData(y));
  const c: Ctx = { years, present };

  const indicators: IndicatorResult[] = INDICATORS.map((d) => {
    const values: Array<number | null> = [];
    const notes: Array<string | undefined> = [];
    f.years.forEach((_, i) => {
      if (!present[i] || (d.onlyN && i > 0)) {
        values.push(null);
        notes.push(undefined);
        return;
      }
      const o = d.compute(c, i);
      values.push(round(o.value, d.unit === "MAD" ? 0 : 2));
      notes.push(o.noteFr);
    });
    return { key: d.key, values, notes };
  });

  // --- Contrôles ---
  const controls: FinancialControl[] = [];
  const nLabel = (i: number) => f.years[i]?.fiscalYear || ["N", "N−1", "N−2"][i];
  if (!present[0]) {
    controls.push({ key: "EXERCICE_N", labelFr: "Exercice N renseigné", status: "KO", detailFr: "Aucun montant pour l'exercice N." });
  }
  if (present[0] && !present[1]) {
    controls.push({ key: "EXERCICE_N1", labelFr: "Exercice N−1 renseigné", status: "KO", detailFr: "Deux exercices sont exigés (N et N−1) : sans N−1, la variation du BFR, la croissance et les flux de trésorerie ne se calculent pas." });
  }
  f.years.forEach((y, i) => {
    if (!present[i]) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(y.closingDate)) {
      controls.push({ key: `CLOTURE_${i}`, labelFr: `Date de clôture ${nLabel(i)}`, status: "KO", detailFr: "Date de clôture à renseigner (AAAA-MM-JJ)." });
    }
    const yv = years[i];
    if (yv.TOTAL_ACTIF !== undefined || yv.TOTAL_PASSIF !== undefined) {
      const a = yv.TOTAL_ACTIF ?? 0;
      const p = yv.TOTAL_PASSIF ?? 0;
      const tol = Math.max(1, Math.abs(a) * 0.001);
      controls.push({
        key: `EQUILIBRE_${i}`,
        labelFr: `Équilibre du bilan ${nLabel(i)}`,
        status: Math.abs(a - p) <= tol ? "OK" : "KO",
        detailFr: Math.abs(a - p) <= tol ? `Actif = passif = ${fmt(a)}.` : `Actif ${fmt(a)} ≠ passif ${fmt(p)} (écart ${fmt(a - p)}) : un poste manque ou est mal lu.`,
      });
    }
    for (const [decl, calc, lib] of [
      ["TOTAL_ACTIF_DECLARE", "TOTAL_ACTIF", "Total actif"],
      ["TOTAL_PASSIF_DECLARE", "TOTAL_PASSIF", "Total passif"],
      ["RESULTAT_NET_DECLARE", "RESULTAT_NET", "Résultat net du CPC"],
    ] as const) {
      if (yv[decl] === undefined || yv[calc] === undefined) continue;
      const d = yv[decl]!;
      const k = yv[calc]!;
      const ok = Math.abs(d - k) <= Math.max(1, Math.abs(d) * 0.001);
      controls.push({ key: `${decl}_${i}`, labelFr: `${lib} ${nLabel(i)} : document / calcul`, status: ok ? "OK" : "KO", detailFr: ok ? `${fmt(d)} sur le document, retrouvé par le calcul.` : `${fmt(d)} sur le document, ${fmt(k)} recalculé.` });
    }
    if (yv.RESULTAT_EXERCICE_BILAN !== undefined && yv.RESULTAT_NET !== undefined) {
      const ok = Math.abs(yv.RESULTAT_EXERCICE_BILAN - yv.RESULTAT_NET) <= Math.max(1, Math.abs(yv.RESULTAT_NET) * 0.001);
      controls.push({ key: `RESULTAT_${i}`, labelFr: `Résultat du bilan = résultat du CPC ${nLabel(i)}`, status: ok ? "OK" : "KO", detailFr: ok ? `${fmt(yv.RESULTAT_NET)}.` : `Bilan ${fmt(yv.RESULTAT_EXERCICE_BILAN)}, CPC ${fmt(yv.RESULTAT_NET)}.` });
    }
    for (const p of POSTES) {
      const val = yv[p.key];
      if (p.kind === "INPUT" && !p.signed && !p.declared && val !== undefined && val < 0) {
        controls.push({ key: `NEGATIF_${p.key}_${i}`, labelFr: `${p.labelFr} ${nLabel(i)}`, status: "ALERTE", detailFr: "Montant négatif sur un poste normalement positif." });
      }
    }
  });
  if (present[0] && present[1] && f.years[0].closingDate && f.years[1].closingDate && f.years[0].closingDate <= f.years[1].closingDate) {
    controls.push({ key: "ORDRE", labelFr: "Ordre des exercices", status: "KO", detailFr: "L'exercice N doit être clos après l'exercice N−1." });
  }
  let stale = false;
  if (present[0] && /^\d{4}-\d{2}-\d{2}$/.test(f.years[0].closingDate)) {
    const m = monthsBetween(f.years[0].closingDate, ctx.asOfDate);
    if (m !== null) {
      if (m < 0) {
        controls.push({ key: "FRAICHEUR", labelFr: "Fraîcheur des comptes", status: "KO", detailFr: "Exercice N clos après la date d'arrêté." });
      } else if (m > STALE_AFTER_MONTHS) {
        stale = true;
        controls.push({ key: "FRAICHEUR", labelFr: "Fraîcheur des comptes", status: "KO", detailFr: `Comptes clos depuis ${Math.floor(m)} mois (plus de ${STALE_AFTER_MONTHS}) : les ratios du bilan sont périmés pour la notation.` });
      } else {
        controls.push({ key: "FRAICHEUR", labelFr: "Fraîcheur des comptes", status: m > 12 ? "ALERTE" : "OK", detailFr: `Comptes clos depuis ${Math.floor(m)} mois${m > 12 ? " : un exercice plus récent est peut-être disponible." : "."}` });
      }
    }
  }
  const caN = years[0]?.CHIFFRE_AFFAIRES;
  if (present[0] && f.statementModel === "SIMPLIFIE" && caN !== undefined && caN > SIMPLIFIED_MODEL_MAX_TURNOVER_MAD) {
    controls.push({ key: "MODELE", labelFr: "Modèle comptable", status: "ALERTE", detailFr: `Modèle simplifié avec un CA de ${fmt(caN)} : au-delà de 10 MDH, le modèle normal est attendu (loi 44-03).` });
  }
  if (present[0] && !f.statementModel) {
    controls.push({ key: "MODELE", labelFr: "Modèle comptable", status: "ALERTE", detailFr: "Préciser modèle normal ou simplifié." });
  }
  if (caN !== undefined && ctx.declaredTurnover !== undefined && ctx.declaredTurnover > 0) {
    const ok = Math.abs(caN - ctx.declaredTurnover) <= ctx.declaredTurnover * 0.01;
    controls.push({ key: "CA_CADRAGE", labelFr: "CA du bilan / CA du cadrage", status: ok ? "OK" : "ALERTE", detailFr: ok ? "Concordants." : `Bilan ${fmt(caN)}, cadrage ${fmt(ctx.declaredTurnover)} : le segment repose sur le CA du cadrage.` });
  }

  // --- Ratios de la grille ---
  const gridRatios: FinancialGridRatio[] = [];
  for (const [criterion, link] of Object.entries(gridLinks(modelId))) {
    const def = INDICATOR_BY_KEY.get(link.indicator);
    if (!def || !present[0]) continue;
    const o = def.compute(c, 0);
    const computed = round(o.value);
    let specialCase: string | undefined;
    if (o.nonPositiveEbitda && link.nonPositiveEbitdaCase) specialCase = link.nonPositiveEbitdaCase;
    else if (computed !== null && computed < 0 && link.negativeCase) specialCase = link.negativeCase;
    const ov = f.overrides[criterion];
    const ovValue = parseRatio(ov?.value);
    const overridden = ovValue !== undefined && !!ov?.reason?.trim();
    if (ovValue !== undefined && !ov?.reason?.trim()) {
      controls.push({ key: `MOTIF_${criterion}`, labelFr: `Correction de ${criterion}`, status: "KO", detailFr: "Correction sans motif : elle n'est pas prise en compte." });
    }
    const notes = [o.noteFr, link.noteFr].filter(Boolean).join(" ");
    gridRatios.push({
      criterion,
      indicator: link.indicator,
      computed,
      ...(specialCase && !overridden ? { specialCase } : {}),
      retained: overridden ? ovValue! : specialCase ? null : computed,
      overridden,
      ...(overridden ? { reason: ov!.reason.trim().slice(0, 500) } : {}),
      ...(notes ? { noteFr: notes } : {}),
    });
  }

  return { years, present, indicators, gridRatios, controls, stale };
}

/** Instantané figé, joint à la requête de notation (sans effet sur le calcul). */
export function buildFinancialBasis(
  f: FinancialsDraft,
  comp: FinancialComputation,
  currency?: string
): FinancialBasis | undefined {
  if (!comp.present[0]) return undefined;
  const n = comp.present.filter(Boolean).length;
  return {
    chartVersion: FINANCIAL_CHART_VERSION,
    statementModel: f.statementModel === "SIMPLIFIE" ? "SIMPLIFIE" : "NORMAL",
    certified: f.certified,
    source: f.source || "SAISIE",
    ...(currency ? { currency } : {}),
    ...(f.document ? { document: { id: f.document.id, name: f.document.name.slice(0, 200), sha256: f.document.sha256 } } : {}),
    years: f.years.slice(0, n).map((y, i) => ({
      fiscalYear: y.fiscalYear.slice(0, 20),
      closingDate: y.closingDate.slice(0, 10),
      postes: Object.fromEntries(
        Object.entries(comp.years[i]).filter((e): e is [string, number] => e[1] !== undefined)
      ),
    })),
    indicators: comp.indicators.map((r) => ({ key: r.key, values: r.values.slice(0, n) })),
    gridRatios: comp.gridRatios,
    controls: comp.controls.map((x) => ({ ...x, detailFr: x.detailFr.slice(0, 500) })),
  };
}
