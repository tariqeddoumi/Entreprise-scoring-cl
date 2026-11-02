import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { loadParamVersions } from "@/lib/model-params";
import { effectiveScale, today } from "@/lib/rating-scale";
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
  const day = today();
  const [scale, paramVersions] = await Promise.all([effectiveScale(day, { fresh: true }), loadParamVersions({ fresh: true })]);
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
      href: "/admin/settings",
      title: "Paramétrage",
      value: ai.enabled ? (ai.missing ? "IA activée, non configurée" : "IA activée") : "IA désactivée",
      text: "Circuit de validation, délégation par montant, dérogations, pièces, intelligence artificielle.",
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
