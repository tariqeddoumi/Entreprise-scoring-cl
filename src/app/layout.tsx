import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scoring Entreprises Maroc — TPE / PME / GE",
  description:
    "Plateforme de notation interne des contreparties entreprises non financières au Maroc (BAM, IFRS 9, Bâle II/III).",
};

const NAV = [
  { href: "/", label: "Tableau de bord" },
  { href: "/counterparties", label: "Contreparties" },
  { href: "/scoring", label: "Nouvelle notation" },
  { href: "/models", label: "Modèles" },
  { href: "/methodology", label: "Méthodologie" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <header
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            padding: "0 24px",
          }}
        >
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: 32,
              height: 56,
            }}
          >
            <Link
              href="/"
              style={{ fontWeight: 700, color: "var(--brand)", fontSize: 15 }}
            >
              Scoring Entreprises · Maroc
            </Link>
            <nav style={{ display: "flex", gap: 20 }}>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} style={{ color: "var(--muted)" }}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px" }}>
          {children}
        </main>
        <footer
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "16px 24px 40px",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          Modèle expert seed non calibré (pd_status = UNCALIBRATED). Les seuils ne
          constituent ni des règles Bank Al-Maghrib ni des paramètres IFRS 9 : ils
          doivent être calibrés, validés indépendamment et approuvés avant tout usage
          contraignant.
        </footer>
      </body>
    </html>
  );
}
