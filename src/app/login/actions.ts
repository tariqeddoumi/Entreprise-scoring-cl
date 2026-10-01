"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, SESSION_TTL_MS } from "@/lib/accounts";
import { SESSION_COOKIE } from "@/lib/session";

export async function loginAction(
  _prev: { errorFr?: string } | undefined,
  formData: FormData
): Promise<{ errorFr?: string }> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username.trim() || !password) {
    return { errorFr: "Saisissez votre identifiant et votre mot de passe." };
  }
  if (password.length > 1024) {
    return { errorFr: "Identifiant ou mot de passe incorrect." };
  }

  let result: Awaited<ReturnType<typeof login>>;
  try {
    result = await login(username, password, (await headers()).get("user-agent") ?? undefined);
  } catch {
    return {
      errorFr: "Service d'authentification indisponible : la base de données ne répond pas.",
    };
  }
  if (!result.ok) return { errorFr: result.errorFr };

  const store = await cookies();
  store.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect(result.mustChangePassword ? "/account/password" : "/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  try {
    // Révocation côté serveur : un cookie copié avant la déconnexion ne
    // rouvre plus rien.
    await logout(store.get(SESSION_COOKIE)?.value);
  } catch {
    // Base injoignable : le cookie est supprimé quand même, la session
    // expirera d'elle-même.
  }
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
