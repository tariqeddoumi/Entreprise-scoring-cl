"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_SECTIONS = [
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/entities", label: "Banques et filiales" },
  { href: "/admin/currencies", label: "Devises" },
  { href: "/admin/settings", label: "Paramétrage" },
];

/** Onglets des écrans d'administration. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs no-print" aria-label="Administration">
      <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined}>
        Vue d&apos;ensemble
      </Link>
      {ADMIN_SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={pathname.startsWith(s.href) ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
