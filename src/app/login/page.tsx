import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Déjà connecté : inutile de redemander l'identité.
  const session = await getCurrentSession();
  if (session) redirect(session.mustChangePassword ? "/account/password" : "/");
  return <LoginForm />;
}
