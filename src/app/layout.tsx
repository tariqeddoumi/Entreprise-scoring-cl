import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSession } from "@/lib/session";
import { databaseConfigProblem } from "@/lib/env";
import { inheritedBranding, loadTree } from "@/lib/scope";
import { listModels } from "@/models";
import { logoutAction } from "./login/actions";
import { NavLinks } from "./nav-links";
import { TableFocus } from "./TableFocus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notation des entreprises — Groupe Banque Populaire",
  description:
    "Plateforme de notation interne des clients entreprises non financières au Maroc (BAM, IFRS 9, Bâle II/III).",
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

/**
 * Couleur de l'entité (Administration › Banques et filiales). Elle devient la
 * couleur des boutons et liens si son contraste avec le blanc atteint 4,5:1 ;
 * sinon (orange vif, couleur claire), elle ne colore que les éléments
 * décoratifs — bandeau, filets, onglet actif — et la charte garde un orange
 * assombri lisible.
 */
function brandStyle(color: string | null): React.CSSProperties | undefined {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  const contrast = 1.05 / (l + 0.05);
  return (contrast >= 4.5 ? { "--brand": color, "--accent": color } : { "--accent": color }) as unknown as React.CSSProperties;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();
  const ready = session !== null && !session.mustChangePassword;
  // Habillage de la banque ou filiale de l'utilisateur, hérité de son
  // ascendance : nom de l'outil, logo, couleur principale.
  let branding: ReturnType<typeof inheritedBranding> | null = null;
  if (session?.identity.entityId) {
    try {
      branding = inheritedBranding(await loadTree(), session.identity.entityId);
    } catch {
      branding = null;
    }
  }
  const models = listModels();
  // Configuration de la base contrôlée à chaque écran : « Base non connectée »
  // seul ne disait pas que la variable DATABASE_URL était mal saisie.
  const dbProblem = databaseConfigProblem();

  return (
    <html lang="fr">
      <body style={brandStyle(branding?.primaryColor ?? null)}>
        <div className="site-band no-print" aria-hidden="true" />
        <header
          className="no-print"
          style={{
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            padding: "0 24px",
          }}
        >
          <div className="site-header">
            <Link href="/" className="site-brand" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding?.logoUrl ?? "/groupe-bcp-logo.png"}
                alt={branding?.logoUrl ? "" : "Groupe Banque Populaire"}
                style={{ height: 30, width: "auto" }}
              />
              {branding?.toolName ?? "Notation des entreprises"}
              {branding?.entityName && (
                <span className="muted site-entity" style={{ fontSize: 12, fontWeight: 400 }}>
                  {branding.entityName}
                </span>
              )}
            </Link>
            {ready && <NavLinks role={session.identity.role} />}
            <div className="site-user">
              {session ? (
                <>
                  <Link
                    href="/account/password"
                    className="muted"
                    style={{ fontSize: 12 }}
                    title="Changer de mot de passe"
                  >
                    {session.displayName} · {session.identity.role}
                  </Link>
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
        <main className="site-main">
          <TableFocus />
          {dbProblem && (
            <div className="card no-print" role="alert" style={{ padding: 12, marginBottom: 16, borderLeft: "4px solid var(--bad)", fontSize: 13 }}>
              <strong>Configuration de la base invalide.</strong> {dbProblem}
            </div>
          )}
          {children}
        </main>
        <footer className="no-print site-footer">
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
