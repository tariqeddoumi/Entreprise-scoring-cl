"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";

/** Durée de la session applicative, en secondes. */
const SESSION_MAX_AGE = 8 * 60 * 60;

export async function loginAction(
  _prev: { errorFr?: string } | undefined,
  formData: FormData
): Promise<{ errorFr?: string }> {
  const key = String(formData.get("apiKey") ?? "").trim();
  if (!key) {
    return { errorFr: "Saisissez votre clé d'accès." };
  }

  // La clé est vérifiée contre le référentiel serveur ; aucun rôle n'est
  // accepté depuis le formulaire.
  const auth = authenticateToken(key, "READONLY");
  if (!auth.ok) {
    // Message volontairement générique : ne pas indiquer si la clé existe.
    return { errorFr: "Clé d'accès invalide." };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, key, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
