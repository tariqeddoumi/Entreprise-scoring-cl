import { describe, expect, it } from "vitest";
import { exposureOfInput } from "@/lib/rating-service";
import { todoWhere } from "@/lib/my-work";
import { journalWhere } from "@/lib/audit-journal";

describe("Engagement global enregistré avec la notation (surveillance)", () => {
  it("nombre ou texte numérique repris, arrondi au centime ; absent ou illisible : vide", () => {
    expect(exposureOfInput({ segmentationData: { globalBankExposure: 12_500_000 } })).toBe(12_500_000);
    expect(exposureOfInput({ segmentationData: { globalBankExposure: "1500000.456" } })).toBe(1_500_000.46);
    expect(exposureOfInput({ segmentationData: {} })).toBeNull();
    expect(exposureOfInput({})).toBeNull();
    expect(exposureOfInput({ segmentationData: { globalBankExposure: "n/a" } })).toBeNull();
    expect(exposureOfInput({ segmentationData: { globalBankExposure: "" } })).toBeNull();
  });
});

describe("Mon travail : ce qui attend l'utilisateur", () => {
  const id = (role: "READONLY" | "ANALYST" | "RISK_MANAGER") => ({ name: "ana.ma", role, entityId: null }) as never;
  it("brouillons et rejetés de l'utilisateur ; dossiers soumis par un autre pour un décideur", () => {
    const w = todoWhere(id("ANALYST")) as { OR: Array<Record<string, unknown>> };
    expect(w.OR).toHaveLength(2);
    expect(w.OR[0]).toMatchObject({ status: { in: ["DRAFT", "REJECTED"] }, createdBy: "ana.ma" });
    expect(w.OR[1]).toMatchObject({ status: "SUBMITTED", submittedBy: { not: "ana.ma" } });
  });
  it("consultation seule : pas de dossier à décider", () => {
    const w = todoWhere(id("READONLY")) as { OR: unknown[] };
    expect(w.OR).toHaveLength(1);
  });
});

describe("Journal d'audit : filtres", () => {
  it("le filtre par action sert l'index (action, date)", () => {
    const w = journalWhere({ resourceType: "", action: "CASE_SUBMITTED", actor: "", from: "2026-11-01", to: "2026-11-02", page: 1 });
    expect(w.action).toBe("CASE_SUBMITTED");
    expect(w.createdAt).toMatchObject({ gte: new Date("2026-11-01T00:00:00Z") });
  });
});
