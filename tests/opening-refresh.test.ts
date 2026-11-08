import { beforeEach, describe, expect, it, vi } from "vitest";

const settings: Record<string, string> = {};
const calls = { fiche: 0, engagements: 0 };
let ficheError: Error | null = null;
let facError: Error | null = null;

vi.mock("../src/lib/settings", () => ({ loadSettings: async () => settings }));
vi.mock("../src/lib/core-banking", () => {
  class CoreBankingError extends Error {
    constructor(public kind: string, message: string) {
      super(message);
    }
  }
  return {
    CoreBankingError,
    t24Config: async () => ({ enabled: settings.T24_ENABLED === "true" }),
    syncFromT24: async () => {
      calls.fiche++;
      if (ficheError) throw ficheError;
      return { changes: [{ field: "name" }], code: "100245" };
    },
  };
});
vi.mock("../src/lib/facilities", () => {
  class FacilityError extends Error {}
  return {
    FacilityError,
    syncFacilitiesFromT24: async () => {
      calls.engagements++;
      if (facError) throw facError;
      return 3;
    },
  };
});

import { CoreBankingError } from "../src/lib/core-banking";
import { parseOpeningRefresh, refreshAtOpening } from "../src/lib/opening-refresh";

const NOW = new Date("2026-11-08T10:00:00Z");
const perimeter = { all: false, entityId: "E1", read: ["E1"], write: ["E1"] } as never;
const identity = { name: "analyste", role: "ANALYST" } as never;

function fakeDb(cp: Record<string, unknown> | null, latestFacility: string | null = null) {
  return {
    counterparty: { findUnique: async () => cp },
    creditFacility: { findFirst: async () => (latestFacility ? { asOfDate: latestFacility } : null) },
  } as never;
}

const t24Client = { id: "C1", entityId: "E1", coreBankingId: "100245", dataSource: "T24", coreBankingSyncedAt: new Date("2026-10-01T00:00:00Z"), isActive: true };

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, { T24_ENABLED: "true", T24_FACILITIES_PATH: "/limits/" });
  calls.fiche = 0;
  calls.engagements = 0;
  ficheError = null;
  facError = null;
});

describe("actualisation T24 à l'ouverture du dossier", () => {
  it("actualise la fiche et les engagements d'un client T24", async () => {
    const r = await refreshAtOpening(fakeDb(t24Client), perimeter, identity, "C1", NOW);
    expect(r?.fiche.status).toBe("ACTUALISE");
    expect(r?.fiche.detailFr).toContain("1 champ(s)");
    expect(r?.engagements.status).toBe("ACTUALISE");
    expect(r?.engagements.detailFr).toContain("3 ligne(s)");
  });

  it("ne fait rien si T24 est désactivé, le paramètre à AUCUNE, ou la fiche saisie", async () => {
    settings.T24_ENABLED = "false";
    expect(await refreshAtOpening(fakeDb(t24Client), perimeter, identity, "C1", NOW)).toBeNull();
    settings.T24_ENABLED = "true";
    settings.T24_REFRESH_AT_OPENING = "AUCUNE";
    expect(await refreshAtOpening(fakeDb(t24Client), perimeter, identity, "C1", NOW)).toBeNull();
    delete settings.T24_REFRESH_AT_OPENING;
    expect(await refreshAtOpening(fakeDb({ ...t24Client, dataSource: "SAISIE" }), perimeter, identity, "C1", NOW)).toBeNull();
    expect(await refreshAtOpening(fakeDb({ ...t24Client, entityId: "E2" }), perimeter, identity, "C1", NOW)).toBeNull();
    expect(calls.fiche + calls.engagements).toBe(0);
  });

  it("une panne de T24 ne bloque pas : échec signalé avec la dernière date", async () => {
    ficheError = new CoreBankingError("INDISPONIBLE", "T24 ne répond pas. Vous pouvez saisir les informations minimales.");
    facError = new Error("réseau");
    const r = await refreshAtOpening(fakeDb(t24Client, "2026-10-15"), perimeter, identity, "C1", NOW);
    expect(r?.fiche.status).toBe("ECHEC");
    expect(r?.fiche.detailFr).toContain("T24 ne répond pas.");
    expect(r?.fiche.detailFr).toContain("2026-10-01");
    expect(r?.fiche.detailFr).not.toContain("saisir");
    expect(r?.engagements.status).toBe("ECHEC");
    expect(r?.engagements.detailFr).toContain("T24 indisponible.");
    expect(r?.engagements.detailFr).toContain("2026-10-15");
  });

  it("ne relit pas une fiche récente ni des engagements du jour", async () => {
    const r = await refreshAtOpening(fakeDb({ ...t24Client, coreBankingSyncedAt: new Date("2026-11-08T09:30:00Z") }, "2026-11-08"), perimeter, identity, "C1", NOW);
    expect(r?.fiche.status).toBe("IGNORE");
    expect(r?.engagements.status).toBe("IGNORE");
    expect(calls.fiche + calls.engagements).toBe(0);
  });

  it("mode fiche seule ou chemin des engagements vide", async () => {
    settings.T24_REFRESH_AT_OPENING = "FICHE";
    let r = await refreshAtOpening(fakeDb(t24Client), perimeter, identity, "C1", NOW);
    expect(r?.fiche.status).toBe("ACTUALISE");
    expect(r?.engagements.status).toBe("IGNORE");
    settings.T24_REFRESH_AT_OPENING = "FICHE_ET_ENGAGEMENTS";
    settings.T24_FACILITIES_PATH = "";
    r = await refreshAtOpening(fakeDb(t24Client), perimeter, identity, "C1", NOW);
    expect(r?.engagements.status).toBe("IGNORE");
    expect(calls.engagements).toBe(0);
  });

  it("relit le résultat conservé au journal", () => {
    const o = { fiche: { status: "ACTUALISE", detailFr: "x" }, engagements: { status: "ECHEC", detailFr: "y" } };
    expect(parseOpeningRefresh(JSON.stringify({ openingRefresh: o }))).toEqual(o);
    expect(parseOpeningRefresh(JSON.stringify({ reprise: true }))).toBeNull();
    expect(parseOpeningRefresh("{")).toBeNull();
    expect(parseOpeningRefresh(null)).toBeNull();
  });
});
