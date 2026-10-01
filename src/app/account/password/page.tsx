import { redirect } from "next/navigation";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";
import { getCurrentSession } from "@/lib/session";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <div style={{ maxWidth: 460, margin: "40px auto" }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          {session.mustChangePassword ? "Choisissez votre mot de passe" : "Changer de mot de passe"}
        </h1>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          {session.mustChangePassword
            ? "Le mot de passe qui vous a été remis est provisoire : remplacez-le avant d'accéder à l'outil. "
            : ""}
          Au moins {PASSWORD_MIN_LENGTH} caractères, sans reprendre votre identifiant. Une phrase
          de plusieurs mots est plus sûre et plus facile à retenir qu&apos;un mot court et
          compliqué. Vos autres sessions ouvertes seront fermées.
        </p>
        <ChangePasswordForm username={session.identity.name} />
      </div>
    </div>
  );
}
