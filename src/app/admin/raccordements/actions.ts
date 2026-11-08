"use server";

import { revalidatePath } from "next/cache";
import { INTEGRATIONS, testIntegration, type IntegrationCode, type IntegrationTest } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface TestActionState {
  errorFr?: string;
  test?: IntegrationTest;
}

/** Test de connexion d'un raccordement : réservé à un administrateur du groupe, journalisé. */
export async function testIntegrationAction(_prev: TestActionState | undefined, fd: FormData): Promise<TestActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  if (!(await getPerimeter()).all) return { errorFr: "Réservé à un administrateur du groupe." };
  const code = String(fd.get("code") ?? "") as IntegrationCode;
  if (!INTEGRATIONS.some((d) => d.code === code)) return { errorFr: "Raccordement inconnu." };
  try {
    const test = await testIntegration(prisma, session.identity, code, String(fd.get("sample") ?? ""));
    revalidatePath("/admin/raccordements");
    return { test };
  } catch (e) {
    console.error("[raccordements]", e instanceof Error ? e.message : e);
    return { errorFr: "Test impossible : la base de données ne répond pas." };
  }
}
