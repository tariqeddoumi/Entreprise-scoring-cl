import Link from "next/link";
import { prisma, safeQuery } from "@/lib/safe-db";
import { getSessionIdentity, requireSession } from "@/lib/session";
import { CounterpartiesTable } from "./CounterpartiesTable";
import { NewCounterpartyForm } from "./NewCounterpartyForm";

export const dynamic = "force-dynamic";

export default async function CounterpartiesPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();
  // La création exige le rôle ANALYST : le formulaire ne s'affiche donc que
  // pour les identités habilitées à écrire, comme le fait déjà l'API REST.
  const canCreate = (await getSessionIdentity("ANALYST")).ok;

  const { data: items, dbAvailable } = await safeQuery(
    () =>
      prisma.counterparty.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          // Même règle que le tableau de bord : la note courante est celle du
          // dernier arrêté, la plus récente à arrêté égal. Trier sur la seule
          // date d'enregistrement afficherait un grade différent dès qu'une
          // notation ancienne est saisie ou reprise après une plus récente.
          ratingRuns: {
            orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: { finalGrade: true, rawScore: true, asOfDate: true },
          },
        },
      }),
    [] as Array<{
      id: string;
      name: string;
      ice: string | null;
      segment: string | null;
      sectorCode: string | null;
      ratingRuns: Array<{ finalGrade: string | null; rawScore: unknown; asOfDate: string }>;
    }>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Contreparties</h1>
        <p className="muted">
          Référentiel des contreparties notées et dernière notation connue.
        </p>
      </div>

      {!dbAvailable && (
        <div className="card" style={{ padding: 14 }}>
          <span className="muted">
            Base non connectée : configurez <code>DATABASE_URL</code> puis{" "}
            <code>npm run db:push</code>. Les contreparties sont créées par{" "}
            <code>POST /api/v1/counterparties</code>.
          </span>
        </div>
      )}

      {dbAvailable && canCreate && <NewCounterpartyForm />}

      <section className="card" style={{ padding: 16 }}>
        {items.length === 0 ? (
          <p className="muted">Aucune contrepartie enregistrée.</p>
        ) : (
          <CounterpartiesTable items={items} />
        )}
      </section>

      <p className="muted" style={{ fontSize: 13 }}>
        Pour noter une contrepartie, ouvrez{" "}
        <Link href="/scoring" style={{ color: "var(--brand)" }}>
          Nouvelle notation
        </Link>{" "}
        et sélectionnez-la dans le cadrage du dossier.
      </p>
    </div>
  );
}
