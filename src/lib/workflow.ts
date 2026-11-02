import { DEFAULT_CIRCUIT, parseCircuit, type WorkflowCircuit } from "@/reference/workflow";
import { prisma } from "./prisma";

/**
 * Circuit de validation en vigueur, enregistré dans le paramétrage
 * (`app_settings`, clé WORKFLOW_CIRCUIT). Sans enregistrement, le circuit par
 * défaut s'applique : directeur du centre d'affaires, puis contre-étude.
 */
export const WORKFLOW_CIRCUIT_KEY = "WORKFLOW_CIRCUIT";

const TTL_MS = 30_000;
let cache: { circuit: WorkflowCircuit; stored: boolean; expires: number } | null = null;

export async function loadCircuit(opts: { fresh?: boolean } = {}): Promise<{ circuit: WorkflowCircuit; stored: boolean }> {
  if (!opts.fresh && cache && cache.expires > Date.now()) return cache;
  let circuit: WorkflowCircuit = DEFAULT_CIRCUIT;
  let stored = false;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: WORKFLOW_CIRCUIT_KEY } });
    const parsed = parseCircuit(row?.value);
    if (parsed) {
      circuit = parsed;
      stored = true;
    }
  } catch {
    // Base indisponible : circuit par défaut, le plus exigeant.
  }
  cache = { circuit, stored, expires: Date.now() + TTL_MS };
  return cache;
}

export function forgetCircuit(): void {
  cache = null;
}

/** Libellé d'une fonction, ou son code. */
export function functionLabel(circuit: WorkflowCircuit, code: string | null | undefined): string {
  if (!code) return "—";
  return circuit.functions.find((f) => f.code === code)?.labelFr ?? code;
}
