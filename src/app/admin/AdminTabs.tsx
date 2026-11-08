"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_SECTIONS = [
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/entities", label: "Banques et filiales" },
  { href: "/admin/currencies", label: "Devises" },
  { href: "/admin/grilles", label: "Paramétrage des grilles" },
  { href: "/admin/scale", label: "Échelle de notation" },
  { href: "/admin/bilan", label: "Format du bilan" },
  { href: "/admin/settings", label: "Paramétrage" },
  { href: "/admin/raccordements", label: "Raccordements" },
  { href: "/admin/reprise", label: "Reprise du stock" },
  { href: "/admin/journal", label: "Journal d'audit" },
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
