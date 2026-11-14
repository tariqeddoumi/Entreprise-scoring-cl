import type { PrismaClient, Prisma } from "@/generated/prisma";
import { hasRole, type Identity } from "./auth";
import { caseWorkflow } from "./cases";
import { pendingStepIndex, stepConcerns } from "@/reference/workflow";

/**
 * Ce qui attend l'utilisateur : ses brouillons, ses dossiers rejetés à
 * reprendre, et les dossiers soumis dont l'étape en attente lui revient
 * (fonction et rôle). Même règle pour l'onglet « À traiter » des dossiers et
 * pour le tableau de bord.
 */

export function todoWhere(identity: Identity): Prisma.RatingCaseWhereInput {
  const decider = hasRole(identity.role, "ANALYST");
  return {
    OR: [
      { status: { in: ["DRAFT", "REJECTED"] }, createdBy: identity.name },
      ...(decider ? [{ status: "SUBMITTED", submittedBy: { not: identity.name } }] : []),
    ],
  };
}

type CaseLike = { id: string; status: string; workflow: string | null; fxDetail: string | null; draftInput: string };

/** Étape en attente de chaque dossier soumis, et ceux qui reviennent à l'utilisateur. */
export async function pendingSteps<T extends CaseLike>(cases: T[], identity: Identity): Promise<{ stepOf: Map<string, string>; mine: Set<string> }> {
  const actor = { name: identity.name, role: identity.role, jobFunction: identity.jobFunction ?? null };
  const stepOf = new Map<string, string>();
  const mine = new Set<string>();
  for (const c of cases) {
    if (c.status !== "SUBMITTED") continue;
    const w = await caseWorkflow(c);
    const i = pendingStepIndex(w);
    if (i !== null) stepOf.set(c.id, `${w.steps[i].labelFr} (${i + 1}/${w.steps.length})`);
    if (stepConcerns(w, actor)) mine.add(c.id);
  }
  return { stepOf, mine };
}

export interface WorkItem {
  id: string;
  status: string;
  counterpartyName: string;
  updatedAt: Date;
  step: string | null;
}

/** Dossiers qui attendent l'utilisateur, les plus récents d'abord. */
export async function myWork(db: PrismaClient, identity: Identity, take = 200): Promise<WorkItem[]> {
  const cases = await db.ratingCase.findMany({
    where: todoWhere(identity),
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, status: true, workflow: true, fxDetail: true, draftInput: true, updatedAt: true, counterparty: { select: { name: true } } },
  });
  const { stepOf, mine } = await pendingSteps(cases, identity);
  return cases
    .filter((c) => c.status !== "SUBMITTED" || mine.has(c.id))
    .map((c) => ({ id: c.id, status: c.status, counterpartyName: c.counterparty.name, updatedAt: c.updatedAt, step: stepOf.get(c.id) ?? null }));
}
