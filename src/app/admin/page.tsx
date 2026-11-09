import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { integrationStates } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { loadParamVersions } from "@/lib/model-params";
import { effectiveScale, today } from "@/lib/rating-scale";
import { effectiveFormat } from "@/lib/statement-format";
import { safeQuery } from "@/lib/safe-db";
import { getPerimeter, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Vue d'ensemble de l'administration : un point d'entrée par domaine. */
export default async function AdminHome() {
  await requireSession("ADMIN");
  const perimeter = await getPerimeter();
  const { data } = await safeQuery(
    async (db) => {
      const [users, entities, rates, settings] = await Promise.all([
        db.user.count({ where: { isActive: true } }),
        db.entity.count({ where: { isActive: true } }),
        db.exchangeRate.findMany({ distinct: ["currency"], select: { currency: true } }),
        db.appSetting.count(),
      ]);
      return { users, entities, currencies: rates.length, settings };
    },
    { users: 0, entities: 0, currencies: 0, settings: 0 }
  );
  const ai = await aiStatus();
  const integrations = await integrationStates(prisma).catch(() => [] as Awaited<ReturnType<typeof integrationStates>>);
  const day = today();
  const [scale, paramVersions, format] = await Promise.all([
    effectiveScale(day, { fresh: true }),
    loadParamVersions({ fresh: true }),
    effectiveFormat(day, { fresh: true }),
  ]);
  const inForce = new Set(paramVersions.filter((v) => v.effectiveFrom <= day).map((v) => v.modelId)).size;
  const upcoming = paramVersions.filter((v) => v.effectiveFrom > day).length;
  const cards = [
    { href: "/admin/users", title: "Utilisateurs", value: `${data.users} actif(s)`, text: "Comptes, rôles, rattachement à une banque ou filiale, réinitialisation des mots de passe." },
    { href: "/admin/entities", title: "Banques et filiales", value: `${data.entities} entité(s)`, text: "Organisation du groupe, devise et pays de chaque entité, habillage (nom, logo, couleur)." },
    { href: "/admin/currencies", title: "Devises", value: `${data.currencies} devise(s) cotée(s)`, text: "Cours de change datés vers le dirham, utilisés pour convertir les montants des dossiers." },
    {
      href: "/admin/grilles",
      title: "Paramétrage des grilles",
      value: inForce ? `${inForce} grille(s) paramétrée(s)` : "Grilles embarquées",
      text: `Poids, barèmes, repères, critères, exceptions, revues, confiance — versions datées${upcoming ? ` ; ${upcoming} version(s) à venir` : ""}.`,
    },
    {
      href: "/admin/scale",
      title: "Échelle de notation",
      value: `${scale.version} · ${scale.bands.length} classes`,
      text: "Bornes et libellés des classes 1 à 10, versions datées ; défaut hors échelle.",
    },
    {
      href: "/admin/bilan",
      title: "Format du bilan",
      value: format.version,
      text: "Postes chargés (complet, agrégé, notation seulement), postes propres à la banque, indicateurs par formule, seuils d'appréciation et alertes.",
    },
    {
      href: "/admin/settings",
      title: "Paramétrage",
      value: ai.enabled ? (ai.missing ? "OCR intelligent activé, non configuré" : "OCR intelligent activé") : "OCR intelligent désactivé",
      text: "Circuit de validation, délégation par montant, dérogations, pièces, intelligence artificielle, référentiels externes (T24, crédit bureau).",
    },
    {
      href: "/admin/raccordements",
      title: "Raccordements",
      value: `${integrations.filter((i) => i.enabled).length} API activée(s) sur ${integrations.length}`,
      text: "T24, crédit bureau, OCR intelligent : désactivés au démarrage, test de connexion sans enregistrement, activation après un test réussi.",
    },
    {
      href: "/admin/journal",
      title: "Journal d'audit",
      value: "Lecture seule",
      text: "Toutes les opérations tracées (dossiers, décisions, clients, comptes, connexions, paramétrage, tests des API), filtrables et exportables.",
    },
    {
      href: "/admin/reprise",
      title: "Reprise du stock",
      value: "Import Excel",
      text: "Clients, notes historiques, bilans et historique de watch list de l'existant : contrôle à blanc ligne par ligne, puis import journalisé, sans écrasement.",
    },
  ];
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Administration</h1>
        <p className="muted">
          {perimeter.all
            ? "Administrateur du groupe : le paramétrage, les devises et l'organisation s'appliquent à toutes les entités."
            : "Administrateur d'entité : vous gérez les comptes de votre périmètre ; le paramétrage global relève de l'administrateur du groupe."}
        </p>
      </div>
      <div className="admin-grid">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card admin-card">
            <span style={{ fontWeight: 700, color: "var(--brand)" }}>{c.title}</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</span>
            <span className="muted" style={{ fontSize: 13 }}>
              {c.text}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
