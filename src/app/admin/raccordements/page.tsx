import Link from "next/link";
import { integrationStates, TEST_VALIDITY_DAYS } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { getPerimeter, requireSession } from "@/lib/session";
import { IntegrationTester } from "./IntegrationTester";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Casablanca" });

/**
 * Mise en service des raccordements : état de chaque API, test de connexion
 * (même désactivée), et condition d'activation. Au démarrage, tout est
 * désactivé et l'outil fonctionne en saisie.
 */
export default async function IntegrationsPage() {
  await requireSession("ADMIN");
  const groupAdmin = (await getPerimeter()).all;
  const states = await integrationStates(prisma).catch(() => null);
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Raccordements</h1>
        <p className="muted">
          Au démarrage, toutes les API sont désactivées : l&apos;outil fonctionne en saisie (saisie minimale du client, saisie des lignes d&apos;engagement,
          rapport de solvabilité chargé ou saisi). Chaque API s&apos;active quand les tests de la DSI sont concluants :
        </p>
        <ol style={{ fontSize: 13, margin: "6px 0 0 18px", display: "grid", gap: 2 }}>
          <li>la DSI fournit l&apos;adresse de l&apos;API et dépose le jeton dans les variables d&apos;environnement du serveur ;</li>
          <li>
            l&apos;adresse et les chemins se renseignent dans <Link href="/admin/settings">Paramétrage</Link> › Référentiels externes ou OCR intelligent ;
          </li>
          <li>le test ci-dessous appelle l&apos;API avec un code réel, sans rien enregistrer ;</li>
          <li>
            l&apos;activation, dans Paramétrage, n&apos;est acceptée qu&apos;après un test réussi de moins de {TEST_VALIDITY_DAYS} jours sur la même adresse. La
            désactivation reste possible à tout moment : l&apos;outil repasse en saisie.
          </li>
        </ol>
      </div>
      {!groupAdmin && <p className="muted">Les tests et l&apos;activation sont réservés à un administrateur du groupe.</p>}
      {!states && <p className="muted">Base non connectée.</p>}
      {states?.map((s) => (
        <section key={s.def.code} className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
            <h2 style={{ fontWeight: 600 }}>{s.def.labelFr}</h2>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.enabled ? "var(--good)" : "var(--muted)" }}>
              {s.enabled ? "● Activée" : "○ Désactivée — saisie manuelle"}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {s.def.helpFr}
          </p>
          <dl style={{ display: "grid", gridTemplateColumns: "minmax(120px, max-content) 1fr", gap: "2px 12px", fontSize: 13, margin: 0, minWidth: 0 }}>
            {Object.entries(s.target).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt className="muted">{k}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v || <em className="muted">non renseigné</em>}</dd>
              </div>
            ))}
            <dt className="muted">Jeton</dt>
            <dd style={{ margin: 0 }}>{s.tokenPresent ? "présent dans les variables d'environnement" : <span style={{ color: "var(--warn)" }}>absent des variables d&apos;environnement</span>}</dd>
            <dt className="muted">Dernier test</dt>
            <dd style={{ margin: 0 }}>
              {s.lastTest ? (
                <span style={{ color: s.lastTest.ok ? "var(--good)" : "var(--bad)" }}>
                  {s.lastTest.ok ? "réussi" : "échoué"} le {fmt(s.lastTest.at)} par {s.lastTest.by}
                  {s.lastTest.sample ? ` (code ${s.lastTest.sample})` : ""} — <span className="muted">{s.lastTest.messageFr}</span>
                </span>
              ) : (
                <span className="muted">aucun</span>
              )}
            </dd>
            <dt className="muted">Activation</dt>
            <dd style={{ margin: 0 }}>
              {s.enabled ? "en service" : s.blocker ? <span className="muted">{s.blocker.replace(/^Activation « [^»]+» refusée : /, "pas encore possible : ")}</span> : <span style={{ color: "var(--good)" }}>possible dans Paramétrage</span>}
            </dd>
          </dl>
          {groupAdmin && <IntegrationTester code={s.def.code} sampleLabel={s.def.sampleLabelFr} />}
        </section>
      ))}
    </div>
  );
}
