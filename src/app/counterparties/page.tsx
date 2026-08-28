import Link from "next/link";
import { prisma, safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { CounterpartiesTable } from "./CounterpartiesTable";

export const dynamic = "force-dynamic";

export default async function CounterpartiesPage() {
  // Toute page porteuse de données exige une session authentifiée.
  await requireSession();

  const { data: items, dbAvailable } = await safeQuery(
    () =>
      prisma.counterparty.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          ratingRuns: {
            orderBy: { createdAt: "desc" },
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
