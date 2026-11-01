import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import { effectiveGrade } from "@/lib/overrides";
import { apiKeyPerimeter } from "@/lib/route-guard";
import { GLOBAL_MODELS, pathOf, SCOPED_MODELS, type EntityNode } from "@/lib/scope";
import { inScope } from "@/lib/webhooks";

/** Contrôles issus du diagnostic technique du 1er novembre 2026 (S01 à S03, dérogations). */

function node(id: string, parentId: string | null, parentPath: string | null): EntityNode {
  return {
    id, code: id.toUpperCase(), name: id, type: "BANK", parentId, path: pathOf(id, parentPath), level: 0,
    country: null, currency: "MAD", isActive: true, toolName: null, logoUrl: null, primaryColor: null,
  };
}
const tree = [node("groupe", null, null), node("maroc", "groupe", "/groupe/"), node("ci", "groupe", "/groupe/")];

describe("Clés API : refus par défaut (S02)", () => {
  it("une clé sans code d'entité n'ouvre aucun accès ; « * » donne la portée groupe", async () => {
    const none = await apiKeyPerimeter({ name: "sans-code", role: "ADMIN", entityCode: null });
    expect(none.all).toBe(false);
    expect(none.read).toEqual([]);
    const group = await apiKeyPerimeter({ name: "central", role: "ADMIN", entityCode: "*" });
    expect(group.all).toBe(true);
  });
});

describe("Cloisonnement : liste fermée des modèles (S03)", () => {
  it("chaque modèle du schéma est soit cloisonné, soit déclaré global", () => {
    const unclassified = Object.values(Prisma.ModelName).filter((m) => !(m in SCOPED_MODELS) && !GLOBAL_MODELS.has(m));
    expect(unclassified).toEqual([]);
  });
});

describe("Événements : une filiale ne reçoit jamais ceux d'une autre (S01)", () => {
  it("souscription d'entité : son entité et sa descendance seulement ; groupe : tout", () => {
    expect(inScope("maroc", "maroc", tree)).toBe(true);
    expect(inScope("maroc", "ci", tree)).toBe(false);
    expect(inScope("groupe", "ci", tree)).toBe(true);
    expect(inScope(null, "ci", tree)).toBe(true);
    // Un événement sans entité ne part qu'aux souscriptions du groupe entier.
    expect(inScope("maroc", null, tree)).toBe(false);
  });
});

describe("Dérogations : note effective à date", () => {
  const run = { cappedGrade: "STD-P5" };
  const approved = (toGrade: string, expiresAt: string | null, decidedAt: string) => ({
    status: "APPROVED",
    toGrade,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    decidedAt: new Date(decidedAt),
  });

  it("une dérogation en vigueur s'applique ; échue, la note revient au grade du moteur", () => {
    const o = [approved("STD-P4", "2026-12-31", "2026-06-01")];
    expect(effectiveGrade(run, o, new Date("2026-11-01"))).toEqual({ grade: "STD-P4", overridden: true });
    expect(effectiveGrade(run, o, new Date("2027-01-02"))).toEqual({ grade: "STD-P5", overridden: false });
  });

  it("la plus récente des dérogations en vigueur l'emporte ; rejetées et expirées sont ignorées", () => {
    const o = [
      approved("STD-P4", null, "2026-03-01"),
      approved("STD-P6", null, "2026-09-01"),
      { status: "REJECTED", toGrade: "STD-P3", expiresAt: null, decidedAt: new Date("2026-10-01") },
      { status: "EXPIRED", toGrade: "STD-P3", expiresAt: null, decidedAt: new Date("2026-10-02") },
    ];
    expect(effectiveGrade(run, o, new Date("2026-11-01")).grade).toBe("STD-P6");
  });
});
