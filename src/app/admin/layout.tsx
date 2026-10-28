import { requireSession } from "@/lib/session";
import { AdminTabs } from "./AdminTabs";

/** Écrans d'administration : réservés au rôle ADMIN, chaque page revérifie ses droits. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSession("ADMIN");
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <AdminTabs />
      {children}
    </div>
  );
}
