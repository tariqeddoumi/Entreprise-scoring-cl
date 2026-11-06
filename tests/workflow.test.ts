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
  hasPermission,
  type WorkflowCircuit,
} from "@/reference/workflow";

const AT = new Date("2026-11-02T10:00:00Z");
/** Circuit enregistré avant les avis : deux validations successives. */
const LEGACY: WorkflowCircuit = {
  ...DEFAULT_CIRCUIT,
  steps: [
    { code: "DIRECTEUR_CA", labelFr: "Validation du directeur du centre d'affaires", functions: ["DIRECTEUR_CA"], minRole: "ANALYST" },
    { code: "CONTRE_ETUDE", labelFr: "Contre-étude : validation finale", functions: ["CONTRE_ETUDE"], minRole: "RISK_MANAGER" },
  ],
};
const dca = { name: "dca", role: "ANALYST", jobFunction: "DIRECTEUR_CA" };
const ce = { name: "ce", role: "RISK_MANAGER", jobFunction: "CONTRE_ETUDE" };
const ca = { name: "ca", role: "ANALYST", jobFunction: "CHARGE_AFFAIRES" };

describe("Circuit antérieur aux avis : directeur du centre d'affaires, puis contre-étude", () => {
  it("valide en deux étapes, par deux personnes de fonctions différentes", () => {
    let w = startWorkflow(LEGACY, 5_000_000);
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
    const circuit: WorkflowCircuit = { ...LEGACY, steps: LEGACY.steps.map((s) => ({ ...s, functions: ["DIRECTEUR_CA", "CONTRE_ETUDE"], minRole: "ANALYST" as const })) };
    const w = applyDecision(startWorkflow(circuit, 1), dca, "APPROVED", null, AT).workflow;
    expect(stepBlocker(w, dca, [])).toMatch(/déjà décidé/);
    expect(stepConcerns(w, dca)).toBe(false);
  });

  it("un contributeur du dossier ne décide d'aucune étape", () => {
    const w = startWorkflow(LEGACY, 1);
    expect(stepBlocker(w, dca, ["dca"])).toMatch(/séparation des fonctions/);
  });

  it("le rôle minimal de l'étape s'applique en plus de la fonction", () => {
    const w = applyDecision(startWorkflow(LEGACY, 1), dca, "APPROVED", null, AT).workflow;
    expect(stepBlocker(w, { name: "ce2", role: "ANALYST", jobFunction: "CONTRE_ETUDE" }, [])).toMatch(/Gestionnaire des risques au moins/);
  });

  it("un rejet à la première étape clôt le dossier", () => {
    const r = applyDecision(startWorkflow(LEGACY, 1), dca, "REJECTED", "Ratios non justifiés", AT);
    expect(r.status).toBe("REJECTED");
    expect(pendingStepIndex(r.workflow)).toBeNull();
  });
});

describe("Circuit paramétré", () => {
  const withCommittee: WorkflowCircuit = {
    ...LEGACY,
    steps: [...LEGACY.steps, { code: "COMITE", labelFr: "Comité de crédit", functions: ["COMITE_CREDIT"], minRole: "RISK_MANAGER", aboveExposure: 50_000_000 }],
  };

  it("une étape à seuil ne s'ajoute qu'au-delà du seuil, et toujours si l'exposition est inconnue", () => {
    expect(startWorkflow(withCommittee, 10_000_000).steps).toHaveLength(2);
    expect(startWorkflow(withCommittee, 80_000_000).steps).toHaveLength(3);
    expect(startWorkflow(withCommittee, null).steps).toHaveLength(3);
  });

  it("la délégation par montant relève le rôle de la dernière étape", () => {
    const w = startWorkflow(LEGACY, 20_000_000, { threshold: 10_000_000, role: "ADMIN" });
    expect(w.steps[1].minRole).toBe("ADMIN");
    expect(startWorkflow(LEGACY, 5_000_000, { threshold: 10_000_000, role: "ADMIN" }).steps[1].minRole).toBe("RISK_MANAGER");
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

describe("Avis, niveaux de décision et conditions (D-57)", () => {
  const rce = { name: "rce", role: "RISK_MANAGER", jobFunction: "RESPONSABLE_CE" };

  it("avis du directeur non bloquant : la contre-étude décide sans l'attendre, une seule décision", () => {
    const w = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 5_000_000, grade: "4", creditType: "FONCTIONNEMENT", tier: "NORMALE" });
    expect(w.steps.map((s) => `${s.code}:${s.kind}:${s.blocking ? "B" : "-"}`)).toEqual(["DIRECTEUR_CA:AVIS:-", "CONTRE_ETUDE:DECISION:-"]);
    expect(stepBlocker(w, ce, [])).toBeNull();
    const r = applyDecision(w, ce, "APPROVED", null, AT);
    expect(r.status).toBe("VALIDATED");
    expect(r.final).toBe(true);
  });

  it("avis rendu : favorable ou défavorable, sans clore le dossier", () => {
    const w = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 5_000_000, grade: "4", tier: "NORMALE" });
    const a = applyDecision(w, dca, "REJECTED", "Réserve sur le BFR", AT);
    expect(a.status).toBe("SUBMITTED");
    expect(a.workflow.decisions[0].decision).toBe("DEFAVORABLE");
    expect(applyDecision(a.workflow, ce, "APPROVED", null, AT).status).toBe("VALIDATED");
  });

  it("centre en délégation restreinte : l'avis du directeur devient bloquant", () => {
    const w = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 5_000_000, grade: "4", tier: "RESTREINTE" });
    expect(w.steps[0].blocking).toBe(true);
    expect(stepBlocker(w, ce, [])).toMatch(/revient à : Directeur du centre/);
    expect(startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 5_000_000, grade: "4", tier: null }).steps[0].blocking).toBe(true);
  });

  it("au-delà du seuil ou pour une note dégradée, la décision remonte ; le niveau inférieur instruit", () => {
    const big = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 30_000_000, grade: "4", tier: "NORMALE" });
    expect(big.steps.map((s) => `${s.code}:${s.kind}`)).toEqual(["DIRECTEUR_CA:AVIS", "CONTRE_ETUDE:AVIS", "RESPONSABLE_CE:DECISION"]);
    expect(big.steps[1].instruction).toBe(true);
    expect(big.steps[1].blocking).toBe(true);
    // Le responsable ne décide qu'après l'instruction de la contre-étude.
    expect(stepBlocker(big, rce, [])).toBeNull();
    const step1 = applyDecision(big, rce, "APPROVED", "Instruction favorable", AT);
    expect(step1.step.code).toBe("CONTRE_ETUDE");
    expect(step1.status).toBe("SUBMITTED");
    const other = { name: "rce2", role: "RISK_MANAGER", jobFunction: "RESPONSABLE_CE" };
    const fin = applyDecision(step1.workflow, other, "APPROVED", null, AT);
    expect(fin.step.code).toBe("RESPONSABLE_CE");
    expect(fin.status).toBe("VALIDATED");
    const weak = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: 1_000_000, grade: "8", tier: "NORMALE" });
    expect(weak.steps.at(-1)?.code).toBe("RESPONSABLE_CE");
    const unknown = startWorkflow(DEFAULT_CIRCUIT, { exposureBase: null, grade: "3", tier: "NORMALE" });
    expect(unknown.steps.at(-1)?.code).toBe("RESPONSABLE_CE");
  });

  it("type de crédit et combinaison « toutes les conditions »", () => {
    const c: WorkflowCircuit = {
      ...DEFAULT_CIRCUIT,
      steps: [DEFAULT_CIRCUIT.steps[1], { ...DEFAULT_CIRCUIT.steps[2], aboveExposure: 10_000_000, minGrade: null, creditTypes: ["INVESTISSEMENT"], conditionMode: "ALL" }],
    };
    expect(startWorkflow(c, { exposureBase: 20_000_000, creditType: "INVESTISSEMENT", grade: "3" }).steps).toHaveLength(2);
    expect(startWorkflow(c, { exposureBase: 20_000_000, creditType: "FONCTIONNEMENT", grade: "3" }).steps).toHaveLength(1);
    expect(startWorkflow(c, { exposureBase: 5_000_000, creditType: "INVESTISSEMENT", grade: "3" }).steps).toHaveLength(1);
  });

  it("refuse une décision suivie d'un avis, ou des décisions toutes conditionnelles", () => {
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [DEFAULT_CIRCUIT.steps[1], DEFAULT_CIRCUIT.steps[0]] }).join(" ")).toMatch(/viennent en dernier/);
    expect(checkCircuit({ ...DEFAULT_CIRCUIT, steps: [DEFAULT_CIRCUIT.steps[0], DEFAULT_CIRCUIT.steps[2]] }).join(" ")).toMatch(/sans condition/);
  });

  it("droits des profils : levée et watch list", () => {
    expect(hasPermission(DEFAULT_CIRCUIT, "SURVEILLANCE", "DECIDER_WL")).toBe(true);
    expect(hasPermission(DEFAULT_CIRCUIT, "CONTRE_ETUDE", "LEVER_CRITERE")).toBe(true);
    expect(hasPermission(DEFAULT_CIRCUIT, "CHARGE_AFFAIRES", "LEVER_CRITERE")).toBe(false);
    expect(hasPermission(DEFAULT_CIRCUIT, null, "LEVER_CRITERE")).toBe(false);
  });
});
