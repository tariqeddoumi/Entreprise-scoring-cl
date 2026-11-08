import { requireSession } from "@/lib/session";
import { StockImport } from "./StockImport";

export const dynamic = "force-dynamic";

/**
 * Reprise du stock (point 4) : import de l'existant de l'ancien outil et du
 * système central — clients, notes historiques, bilans, watch list.
 */
export default async function StockPage() {
  await requireSession("ADMIN");
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Reprise du stock</h1>
        <p className="muted">
          Import de l&apos;existant : clients, notes historiques (validées par les comités), bilans des exercices passés et historique de watch list.
          Contrôle à blanc d&apos;abord, ligne par ligne ; import sur confirmation, journalisé avec l&apos;empreinte du classeur. Rien n&apos;est écrasé.
          Les notes reprises font foi : elles alimentent la surveillance, les matrices de migration et l&apos;ouverture des dossiers suivants.
        </p>
      </div>
      <section className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
        <h2 style={{ fontWeight: 600 }}>1. Préparer le classeur</h2>
        <p style={{ fontSize: 13 }}>
          <a href="/admin/reprise/modele" style={{ color: "var(--brand)" }}>
            Télécharger le modèle
          </a>{" "}
          (feuilles Clients, Notes, Bilans, Watch list, et mode d&apos;emploi avec la liste des postes du bilan). Les notes s&apos;expriment sur l&apos;échelle 1 à 10
          ou DEF1 à DEF3, avec la note et le modèle d&apos;origine pour la traçabilité ; la table de correspondance entre l&apos;ancienne et la nouvelle échelle est
          à valider en COPIL.
        </p>
      </section>
      <div>
        <h2 style={{ fontWeight: 600, marginBottom: 8 }}>2. Contrôler, puis importer</h2>
        <StockImport />
      </div>
    </div>
  );
}
