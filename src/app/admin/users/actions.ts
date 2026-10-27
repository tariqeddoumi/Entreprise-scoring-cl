"use server";

import { revalidatePath } from "next/cache";
import {
  AccountError,
  createUser,
  resetUserPassword,
  setUserActive,
  setUserEntity,
  setUserRole,
} from "@/lib/accounts";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface AdminActionState {
  okFr?: string;
  errorFr?: string;
  /** Affiché une seule fois : il n'est conservé nulle part en clair. */
  temporaryPassword?: { username: string; value: string };
}

/**
 * Point d'entrée unique des opérations d'administration des comptes.
 * Une action serveur est un point d'accès public : le rôle ADMIN est
 * revérifié ici à chaque appel, quel que soit l'écran qui l'a déclenchée.
 */
export async function adminUsersAction(
  _prev: AdminActionState | undefined,
  formData: FormData
): Promise<AdminActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  const actor = session.identity;
  const scope = await getPerimeter();
  const entityOf = (v: FormDataEntryValue | null) => (v ? String(v) : null);

  const op = String(formData.get("op") ?? "");
  const userId = String(formData.get("userId") ?? "");

  try {
    switch (op) {
      case "create": {
        const created = await createUser(actor, scope, {
          username: String(formData.get("username") ?? ""),
          displayName: String(formData.get("displayName") ?? ""),
          role: String(formData.get("role") ?? ""),
          entityId: entityOf(formData.get("entityId")),
          writeScope: String(formData.get("writeScope") ?? "ENTITY"),
        });
        revalidatePath("/admin/users");
        return {
          okFr: `Compte « ${created.username} » créé.`,
          temporaryPassword: { username: created.username, value: created.temporaryPassword },
        };
      }
      case "reset": {
        const reset = await resetUserPassword(actor, scope, userId);
        revalidatePath("/admin/users");
        return {
          okFr: `Mot de passe de « ${reset.username} » réinitialisé ; ses sessions sont fermées.`,
          temporaryPassword: { username: reset.username, value: reset.temporaryPassword },
        };
      }
      case "role":
        await setUserRole(actor, scope, userId, String(formData.get("role") ?? ""));
        revalidatePath("/admin/users");
        return { okFr: "Rôle modifié." };
      case "deactivate":
      case "reactivate":
        await setUserActive(actor, scope, userId, op === "reactivate");
        revalidatePath("/admin/users");
        return { okFr: op === "reactivate" ? "Compte réactivé." : "Compte désactivé ; ses sessions sont fermées." };
      case "entity":
        await setUserEntity(
          actor,
          scope,
          userId,
          entityOf(formData.get("entityId")),
          String(formData.get("writeScope") ?? "ENTITY")
        );
        revalidatePath("/admin/users");
        return { okFr: "Rattachement modifié ; les sessions du compte sont fermées." };
      default:
        return { errorFr: "Opération inconnue." };
    }
  } catch (e) {
    if (e instanceof AccountError) return { errorFr: e.message };
    return { errorFr: "Opération impossible : la base de données ne répond pas." };
  }
}
