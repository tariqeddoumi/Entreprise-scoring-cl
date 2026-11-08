import { describe, expect, it } from "vitest";
import { counterpartyWhere, SCOPED_MODELS } from "@/lib/scope";
import { checkedOfficerCode } from "@/lib/accounts";

const pf = { owners: ["CA0107", "ana.ma"], username: "ana.ma" };

describe("Portefeuille du chargé d'affaires : filtres du cloisonnement", () => {
  it("sans portefeuille : filtre d'entité inchangé", () => {
    expect(counterpartyWhere(["e1"])).toEqual({ entityId: { in: ["e1"] } });
    expect(SCOPED_MODELS.RatingCase(["e1"])).toEqual({ counterparty: { entityId: { in: ["e1"] } } });
  });

  it("avec portefeuille : entité ET (gestionnaire OU dossier ouvert par la personne)", () => {
    expect(counterpartyWhere(["e1"], pf)).toEqual({
      entityId: { in: ["e1"] },
      OR: [{ accountOfficer: { in: ["CA0107", "ana.ma"] } }, { ratingCases: { some: { createdBy: "ana.ma" } } }],
    });
  });

  it("tout ce qui dépend d'un client suit le portefeuille", () => {
    const cp = counterpartyWhere(["e1"], pf);
    for (const m of ["RatingRun", "RatingCase", "RenotationItem", "FinancialStatement", "CommitteeDecision", "CreditReport"]) {
      expect(SCOPED_MODELS[m](["e1"], pf)).toEqual({ counterparty: cp });
    }
    expect(SCOPED_MODELS.Override(["e1"], pf)).toEqual({ ratingRun: { counterparty: cp } });
    expect(SCOPED_MODELS.CaseDocument(["e1"], pf)).toEqual({ ratingCase: { counterparty: cp } });
    expect(SCOPED_MODELS.AiProposal(["e1"], pf)).toEqual({ ratingCase: { counterparty: cp } });
  });

  it("organisation, lots et journal restent au niveau de l'entité", () => {
    for (const m of ["User", "EconomicGroup", "RenotationBatch", "AuditEvent"]) {
      expect(SCOPED_MODELS[m](["e1"], pf)).toEqual({ entityId: { in: ["e1"] } });
    }
  });

  it("code gestionnaire T24 : format contrôlé, vide = aucun", () => {
    expect(checkedOfficerCode(" CA0107 ")).toBe("CA0107");
    expect(checkedOfficerCode("")).toBeNull();
    expect(() => checkedOfficerCode("CA 01;--")).toThrow(/Code gestionnaire/);
  });
});
