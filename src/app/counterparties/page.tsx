import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { OFFICIAL_RUN_WHERE } from "@/lib/cases";
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

export default async function CounterpartiesPage() {
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
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          take: 1000,
          select: {
            id: true,
            name: true,
            ice: true,
            coreBankingId: true,
            dataSource: true,
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
          db.ratingRun.findMany({
            where: { counterpartyId: { in: ids }, ...OFFICIAL_RUN_WHERE },
            orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
            select: { counterpartyId: true, finalGrade: true, rawScore: true, asOfDate: true },
          }),
          db.ratingCase.findMany({
            where: { counterpartyId: { in: ids }, status: { in: ["DRAFT", "SUBMITTED"] } },
            select: { counterpartyId: true, status: true },
          }),
        ]);
        for (const r of runs) {
          if (!lastRun.has(r.counterpartyId)) {
            const rawScore = r.rawScore === null ? null : Number(r.rawScore);
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
      return { items, writable };
    },
    { items: [] as CounterpartyRow[], writable: [] as WritableEntity[] }
  );
  const ai = await aiStatus();
  const t24 = await t24Config();
  const { data: segments } = await safeQuery((db) => loadCommercialSegments(db), DEFAULT_COMMERCIAL_SEGMENTS);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clients</h1>
        <p className="muted">
          Référentiel des clients de votre périmètre et dernière notation validée. Ouvrez une fiche pour la modifier, noter le
          client ou le supprimer.
        </p>
      </div>

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
          entities={data.writable}
          defaultEntityId={identity.entityId ?? null}
          aiUsable={ai.enabled && !ai.missing}
          t24Enabled={t24.enabled}
          segments={segments.filter((x) => x.active)}
        />
      )}

      <section className="card" style={{ padding: 16 }}>
        {data.items.length === 0 ? (
          <p className="muted">Aucun client enregistré.</p>
        ) : (
          <CounterpartiesTable items={data.items} />
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
