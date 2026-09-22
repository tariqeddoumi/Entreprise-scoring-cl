import type { Metadata } from "next";
import Link from "next/link";
import { getSessionIdentity } from "@/lib/session";
import { listModels } from "@/models";
import { logoutAction } from "./login/actions";
import { NavLinks } from "./nav-links";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scoring Entreprises Maroc — TPE / PME / GE",
  description:
    "Plateforme de notation interne des contreparties entreprises non financières au Maroc (BAM, IFRS 9, Bâle II/III).",
};

/**
 * Résumé exact de l'état de calibration des modèles publiés, calculé plutôt
 * qu'affirmé : un texte figé aurait pu continuer à dire « non calibré » après
 * l'attachement d'une calibration, comme c'est arrivé pour la carte de
 * statistique du tableau de bord.
 */
function calibrationFooterFr(models: ReturnType<typeof listModels>): string {
  const observed = models.filter((m) => m.calibration?.dataSource === "OBSERVED").length;
  const synthetic = models.filter((m) => m.calibration?.dataSource === "SYNTHETIC").length;
  const none = models.length - observed - synthetic;
  const parts: string[] = [];
  if (observed > 0) parts.push(`${observed} calibré(s) sur défauts observés`);
  if (synthetic > 0) parts.push(`${synthetic} calibré(s) sur données simulées uniquement`);
  if (none > 0) parts.push(`${none} non calibré(s)`);
  return `Modèles publiés : ${parts.join(", ")}.`;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionIdentity("READONLY");
  const models = listModels();

  return (
    <html lang="fr">
      <body>
        <header
          className="no-print"
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
            <NavLinks />
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              {session.ok ? (
                <>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {session.identity.name} · {session.identity.role}
                  </span>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        color: "var(--muted)",
                        fontSize: 12,
                      }}
                    >
                      Déconnexion
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" style={{ color: "var(--brand)", fontSize: 13 }}>
                  Se connecter
                </Link>
              )}
            </div>
          </div>
        </header>
        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px" }}>
          {children}
        </main>
        <footer
          className="no-print"
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "16px 24px 40px",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          {calibrationFooterFr(models)} Une calibration sur données simulées valide la
          chaîne de traitement, jamais le niveau réel du risque. Les seuils ne
          constituent ni des règles Bank Al-Maghrib ni des paramètres IFRS 9 tant
          qu&apos;ils n&apos;ont pas été calibrés sur historique réel, validés
          indépendamment et approuvés.
        </footer>
      </body>
    </html>
  );
}
