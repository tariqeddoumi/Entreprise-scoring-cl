import { describe, expect, it } from "vitest";
import { checklist, checkRequiredDocs, DEFAULT_REQUIRED_DOCS, missingItems, requiredFor, type ChecklistContext } from "@/reference/required-docs";
import { checkPurposes, DEFAULT_PURPOSES } from "@/reference/case-purposes";

const ctx: ChecklistContext = {
  financialYears: 2,
  creditReport: { reportDate: "2026-10-28", stale: false },
  facilities: { lines: 3, positionDate: "2026-11-01", stale: false },
  legalProfile: null,
  documents: [
    { kind: "STATUTS", fileName: "statuts.pdf" },
    { kind: null, fileName: "divers.pdf" },
  ],
};

describe("Pièces requises par motif", () => {
  it("liste proposée par motif embarqué ; paramétrage prioritaire ; repli prudent", () => {
    expect(requiredFor({ code: "INVESTISSEMENT" })).toEqual(DEFAULT_REQUIRED_DOCS.INVESTISSEMENT);
    expect(requiredFor({ code: "INVESTISSEMENT", requiredDocs: ["BILANS", "DEVIS", "AUTRE"] })).toEqual(["BILANS", "DEVIS"]);
    expect(requiredFor({ code: "MOTIF_LOCAL" })).toEqual(["BILANS", "RAPPORT_SOLVABILITE"]);
    expect(requiredFor(null)).toEqual(["BILANS", "RAPPORT_SOLVABILITE"]);
    for (const p of DEFAULT_PURPOSES) expect(DEFAULT_REQUIRED_DOCS[p.code]).toBeDefined();
  });

  it("entrée en relation : contrôles sur les données et pièces typées", () => {
    const items = checklist(requiredFor({ code: "NOUVELLE_RELATION" }), ctx);
    const st = Object.fromEntries(items.map((i) => [i.code, i.status]));
    expect(st).toEqual({
      BILANS: "FOURNI",
      RAPPORT_SOLVABILITE: "FOURNI",
      FICHE_JURIDIQUE: "MANQUANT",
      STATUTS: "FOURNI",
      ATTESTATION_FISCALE: "MANQUANT",
      ATTESTATION_CNSS: "MANQUANT",
    });
    expect(items.find((i) => i.code === "STATUTS")!.detailFr).toBe("statuts.pdf");
    expect(missingItems(items).map((i) => i.code)).toEqual(["FICHE_JURIDIQUE", "ATTESTATION_FISCALE", "ATTESTATION_CNSS"]);
  });

  it("éléments périmés : rapport ancien, engagements anciens, fiche juridique ancienne", () => {
    const items = checklist(["RAPPORT_SOLVABILITE", "ENGAGEMENTS", "FICHE_JURIDIQUE", "BILANS"], {
      ...ctx,
      financialYears: 0,
      creditReport: { reportDate: "2026-06-01", stale: true },
      facilities: { lines: 2, positionDate: "2026-08-01", stale: true },
      legalProfile: { reportDate: "2025-01-01", stale: true },
    });
    expect(items.map((i) => i.status)).toEqual(["PERIME", "PERIME", "PERIME", "MANQUANT"]);
    expect(items[0].detailFr).toMatch(/rafraîchir dans l'outil du crédit bureau/);
  });

  it("une pièce non typée ne satisfait aucune exigence", () => {
    const items = checklist(["DEVIS"], { ...ctx, documents: [{ kind: null, fileName: "devis.pdf" }] });
    expect(items[0].status).toBe("MANQUANT");
    expect(items[0].detailFr).toMatch(/typée « Devis ou factures pro forma »/);
  });

  it("paramétrage des motifs : codes de pièces contrôlés", () => {
    expect(checkRequiredDocs(undefined)).toEqual([]);
    expect(checkRequiredDocs(["BILANS", "INCONNU"])).toEqual(["Pièce inconnue : INCONNU."]);
    expect(checkPurposes([{ code: "X1", labelFr: "x", active: true, requiredDocs: ["FAUX"] }]).join(" ")).toMatch(/Pièce inconnue/);
  });
});
