"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Tableau de bord" },
  { href: "/cases", label: "Dossiers" },
  { href: "/counterparties", label: "Clients" },
  { href: "/groups", label: "Groupes" },
  { href: "/scoring", label: "Nouvelle notation" },
  { href: "/renotation", label: "Renotation" },
  { href: "/models", label: "Modèles" },
  { href: "/methodology", label: "Méthodologie" },
];

const ADMIN_NAV = [{ href: "/admin", label: "Administration" }];

/** Repère visuel de la page courante — un utilisateur qui navigue entre sept
 * écrans doit pouvoir savoir où il se trouve sans lire l'URL. */
export function NavLinks({ role }: { role: string }) {
  const pathname = usePathname();
  // L'entrée n'est qu'une commodité : l'écran vérifie lui-même le rôle.
  const items = role === "ADMIN" ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <nav className="site-nav" aria-label="Navigation principale">
      {items.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
