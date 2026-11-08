/**
 * Pièces et informations requises pour soumettre un dossier, selon son motif.
 *
 * Deux sortes d'éléments :
 *  - **contrôlés par l'outil** : bilan chargé dans le dossier, rapport de
 *    solvabilité à jour, engagements à jour, fiche juridique à jour. Ils sont
 *    vérifiés sur les données, pas sur la présence d'un fichier ;
 *  - **pièces jointes** au dossier, typées à l'ajout (statuts et modèle J,
 *    attestations fiscale et CNSS, business plan, devis…).
 *
 * La liste par motif se paramètre (Administration › Paramétrage › Motifs) ;
 * à défaut, la liste proposée ci-dessous s'applique (pratiques de constitution
 * des dossiers de crédit entreprise au Maroc, à valider en COPIL).
 */

export type DocCheck = "SYSTEME" | "PIECE";

export interface DocKind {
  code: string;
  labelFr: string;
  check: DocCheck;
  helpFr: string;
}

export const DOC_KINDS: DocKind[] = [
  { code: "BILANS", labelFr: "États financiers (bilan et CPC) chargés", check: "SYSTEME", helpFr: "Au moins l'exercice N saisi ou lu dans le dossier." },
  { code: "RAPPORT_SOLVABILITE", labelFr: "Rapport de solvabilité du crédit bureau à jour", check: "SYSTEME", helpFr: "Enregistré sur la fiche client, dans la limite d'ancienneté." },
  { code: "ENGAGEMENTS", labelFr: "Engagements chez la banque à jour", check: "SYSTEME", helpFr: "Lignes d'engagement (T24 ou saisie) datées de moins de 31 jours." },
  { code: "FICHE_JURIDIQUE", labelFr: "Fiche juridique (InfoRisque) à jour", check: "SYSTEME", helpFr: "Rapport InfoRisque enregistré, dans la limite d'ancienneté." },
  { code: "STATUTS", labelFr: "Statuts, modèle J et pouvoirs", check: "PIECE", helpFr: "Statuts à jour, extrait du registre de commerce (modèle J) de moins de 3 mois, pouvoirs des signataires." },
  { code: "ATTESTATION_FISCALE", labelFr: "Attestation de régularité fiscale", check: "PIECE", helpFr: "Délivrée par la DGI." },
  { code: "ATTESTATION_CNSS", labelFr: "Attestation CNSS", check: "PIECE", helpFr: "Attestation de régularité de la CNSS." },
  { code: "RAPPORT_CAC", labelFr: "Rapport du commissaire aux comptes", check: "PIECE", helpFr: "Pour les sociétés qui y sont soumises." },
  { code: "BUSINESS_PLAN", labelFr: "Business plan et prévisionnels", check: "PIECE", helpFr: "Plan de financement, comptes prévisionnels." },
  { code: "DEVIS", labelFr: "Devis ou factures pro forma", check: "PIECE", helpFr: "Pour un investissement : devis des équipements ou travaux." },
  { code: "SITUATION_INTERMEDIAIRE", labelFr: "Situation comptable intermédiaire", check: "PIECE", helpFr: "Si le dernier bilan a plus de 9 mois." },
  { code: "AUTRE", labelFr: "Autre pièce", check: "PIECE", helpFr: "" },
];

export const PIECE_KINDS = DOC_KINDS.filter((k) => k.check === "PIECE");
export const docKindLabel = (code: string | null | undefined) => DOC_KINDS.find((k) => k.code === code)?.labelFr ?? "Non typée";

/** Liste proposée par motif (codes des motifs embarqués). */
export const DEFAULT_REQUIRED_DOCS: Record<string, string[]> = {
  NOUVELLE_RELATION: ["BILANS", "RAPPORT_SOLVABILITE", "FICHE_JURIDIQUE", "STATUTS", "ATTESTATION_FISCALE", "ATTESTATION_CNSS"],
  RENOUVELLEMENT_CT: ["BILANS", "RAPPORT_SOLVABILITE", "ENGAGEMENTS", "ATTESTATION_FISCALE"],
  INVESTISSEMENT: ["BILANS", "RAPPORT_SOLVABILITE", "ENGAGEMENTS", "BUSINESS_PLAN", "DEVIS"],
  REVISION: ["RAPPORT_SOLVABILITE", "ENGAGEMENTS"],
  AUTRE: ["BILANS", "RAPPORT_SOLVABILITE"],
};

export function requiredFor(purpose: { code: string; requiredDocs?: string[] } | null | undefined): string[] {
  if (!purpose) return ["BILANS", "RAPPORT_SOLVABILITE"];
  const list = purpose.requiredDocs ?? DEFAULT_REQUIRED_DOCS[purpose.code] ?? ["BILANS", "RAPPORT_SOLVABILITE"];
  return list.filter((c) => DOC_KINDS.some((k) => k.code === c && c !== "AUTRE"));
}

export type ItemStatus = "FOURNI" | "MANQUANT" | "PERIME";

export interface ChecklistItem {
  code: string;
  labelFr: string;
  check: DocCheck;
  status: ItemStatus;
  detailFr: string;
}

export interface ChecklistContext {
  /** Exercices du bilan du dossier avec au moins un montant. */
  financialYears: number;
  creditReport: { reportDate: string; stale: boolean } | null;
  facilities: { lines: number; positionDate: string | null; stale: boolean };
  legalProfile: { reportDate: string; stale: boolean } | null;
  /** Pièces jointes du dossier : type et nom. */
  documents: Array<{ kind: string | null; fileName: string }>;
}

export function checklist(required: string[], ctx: ChecklistContext): ChecklistItem[] {
  return required
    .map((code) => DOC_KINDS.find((k) => k.code === code))
    .filter((k): k is DocKind => !!k)
    .map((k): ChecklistItem => {
      const piece = ctx.documents.filter((d) => d.kind === k.code);
      const base = { code: k.code, labelFr: k.labelFr, check: k.check };
      switch (k.code) {
        case "BILANS":
          return ctx.financialYears > 0
            ? { ...base, status: "FOURNI", detailFr: `${ctx.financialYears} exercice(s) chargé(s).` }
            : { ...base, status: "MANQUANT", detailFr: "Bilan à charger dans le dossier (saisie, Excel ou lecture par l'IA)." };
        case "RAPPORT_SOLVABILITE":
          if (!ctx.creditReport) return { ...base, status: "MANQUANT", detailFr: "Aucun rapport : récupérez-le (API) ou chargez-le (PDF, image)." };
          return ctx.creditReport.stale
            ? { ...base, status: "PERIME", detailFr: `Mis à jour le ${ctx.creditReport.reportDate} : à rafraîchir dans l'outil du crédit bureau.` }
            : { ...base, status: "FOURNI", detailFr: `Mis à jour le ${ctx.creditReport.reportDate}.` };
        case "ENGAGEMENTS":
          if (!ctx.facilities.lines) return { ...base, status: "MANQUANT", detailFr: "Aucune ligne : rapatriez-les de T24 ou saisissez-les sur la fiche client." };
          return ctx.facilities.stale
            ? { ...base, status: "PERIME", detailFr: `Position au ${ctx.facilities.positionDate} : à actualiser.` }
            : { ...base, status: "FOURNI", detailFr: `${ctx.facilities.lines} ligne(s), position au ${ctx.facilities.positionDate}.` };
        case "FICHE_JURIDIQUE":
          if (!ctx.legalProfile) return { ...base, status: "MANQUANT", detailFr: "Chargez le rapport InfoRisque sur la fiche client." };
          return ctx.legalProfile.stale
            ? { ...base, status: "PERIME", detailFr: `Rapport du ${ctx.legalProfile.reportDate} : à actualiser.` }
            : { ...base, status: "FOURNI", detailFr: `Rapport du ${ctx.legalProfile.reportDate}.` };
        default:
          return piece.length
            ? { ...base, status: "FOURNI", detailFr: piece.map((d) => d.fileName).join(", ") }
            : { ...base, status: "MANQUANT", detailFr: `Pièce à joindre au dossier, typée « ${k.labelFr} ». ${k.helpFr}`.trim() };
      }
    });
}

export function missingItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => i.status !== "FOURNI");
}

export function checkRequiredDocs(list: unknown): string[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return ["Liste des pièces requises invalide."];
  return list.filter((c) => typeof c !== "string" || !DOC_KINDS.some((k) => k.code === c)).map((c) => `Pièce inconnue : ${String(c)}.`);
}
