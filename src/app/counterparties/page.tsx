import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { OFFICIAL_RUN_WHERE } from "@/lib/cases";
import { safeQuery } from "@/lib/safe-db";
import { loadTree, sortTree, writableEntities } from "@/lib/scope";
import { getPerimeter, getSessionIdentity, requireSession } from "@/lib/session";
import { CounterpartiesTable, type CounterpartyRow } from "./CounterpartiesTable";
import { NewCounterpartyForm, type WritableEntity } from "./NewCounterpartyForm";

export const dynamic = "force-dynamic";

export default async function CounterpartiesPage() {
  // Toute page porteuse de données exige une session authentifiée.
  const identity = await requireSession();
  // La création exige le rôle ANALYST : le formulaire ne s'affiche donc que
  // pour les identités habilitées à écrire, comme le fait déjà l'API REST.
  const canCreate = (await getSessionIdentity("ANALYST")).ok;
  const perimeter = await getPerimeter();

  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      const [rows, tree] = await Promise.all([
        db.counterparty.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          include: {
            // Note courante : la dernière notation qui fait foi (validée, ou
            // antérieure au workflow), au dernier arrêté, la plus récente à
            // arrêté égal. Une notation soumise n'est qu'une proposition.
            ratingRuns: {
              where: OFFICIAL_RUN_WHERE,
              orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: { finalGrade: true, rawScore: true, asOfDate: true },
            },
            ratingCases: {
              where: { status: { in: ["DRAFT", "SUBMITTED"] } },
              take: 1,
              select: { status: true },
            },
          },
        }),
        loadTree(),
      ]);
      const code = new Map(tree.map((e) => [e.id, e.code]));
      const items: CounterpartyRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        ice: r.ice,
        segment: r.segment,
        sectorCode: r.sectorCode,
        entityCode: code.get(r.entityId) ?? "—",
        currency: r.currency,
        openCase: r.ratingCases[0]?.status ?? null,
        ratingRuns: r.ratingRuns,
      }));
      const writable: WritableEntity[] = sortTree(writableEntities(tree, perimeter)).map((e) => ({
        id: e.id,
        name: e.name,
        level: e.level,
        country: e.country,
        currency: e.currency,
      }));
      return { items, writable };
    },
    { items: [] as CounterpartyRow[], writable: [] as WritableEntity[] }
  );
  const ai = await aiStatus();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Contreparties</h1>
        <p className="muted">Référentiel des contreparties de votre périmètre et dernière notation validée.</p>
      </div>

      {!dbAvailable && (
        <div className="card" style={{ padding: 14 }}>
          <span className="muted">
            Base non connectée : configurez <code>DATABASE_URL</code> puis <code>npm run db:push</code>. Les contreparties sont
            créées par <code>POST /api/v1/counterparties</code>.
          </span>
        </div>
      )}

      {dbAvailable && canCreate && data.writable.length > 0 && (
        <NewCounterpartyForm
          entities={data.writable}
          defaultEntityId={identity.entityId ?? null}
          aiUsable={ai.enabled && !ai.missing}
        />
      )}

      <section className="card" style={{ padding: 16 }}>
        {data.items.length === 0 ? (
          <p className="muted">Aucune contrepartie enregistrée.</p>
        ) : (
          <CounterpartiesTable items={data.items} />
        )}
      </section>

      <p className="muted" style={{ fontSize: 13 }}>
        Pour noter une contrepartie, ouvrez un dossier depuis{" "}
        <Link href="/scoring" style={{ color: "var(--brand)" }}>
          Nouvelle notation
        </Link>
        .
      </p>
    </div>
  );
}
