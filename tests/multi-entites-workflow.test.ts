import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma";
import { CORP_STD_V1 } from "@/models";
import {
  applyField,
  draftToRequest,
  emptyDraft,
  normalizeProposal,
  parseDraft,
  proposableFields,
} from "@/lib/case-input";
import { contributorsOf, isOfficialRun, validationBlocker } from "@/lib/cases";
import { convertToBase, FxError, formatAmount } from "@/lib/fx";
import {
  canRead,
  canWrite,
  computePerimeter,
  entityCurrency,
  inheritedBranding,
  pathOf,
  sortTree,
  type EntityNode,
} from "@/lib/scope";
import { ratingRequestSchema } from "@/lib/schemas";
import { validateSetting } from "@/lib/settings";

function node(id: string, parentId: string | null, extra: Partial<EntityNode> = {}): EntityNode {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    type: "BANK",
    parentId,
    path: "",
    level: 0,
    country: null,
    currency: "MAD",
    isActive: true,
    toolName: null,
    logoUrl: null,
    primaryColor: null,
    ...extra,
  };
}

/** Arbre : groupe › banque Maroc (› agence régionale) ; groupe › Afrique › CI, SN. */
function tree(): EntityNode[] {
  const raw = [
    node("groupe", null, { toolName: "Notation Groupe", primaryColor: "#0f3d63" }),
    node("maroc", "groupe"),
    node("region", "maroc"),
    node("afrique", "groupe", { currency: "XOF" }),
    node("ci", "afrique", { currency: "XOF", toolName: "Notation CI" }),
    node("sn", "afrique", { currency: "XOF" }),
  ];
  const byId = new Map(raw.map((e) => [e.id, e]));
  const fill = (e: EntityNode): EntityNode => {
    if (e.path) return e;
    const parent = e.parentId ? fill(byId.get(e.parentId)!) : null;
    e.path = pathOf(e.id, parent?.path ?? null);
    e.level = parent ? parent.level + 1 : 0;
    return e;
  };
  raw.forEach(fill);
  return raw;
}

describe("Périmètre par banque et filiale", () => {
  it("donne au seul administrateur sans entité l'accès au groupe entier", () => {
    expect(computePerimeter(tree(), { entityId: null, role: "ADMIN" }).all).toBe(true);
    const analyste = computePerimeter(tree(), { entityId: null, role: "ANALYST" });
    expect(analyste.all).toBe(false);
    expect(analyste.read).toEqual([]);
  });

  it("ouvre en lecture l'entité et sa descendance, en écriture l'entité seule par défaut", () => {
    const p = computePerimeter(tree(), { entityId: "afrique", role: "ANALYST" });
    expect(new Set(p.read)).toEqual(new Set(["afrique", "ci", "sn"]));
    expect(p.write).toEqual(["afrique"]);
    expect(canRead(p, "ci")).toBe(true);
    expect(canWrite(p, "ci")).toBe(false);
    expect(canRead(p, "maroc")).toBe(false);
  });

  it("étend l'écriture à la descendance avec la portée BRANCH", () => {
    const p = computePerimeter(tree(), { entityId: "afrique", writeScope: "BRANCH", role: "ANALYST" });
    expect(canWrite(p, "sn")).toBe(true);
    expect(canWrite(p, "maroc")).toBe(false);
  });

  it("ne confond pas deux identifiants dont l'un prolonge l'autre", () => {
    const t = [...tree(), node("ci2", "groupe")];
    t[t.length - 1].path = "/groupe/ci2/";
    const p = computePerimeter(t, { entityId: "ci", role: "ANALYST" });
    expect(p.read).toEqual(["ci"]);
  });

  it("ferme l'accès si l'entité ou une ascendante est désactivée", () => {
    const t = tree().map((e) => (e.id === "afrique" ? { ...e, isActive: false } : e));
    const p = computePerimeter(t, { entityId: "ci", role: "RISK_MANAGER" });
    expect(p.read).toEqual([]);
    expect(p.write).toEqual([]);
  });

  it("hérite devise et habillage de l'ascendance", () => {
    expect(entityCurrency(tree(), "sn")).toBe("XOF");
    expect(entityCurrency(tree(), "region")).toBe("MAD");
    const b = inheritedBranding(tree(), "ci");
    expect(b.toolName).toBe("Notation CI");
    expect(b.primaryColor).toBe("#0f3d63");
    expect(sortTree(tree()).map((e) => e.id)).toEqual(["groupe", "afrique", "ci", "sn", "maroc", "region"]);
  });
});

describe("Multi-devise", () => {
  const rates = [
    { currency: "XOF", effectiveDate: "2026-01-01", rate: "0.0160" },
    { currency: "XOF", effectiveDate: "2026-06-01", rate: "0.0165" },
  ];
  const db = {
    exchangeRate: {
      findFirst: async ({ where }: { where: { currency: string; effectiveDate: { lte: string } } }) =>
        rates
          .filter((r) => r.currency === where.currency && r.effectiveDate <= where.effectiveDate.lte)
          .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null,
    },
  } as unknown as Pick<PrismaClient, "exchangeRate">;

  it("applique le dernier cours publié à la date d'arrêté ou avant", async () => {
    const fx = await convertToBase(db, "XOF", "2026-07-15", { annualTurnover: 95_000_000 });
    expect(fx.rate).toBe(0.0165);
    expect(fx.rateDate).toBe("2026-06-01");
    expect(fx.amounts.annualTurnover).toEqual({ original: 95_000_000, base: 1_567_500 });
    const earlier = await convertToBase(db, "XOF", "2026-03-31", { annualTurnover: 100 });
    expect(earlier.rate).toBe(0.016);
  });

  it("ne devine jamais un cours manquant", async () => {
    await expect(convertToBase(db, "XOF", "2026-05-31", { annualTurnover: 1 })).resolves.toMatchObject({ rate: 0.016 });
    await expect(convertToBase(db, "XOF", "2026-01-01", { annualTurnover: 1 })).resolves.toMatchObject({ rateDate: "2026-01-01" });
    // Date hors de tout jeu de segmentation : erreur métier lisible, jamais une erreur technique.
    await expect(convertToBase(db, "XOF", "1990-01-01", { annualTurnover: 1 })).rejects.toBeInstanceOf(FxError);
    await expect(convertToBase(db, "GNF", "2026-07-15", { annualTurnover: 1 })).rejects.toThrow(/Aucun cours GNF\/MAD/);
  });

  it("ne convertit pas le dirham et formate les montants", async () => {
    const fx = await convertToBase(db, "MAD", "2026-07-15", { annualTurnover: 5 });
    expect(fx.rate).toBe(1);
    expect(formatAmount(1_567_500, "MAD")).toBe("1 567 500 MAD");
  });
});

describe("Saisie d'un dossier", () => {
  const model = CORP_STD_V1;

  it("produit, depuis un brouillon vide, une requête acceptée par la validation de l'API", () => {
    const req = draftToRequest(emptyDraft(model, "2026-06-30"), model);
    const parsed = ratingRequestSchema.safeParse({ counterpartyId: "x", ...req });
    expect(parsed.success).toBe(true);
  });

  it("transmet les montants convertis pour la segmentation", () => {
    const draft = { ...emptyDraft(model, "2026-06-30"), segment: "" as const };
    const req = draftToRequest(draft, model, { annualTurnover: 1_567_500 });
    expect(req.segmentationData).toEqual({ annualTurnover: 1_567_500 });
    expect(req.segment).toBeUndefined();
  });

  it("relit un brouillon partiel ou illisible sans perdre les valeurs par défaut", () => {
    const d = parseDraft(JSON.stringify({ companyAgeYears: "7" }), model, "2026-06-30");
    expect(d.companyAgeYears).toBe("7");
    expect(Object.keys(d.criteria)).toHaveLength(model.criteria.length);
    expect(parseDraft("{pas du json", model, "2026-06-30").version).toBe(1);
  });

  it("applique une proposition sur un critère dont le code contient un point", () => {
    const d = applyField(emptyDraft(model, "2026-06-30"), "criteria.D1.4.value", "2.1");
    expect(d.criteria["D1.4"].value).toBe("2.1");
    const e = applyField(d, "criteria.D1.4.status", "STALE");
    expect(e.criteria["D1.4"].status).toBe("STALE");
    expect(applyField(d, "criteria.D1.4.value", "3").criteria["D1.4"].value).toBe("3");
  });

  it("applique drapeaux, red flags, support groupe et montants", () => {
    let d = emptyDraft(model, "2026-06-30");
    const rf = model.redFlags[0].code;
    d = applyField(d, `redFlags.${rf}`, "true");
    d = applyField(d, `redFlags.${rf}`, "true");
    expect(d.redFlags).toEqual([rf]);
    d = applyField(d, "groupSupport.legallyBinding", "true");
    expect(d.groupSupport.claimed).toBe(true);
    d = applyField(d, "amounts.annualTurnover", "95000000");
    expect(d.amounts.annualTurnover).toBe("95000000");
    d = applyField(d, "structuralFlags.companyAgeYears", "12");
    expect(d.companyAgeYears).toBe("12");
  });

  it("revérifie chaque valeur proposée par l'IA contre la nature du champ", () => {
    const fields = new Map(proposableFields(model).map((f) => [f.key, f]));
    expect(normalizeProposal(fields.get("criteria.D1.5.value")!, "3,5")).toBe("3.5");
    expect(normalizeProposal(fields.get("criteria.D1.1.score")!, "75")).toBe("75");
    expect(normalizeProposal(fields.get("criteria.D1.1.score")!, "60")).toBeNull();
    expect(normalizeProposal(fields.get("criteria.D1.1.status")!, "PEUT-ÊTRE")).toBeNull();
    expect(normalizeProposal(fields.get("defaultTriggered")!, "oui")).toBeNull();
    // Toute clé proposable s'applique sans erreur au brouillon.
    for (const f of fields.values()) {
      const value = f.kind === "number" ? "1" : f.kind === "anchor" ? "50" : f.kind === "status" ? "MISSING" : "true";
      expect(() => applyField(emptyDraft(model, "2026-06-30"), f.key, value)).not.toThrow();
    }
  });
});

describe("Workflow : séparation des fonctions et note officielle", () => {
  const events: Array<{ resourceId: string; actor: string; action: string; detail: string | null }> = [
    { resourceId: "c1", actor: "auteur", action: "CASE_CREATED", detail: null },
    { resourceId: "c1", actor: "relecteur", action: "AI_PROPOSAL_DECIDED", detail: null },
    { resourceId: "c2", actor: "repreneur", action: "CASE_REOPENED", detail: JSON.stringify({ fromCaseId: "c1" }) },
    { resourceId: "c2", actor: "repreneur", action: "CASE_SUBMITTED", detail: null },
  ];
  const db = {
    auditEvent: {
      findMany: async ({ where }: { where: { resourceId: string; action: { in: string[] } } }) =>
        events.filter((e) => e.resourceId === where.resourceId && where.action.in.includes(e.action)),
    },
  } as unknown as PrismaClient;

  it("hérite les contributeurs du dossier rejeté lors d'une reprise", async () => {
    expect(new Set(await contributorsOf(db, "c2"))).toEqual(new Set(["auteur", "relecteur", "repreneur"]));
  });

  it("refuse la validation à un contributeur, à un rôle insuffisant, et hors statut soumis", async () => {
    const c2 = { id: "c2", status: "SUBMITTED", fxDetail: null, draftInput: "{}" };
    expect(await validationBlocker(db, { name: "relecteur", role: "RISK_MANAGER" }, c2)).toMatch(/séparation des fonctions/);
    expect(await validationBlocker(db, { name: "tiers", role: "ANALYST" }, c2)).toMatch(/rôle RISK_MANAGER requis/);
    expect(await validationBlocker(db, { name: "tiers", role: "RISK_MANAGER" }, c2)).toBeNull();
    expect(await validationBlocker(db, { name: "tiers", role: "ADMIN" }, { ...c2, status: "DRAFT" })).toMatch(/pas en attente/);
  });

  it("ne tient pour officielle qu'une notation validée ou antérieure au workflow", () => {
    expect(isOfficialRun({ ratingCase: null })).toBe(true);
    expect(isOfficialRun({ ratingCase: { status: "VALIDATED" } })).toBe(true);
    expect(isOfficialRun({ ratingCase: { status: "SUBMITTED" } })).toBe(false);
    expect(isOfficialRun({ ratingCase: { status: "REJECTED" } })).toBe(false);
  });
});

describe("Paramétrage", () => {
  it("borne les valeurs et exige une adresse https pour l'IA", () => {
    expect(validateSetting("OVERRIDE_MAX_NOTCHES", "9").ok).toBe(false);
    expect(validateSetting("WORKFLOW_VALIDATOR_ROLE", "READONLY").ok).toBe(false);
    expect(validateSetting("AI_BASE_URL", "http://ia.interne/v1").ok).toBe(false);
    expect(validateSetting("AI_BASE_URL", "https://ia.banque.ma/v1").ok).toBe(true);
    expect(validateSetting("AI_PROVIDER", "inconnu").ok).toBe(false);
  });
});
