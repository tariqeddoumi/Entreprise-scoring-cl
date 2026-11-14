import { DEFAULT_ENTRY_LISTS, loadEntryLists } from "@/lib/entry-lists";
import { currentRatings } from "@/lib/current-ratings";
import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { safeQuery } from "@/lib/safe-db";
import { watchlistedIds } from "@/lib/committee";
import { canWrite, loadTree, sortTree, writableEntities } from "@/lib/scope";
import { transposeGrade } from "@/core/grades";
import { effectiveScale } from "@/lib/rating-scale";
import { legacyScaleForGrade } from "@/reference/legacy-scales";
import { toGradeScaleConfig } from "@/reference/rating-scale";
import { getPerimeter, getSessionIdentity, requireSession } from "@/lib/session";
import { CounterpartiesTable, type CounterpartyRow } from "./CounterpartiesTable";
import { NewCounterpartyForm, type WritableEntity } from "./NewCounterpartyForm";
import { t24Config } from "@/lib/core-banking";
import { loadCommercialSegments } from "@/lib/financial-statements";
import { DEFAULT_COMMERCIAL_SEGMENTS } from "@/reference/case-purposes";

export const dynamic = "force-dynamic";

/** Au-delà, la liste se charge par recherche côté base (nom, ICE, code T24, gestionnaire). */
const LIST_LIMIT = 1000;

export default async function CounterpartiesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  // Toute page porteuse de données exige une session authentifiée.
  const identity = await requireSession();
  // La création exige le rôle ANALYST : le formulaire ne s'affiche donc que
  // pour les identités habilitées à écrire, comme le fait déjà l'API REST.
  const canCreate = (await getSessionIdentity("ANALYST")).ok;
  const canRateHere = canCreate;
  const perimeter = await getPerimeter();

  const master = toGradeScaleConfig(await effectiveScale());
  const { data, dbAvailable } = await safeQuery(
    async (db) => {
      // Liste d'abord, sans jointure : la fiche des clients s'affiche même si
      // la lecture des notations échoue (ancien instantané, colonne absente).
      const [rows, tree] = await Promise.all([
        db.counterparty.findMany({
          where: q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { ice: { contains: q } },
                  { coreBankingId: { contains: q } },
                  { accountOfficer: { contains: q, mode: "insensitive" } },
                ],
              }
            : undefined,
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          take: LIST_LIMIT,
          select: {
            id: true,
            name: true,
            ice: true,
            coreBankingId: true,
            dataSource: true,
            accountOfficer: true,
            segment: true,
            sectorCode: true,
            entityId: true,
            currency: true,
            isActive: true,
          },
        }),
        loadTree(),
      ]);
      const ids = rows.map((r) => r.id);
      const lastRun = new Map<string, CounterpartyRow["ratingRuns"]>();
      const openCase = new Map<string, string>();
      let wl = new Set<string>();
      try {
        const [runs, cases] = await Promise.all([
          // Note courante : la dernière notation qui fait foi (validée, ou
          // antérieure au workflow), au dernier arrêté, la plus récente à
          // arrêté égal. Une notation soumise n'est qu'une proposition.
          currentRatings(db, ids),
          db.ratingCase.findMany({
            where: { counterpartyId: { in: ids }, status: { in: ["DRAFT", "SUBMITTED"] } },
            select: { counterpartyId: true, status: true },
          }),
        ]);
        for (const r of runs) {
          if (!lastRun.has(r.counterpartyId)) {
            const rawScore = r.rawScore;
            // Note d'une échelle antérieure (STD-P…) : classe équivalente sur
            // l'échelle 1 à 10 en vigueur, affichée à côté, jamais enregistrée.
            const legacy = r.finalGrade ? legacyScaleForGrade(r.finalGrade) : undefined;
            const equivalent = legacy ? transposeGrade(legacy, r.finalGrade, rawScore, master) : null;
            lastRun.set(r.counterpartyId, [{ finalGrade: r.finalGrade, rawScore, asOfDate: r.asOfDate, equivalent }]);
          }
        }
        for (const c of cases) openCase.set(c.counterpartyId, c.status);
        wl = await watchlistedIds(db, ids);
      } catch (e) {
        console.error("[clients] lecture des notations impossible :", e instanceof Error ? e.message : e);
      }
      const code = new Map(tree.map((e) => [e.id, e.code]));
      const items: CounterpartyRow[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        ice: r.ice,
        coreBankingId: r.coreBankingId,
        dataSource: r.dataSource,
        accountOfficer: r.accountOfficer,
        segment: r.segment,
        sectorCode: r.sectorCode,
        entityCode: code.get(r.entityId) ?? "—",
        currency: r.currency,
        isActive: r.isActive,
        canRate: canRateHere && r.isActive && canWrite(perimeter, r.entityId),
        openCase: openCase.get(r.id) ?? null,
        watchlist: wl.has(r.id),
        ratingRuns: lastRun.get(r.id) ?? [],
      }));
      const writable: WritableEntity[] = sortTree(writableEntities(tree, perimeter)).map((e) => ({
        id: e.id,
        name: e.name,
        level: e.level,
        country: e.country,
        currency: e.currency,
      }));
      // Liste tronquée : le total du périmètre dit à l'utilisateur de chercher.
      const total = rows.length >= LIST_LIMIT ? await db.counterparty.count() : rows.length;
      return { items, writable, total };
    },
    { items: [] as CounterpartyRow[], writable: [] as WritableEntity[], total: 0 }
  );
  const ai = await aiStatus();
  const t24 = await t24Config();
  const portfolio = perimeter.portfolio ?? null;
  const { data: segments } = await safeQuery((db) => loadCommercialSegments(db), DEFAULT_COMMERCIAL_SEGMENTS);

  const { data: entryLists } = await safeQuery((db) => loadEntryLists(db), DEFAULT_ENTRY_LISTS);
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clients</h1>
        <p className="muted">
          Référentiel des clients de votre périmètre et dernière notation validée. Ouvrez une fiche pour la modifier, noter le
          client ou le supprimer.
        </p>
      </div>

      {portfolio && (
        <div className="card" role="status" style={{ padding: "10px 14px", fontSize: 13, borderLeft: "4px solid var(--brand)" }}>
          <strong>Votre portefeuille</strong> : clients dont vous êtes gestionnaire ({portfolio.owners.join(", ")}) et clients pour lesquels vous avez
          ouvert un dossier. Un client d&apos;un autre gestionnaire se voit par son gestionnaire ou par le directeur du centre.
        </div>
      )}

      {!dbAvailable && (
        <div className="card" style={{ padding: 14 }}>
          <span className="muted">
            Base non connectée : configurez <code>DATABASE_URL</code> puis <code>npm run db:push</code>. Les clients sont aussi
            créés par <code>POST /api/v1/counterparties</code>.
          </span>
        </div>
      )}

      {dbAvailable && canCreate && data.writable.length > 0 && (
        <NewCounterpartyForm
              lists={entryLists}
          entities={data.writable}
          defaultEntityId={identity.entityId ?? null}
          aiUsable={ai.enabled && !ai.missing}
          t24Enabled={t24.enabled}
          segments={segments.filter((x) => x.active)}
          ownPortfolio={!!portfolio}
        />
      )}

      <section className="card" style={{ padding: 16 }}>
        {data.items.length === 0 && !q ? (
          <p className="muted">Aucun client enregistré.</p>
        ) : (
          <CounterpartiesTable items={data.items} serverQuery={q} truncated={data.items.length >= LIST_LIMIT} total={data.total} />
        )}
      </section>

      <p className="muted" style={{ fontSize: 13 }}>
        Pour noter un client : bouton « Noter » de la liste, ou depuis{" "}
        <Link href="/scoring" style={{ color: "var(--brand)" }}>
          Nouvelle notation
        </Link>
        .
      </p>
    </div>
  );
}
