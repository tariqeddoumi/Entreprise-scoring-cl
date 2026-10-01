"use server";

import { redirect } from "next/navigation";
import { AccountError, changeOwnPassword } from "@/lib/accounts";
import { getCurrentSession } from "@/lib/session";

export async function changePasswordAction(
  _prev: { errorFr?: string } | undefined,
  formData: FormData
): Promise<{ errorFr?: string }> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) {
    return { errorFr: "Les deux saisies du nouveau mot de passe diffèrent." };
  }

  try {
    await changeOwnPassword(session, current, next);
  } catch (e) {
    if (e instanceof AccountError) return { errorFr: e.message };
    return { errorFr: "Changement impossible : la base de données ne répond pas." };
  }
  redirect("/");
}
