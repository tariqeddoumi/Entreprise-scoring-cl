"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Tableau de bord" },
  { href: "/counterparties", label: "Contreparties" },
  { href: "/scoring", label: "Nouvelle notation" },
  { href: "/models", label: "Modèles" },
  { href: "/methodology", label: "Méthodologie" },
];

/** Repère visuel de la page courante — un utilisateur qui navigue entre sept
 * écrans doit pouvoir savoir où il se trouve sans lire l'URL. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav style={{ display: "flex", gap: 20 }}>
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            style={{
              color: active ? "var(--brand)" : "var(--muted)",
              fontWeight: active ? 600 : 400,
              borderBottom: active ? "2px solid var(--brand)" : "2px solid transparent",
              paddingBottom: 2,
            }}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
