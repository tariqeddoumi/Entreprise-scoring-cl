"use server";

import { revalidatePath } from "next/cache";
import {
  createEntity,
  entityInputSchema,
  EntityError,
  setEntityActive,
  updateEntity,
} from "@/lib/entities";
import { getPerimeter, getSessionIdentity } from "@/lib/session";

export interface EntityActionState {
  okFr?: string;
  errorFr?: string;
}

const nullable = (v: FormDataEntryValue | null) => {
  const s = v === null ? "" : String(v).trim();
  return s === "" ? null : s;
};

function readInput(formData: FormData) {
  return entityInputSchema.safeParse({
    code: String(formData.get("code") ?? "").toUpperCase(),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    parentId: nullable(formData.get("parentId")),
    country: nullable(formData.get("country"))?.toUpperCase() ?? null,
    currency: String(formData.get("currency") ?? "").toUpperCase(),
    toolName: nullable(formData.get("toolName")),
    logoUrl: nullable(formData.get("logoUrl")),
    primaryColor: nullable(formData.get("primaryColor")),
  });
}

/** Administration de l'organisation ; rôle ADMIN revérifié à chaque appel. */
export async function entitiesAction(
  _prev: EntityActionState | undefined,
  formData: FormData
): Promise<EntityActionState> {
  const session = await getSessionIdentity("ADMIN");
  if (!session.ok) return { errorFr: session.reasonFr };
  const scope = await getPerimeter();
  const op = String(formData.get("op") ?? "");
  const id = String(formData.get("id") ?? "");

  try {
    if (op === "create" || op === "update") {
      const parsed = readInput(formData);
      if (!parsed.success) return { errorFr: parsed.error.issues.map((i) => i.message).join(" ; ") };
      if (op === "create") {
        const e = await createEntity(session.identity, scope, parsed.data);
        revalidatePath("/admin/entities");
        return { okFr: `Entité « ${e.name} » créée.` };
      }
      // Ni le code ni l'entité mère ne changent : ils figent le chemin et les références.
      const { code: _code, parentId: _parent, ...rest } = parsed.data;
      await updateEntity(session.identity, scope, id, rest);
      revalidatePath("/admin/entities");
      return { okFr: "Entité modifiée." };
    }
    if (op === "deactivate" || op === "reactivate") {
      await setEntityActive(session.identity, scope, id, op === "reactivate");
      revalidatePath("/admin/entities");
      return { okFr: op === "reactivate" ? "Entité réactivée." : "Entité désactivée : ses utilisateurs n'ont plus accès." };
    }
    return { errorFr: "Opération inconnue." };
  } catch (e) {
    if (e instanceof EntityError) return { errorFr: e.message };
    return { errorFr: "Opération impossible : la base de données ne répond pas." };
  }
}
