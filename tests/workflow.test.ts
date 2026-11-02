import { describe, expect, it } from "vitest";
import { exposureOf } from "@/lib/cases";
import {
  applyDecision,
  checkCircuit,
  DEFAULT_CIRCUIT,
  pendingStepIndex,
  startWorkflow,
  stepBlocker,
  stepConcerns,
  type WorkflowCircuit,
} from "@/reference/workflow";

const AT = new Date("2026-11-02T10:00:00Z");
const dca = { name: "dca", role: "ANALYST", jobFunction: "DIRECTEUR_CA" };
const ce = { name: "ce", role: "RISK_MANAGER", jobFunction: "CONTRE_ETUDE" };
const ca = { name: "ca", role: "ANALYST", jobFunction: "CHARGE_AFFAIRES" };

describe("Circuit de validation par défaut : directeur du centre d'affaires, puis contre-étude", () => {
  it("valide en deux étapes, par deux personnes de fonctions différentes", () => {
    let w = startWorkflow(DEFAULT_CIRCUIT, 5_000_000);
    expect(w.steps.map((s) => s.code)).toEqual(["DIRECTEUR_CA", "CONTRE_ETUDE"]);
    expect(stepBlocker(w, ce, [])).toMatch(/Directeur du centre d'affaires/);
    expect(stepBlocker(w, ca, [])).toMatch(/Directeur du centre d'affaires/);
    expect(stepBlocker(w, dca, [])).toBeNull();
    const a = applyDecision(w, dca, "APPROVED", "Avis favorable", AT);
    expect(a.status).toBe("SUBMITTED");
    expect(a.final).toBe(false);
    w = a.workflow;
    expect(pendingStepIndex(w)).toBe(1);
    expect(stepBlocker(w, dca, [])).toMatch(/Contre-étude/);
    expect(stepBlocker(w, ce, [])).toBeNull();
    const b = applyDecision(w, ce, "APPROVED", null, AT);
    expect(b.status).toBe("VALIDATED");
    expect(b.final).toBe(true);
    expect(pendingStepIndex(b.workflow)).toBeNull();
  });

  it("une même personne ne décide pas deux étapes, même si elle détient les deux fonctions", () => {
    const circuit: WorkflowCircuit = { ...DEFAULT_CIRCUIT, steps: DEFAULT_CIRCUIT.steps.map((s) => ({ ...s, functions: ["DIRECTEUR_CA", "CONTRE_ETUDE"], minRole: "ANALYST" as const })) };
    const w = applyDecision(startWorkflow(circuit, 1), dca, "APPROVED", null, AT).workflow;
    expect(stepBlocker(w, dca, [])).toMatch(/déjà décidé/);
    expect(stepConcerns(w, dca)).toBe(false);
  });

  it("un contributeur du dossier ne décide d'aucune étape", () => {
    const w = startWorkflow(DEFAULT_CIRCUIT, 1);
    expect(stepBlocker(w, dca, ["dca"])).toMatch(/séparation des fonctions/);
  });

  it("le rôle minimal de l'étape s'applique en plus de la fonction", () => {
    const w = applyDecision(startWorkflow(DEFAULT_CIRCUIT, 1), dca, "APPROVED", null, AT).workflow;
    expect(stepBlocker(w, { name: "ce2", role: "ANALYST", jobFunction: "CONTRE_ETUDE" }, [])).toMatch(/Gestionnaire des risques au moins/);
  });

  it("un rejet à la première étape clôt le dossier", () => {
    const r = applyDecision(startWorkflow(DEFAULT_CIRCUIT, 1), dca, "REJECTED", "Ratios non justifiés", AT);
    expect(r.status).toBe("REJECTED");
    expect(pendingStepIndex(r.workflow)).toBeNull();
  });
});

describe("Circuit paramétré", () => {
  const withCommittee: WorkflowCircuit = {
    ...DEFAULT_CIRCUIT,
    steps: [...DEFAULT_CIRCUIT.steps, { code: "COMITE", labelFr: "Comité de crédit", functions: ["COMITE_CREDIT"], minRole: "RISK_MANAGER", aboveExposure: 50_000_000 }],
  };

  it("une étape à seuil ne s'ajoute qu'au-delà du seuil, et toujours si l'exposition est inconnue", () => {
    expect(startWorkflow(withCommittee, 10_000_000).steps).toHaveLength(2);
    expect(startWorkflow(withCommittee, 80_000_000).steps).toHaveLength(3);
    expect(startWorkflow(withCommittee, null).steps).toHaveLength(3);
  });

  it("la délégation par montant relève le rôle de la dernière étape", () => {
    const w = startWorkflow(DEFAULT_CIRCUIT, 20_000_000, { threshold: 10_000_000, role: "ADMIN" });
    expect(w.steps[1].minRole).toBe("ADMIN");
    expect(startWorkflow(DEFAULT_CIRCUIT, 5_000_000, { threshold: 10_000_000, role: "ADMIN" }).steps[1].minRole).toBe("RISK_MANAGER");
  });

  it("refuse un circuit incohérent", () => {
    expect(checkCircuit(DEFAULT_CIRCUIT)).toEqual([]);
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [] }).join(" ")).toMatch(/au moins une étape/);
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [{ ...DEFAULT_CIRCUIT.steps[0], functions: ["INCONNUE"] }] }).join(" ")).toMatch(/fonction inconnue/);
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [DEFAULT_CIRCUIT.steps[0], DEFAULT_CIRCUIT.steps[0]] }).join(" ")).toMatch(/double/);
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [{ ...DEFAULT_CIRCUIT.steps[0], aboveExposure: 1000 }] }).join(" ")).toMatch(/aucun valideur/);
  });
});

describe("Exposition d'un dossier créé par l'API (diagnostic C01)", () => {
  it("lit le montant transmis par l'API, pas seulement celui de l'écran", () => {
    expect(exposureOf(null, JSON.stringify({ apiRequest: { segmentationData: { globalBankExposure: 100_000_000 } } }))).toBe(100_000_000);
    expect(exposureOf(null, JSON.stringify({ amounts: { globalBankExposure: "2 500 000" } }))).toBe(2_500_000);
    expect(exposureOf(null, "{}")).toBeNull();
  });
});
