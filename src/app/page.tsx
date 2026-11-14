import { currentRatings } from "@/lib/current-ratings";
import { myWork, type WorkItem } from "@/lib/my-work";
import { hasRole } from "@/lib/auth";
import { settingInt } from "@/lib/settings";
import Link from "next/link";
import { listModels } from "@/models";
import { gradeRank } from "@/core/grades";
import type { GradeScaleConfig } from "@/core/types";
import { toGradeScaleConfig } from "@/reference/rating-scale";
import { effectiveScale } from "@/lib/rating-scale";
import { isOfficialRun, OFFICIAL_RUN_WHERE } from "@/lib/cases";
import { safeQuery } from "@/lib/safe-db";
import { requireSession } from "@/lib/session";
import { GradeBadge, OutcomeLabel } from "./ui-helpers";

/**
 * Rang d'un grade DANS L'ÉCHELLE DE SON MODÈLE.
 *
 * Une version locale de ce calcul vivait ici, écrite pour l'échelle G1…G10 :
 * elle lisait le numéro après la première lettre. Sur les échelles V3 elle
 * renvoyait la même valeur de repli pour tous les grades performants, et
 * plaçait les grades de défaut AVANT eux — un tableau de risque qui affichait
 * les défauts en tête, à la place des meilleures notes. Le rang vient
 * désormais de l'échelle publiée du modèle, seule autorité sur l'ordre.
 */
function rankIn(scale: GradeScaleConfig, grade: string | null): number {
  if (!grade) return Number.MAX_SAFE_INTEGER;
  try {
    return gradeRank(scale, grade);
  } catch {
    // Grade inconnu de l'échelle en vigueur : notation d'archive, produite par
    // une échelle antérieure (STD-P…, TPE-B…). Rejetée en fin de liste plutôt
    // que classée à tort.
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Un grade appartient-il à l'échelle maîtresse en vigueur ? */
function isCurrentScale(scale: GradeScaleConfig, grade: string | null): boolean {
  return grade !== null && rankIn(scale, grade) !== Number.MAX_SAFE_INTEGER;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Toute page porteuse de données exige une session authentifiée.
  const identity = await requireSession();
  const validityMonths = await settingInt("RATING_VALIDITY_MONTHS");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - validityMonths);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const scale = toGradeScaleConfig(await effectiveScale());

  const { data: stats, dbAvailable } = await safeQuery(async (db) => {
      const clients = await db.counterparty.findMany({ select: { id: true, isActive: true } });
      const [runs, recent, latest, toValidate, work] = await Promise.all([
        db.ratingRun.count({ where: OFFICIAL_RUN_WHERE }),
        // Champs affichés seulement : les instantanés d'entrée et de résultat
        // pèsent plusieurs dizaines de kilo-octets par run. Les notations de
        // lot (surveillance) ont leur propre écran : elles noieraient la liste.
        db.ratingRun.findMany({
          where: { origin: { not: "BATCH" } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            asOfDate: true,
            segment: true,
            outcome: true,
            rawScore: true,
            finalGrade: true,
            counterparty: { select: { name: true } },
            origin: true,
            ratingCase: { select: { status: true } },
          },
        }),
        // Note COURANTE de chaque contrepartie : sa notation au dernier arrêté,
        // la plus récente à arrêté égal. Compter tous les runs ferait peser une
        // contrepartie autant de fois qu'elle a été notée, et mêlerait ses
        // notes successives — ce ne serait plus la distribution du portefeuille.
        // Seules les notations qui font foi : validées, ou antérieures au
        // workflow. Une notation soumise et non validée n'est qu'une proposition.
        currentRatings(db, clients.map((c) => c.id)),
        db.ratingCase.count({ where: { status: "SUBMITTED" } }),
        myWork(db, identity, 50),
      ]);
      const counterparties = clients.length;
      // Notes à renouveler : clients actifs dont la note courante dépasse la
      // durée de validité (même règle que l'onglet « À traiter » des dossiers).
      const active = new Set(clients.filter((c) => c.isActive).map((c) => c.id));
      const renewals = latest.filter((r) => active.has(r.counterpartyId) && r.asOfDate < cutoffIso).length;
      // Groupé PAR MODÈLE : deux modèles portent deux échelles que rien ne
      // déclare comparables (constat C03). Les additionner dans une seule
      // distribution reviendrait à traiter un STD-P3 et un TPE-B3 comme le
      // même risque, ce que le moteur refuse explicitement par ailleurs.
      const counts = new Map<string, { modelId: string; finalGrade: string; n: number }>();
      let ungraded = 0;
      for (const run of latest) {
        if (run.finalGrade === null) {
          ungraded++;
          continue;
        }
        const key = `${run.modelId}\u0000${run.finalGrade}`;
        const row = counts.get(key) ?? { modelId: run.modelId, finalGrade: run.finalGrade, n: 0 };
        row.n++;
        counts.set(key, row);
      }
      const gradeRows = [...counts.values()].map((r) => ({
        modelId: r.modelId,
        finalGrade: r.finalGrade,
        _count: { _all: r.n },
      }));
      return { counterparties, runs, recent, gradeRows, ungraded, toValidate, work, renewals };
    },
    { counterparties: 0, runs: 0, recent: [], gradeRows: [], ungraded: 0, toValidate: 0, work: [], renewals: 0 } as {
      work: WorkItem[];
      renewals: number;
      counterparties: number;
      runs: number;
      toValidate: number;
      recent: Array<{
        id: string;
        asOfDate: string;
        segment: string | null;
        outcome: string;
        rawScore: unknown;
        finalGrade: string | null;
        counterparty: { name: string };
        origin: string;
        ratingCase: { status: string } | null;
      }>;
      gradeRows: Array<{
        modelId: string;
        finalGrade: string | null;
        _count: { _all: number };
      }>;
      ungraded: number;
    }
  );

  const models = listModels();
  // Une calibration sur données simulées valide la chaîne de traitement, pas
  // le niveau du risque : la carte ne doit pas la compter comme une calibration.
  const observed = models.filter((m) => m.calibration?.dataSource === "OBSERVED").length;
  const synthetic = models.filter((m) => m.calibration?.dataSource === "SYNTHETIC").length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Tableau de bord</h1>
        <p className="muted">
          Notation interne des clients entreprises non financières — segments TPE,
          PME et Grandes Entreprises.
        </p>
      </div>

      {!dbAvailable && (
        <div
          className="card"
          style={{ padding: 14, borderLeftWidth: 4, borderLeftColor: "var(--warn)" }}
        >
          <strong>Base de données non connectée.</strong>{" "}
          <span className="muted">
            Le moteur de notation et la simulation restent pleinement fonctionnels.
            Configurez <code>DATABASE_URL</code> puis lancez{" "}
            <code>npm run db:push</code> pour activer la persistance, l&apos;historique et
            l&apos;audit.
          </span>
        </div>
      )}

      {dbAvailable && <MyWorkPanel work={stats.work} renewals={stats.renewals} validityMonths={validityMonths} canRate={hasRole(identity.role, "ANALYST")} />}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard label="Clients" value={stats.counterparties} href="/counterparties" />
        <StatCard label="Notations validées" value={stats.runs} />
        <StatCard label="Dossiers à valider" value={stats.toValidate} hint="Soumis, en attente d'une seconde personne" href="/cases?tab=SUBMITTED" />
        <StatCard label="Modèles disponibles" value={models.length} hint="Grilles, critères, calibration" href="/models" />
        <StatCard
          label="Calibration PD"
          value={
            observed > 0
              ? `${observed}/${models.length} sur défauts observés`
              : synthetic > 0
                ? "Données simulées uniquement"
                : "Aucune"
          }
          hint={observed === 0 ? "Aucune PD n'est exposée" : undefined}
          small
        />
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Distribution des grades finaux</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Note courante de chaque client — sa dernière notation validée — sur l&apos;échelle
          maîtresse 1 à 10 en vigueur ({scale.scaleId}, 1 = meilleur risque). Une ligne par
          grille, pour lire chaque portefeuille séparément.
        </p>
        {stats.gradeRows.length === 0 && stats.ungraded === 0 ? (
          <p className="muted">Aucune notation enregistrée.</p>
        ) : (
          (() => {
            const current = stats.gradeRows.filter((g) =>
              isCurrentScale(scale, g.finalGrade)
            );
            const archived = stats.gradeRows.filter(
              (g) => !isCurrentScale(scale, g.finalGrade)
            );
            const byModel = new Map<string, typeof current>();
            for (const row of current) {
              const list = byModel.get(row.modelId) ?? [];
              list.push(row);
              byModel.set(row.modelId, list);
            }
            const archivedTotal = archived.reduce((acc, g) => acc + g._count._all, 0);

            return (
              <div style={{ display: "grid", gap: 18 }}>
                {[...byModel.entries()].map(([modelId, rows]) => {
                  const sorted = [...rows].sort(
                    (a, b) =>
                      rankIn(scale, a.finalGrade) -
                      rankIn(scale, b.finalGrade)
                  );
                  const max = Math.max(...sorted.map((g) => g._count._all));
                  const scaleId = scale.scaleId;
                  return (
                    <div key={modelId}>
                      <h3 style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                        {modelId}{" "}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          — échelle {scaleId}
                        </span>
                      </h3>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Grade</th>
                            <th>Nombre</th>
                            <th style={{ width: "50%" }}>
                              <span className="sr-only">Répartition</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((g) => (
                            <tr key={`${modelId}:${g.finalGrade}`}>
                              <td>
                                <GradeBadge grade={g.finalGrade} />
                              </td>
                              <td>{g._count._all}</td>
                              <td>
                                <div
                                  style={{
                                    height: 8,
                                    borderRadius: 4,
                                    width: `${Math.max(4, (g._count._all / max) * 100)}%`,
                                    background: "var(--brand)",
                                    opacity: 0.6,
                                  }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {stats.ungraded > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    <strong>{stats.ungraded}</strong> client(s) sans grade à leur
                    dernier arrêté (données insuffisantes, segment indéterminé ou routage
                    vers un autre traitement) : ils ne figurent pas dans la distribution.
                  </p>
                )}

                {archivedTotal > 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    <strong>{archivedTotal}</strong> client(s) ont pour dernière
                    notation un grade d&apos;une échelle antérieure —{" "}
                    {archived
                      .map((g) => `${g.finalGrade} (${g._count._all})`)
                      .join(", ")}
                    . Produites avant l&apos;échelle en vigueur, ces notations restent
                    consultables mais ne sont pas classées ici : les ranger dans l&apos;échelle
                    1 à 10 leur donnerait un sens qu&apos;elles n&apos;ont pas. Une renotation
                    les y fera entrer.
                  </p>
                )}
              </div>
            );
          })()
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ fontWeight: 600 }}>Dernières notations</h2>
          <Link href="/scoring" style={{ color: "var(--brand)" }}>
            Nouvelle notation →
          </Link>
        </div>
        {stats.recent.length === 0 ? (
          <p className="muted">
            Aucun run enregistré. Lancez une notation depuis l&apos;onglet « Nouvelle
            notation ».
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date d&apos;arrêté</th>
                <th>Segment</th>
                <th>Score brut</th>
                <th>Grade final</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/rating-runs/${r.id}`} style={{ color: "var(--brand)" }}>
                      {r.counterparty.name}
                    </Link>
                  </td>
                  <td className="nowrap">{r.asOfDate}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.rawScore ? Number(r.rawScore).toFixed(2) : "—"}</td>
                  <td>
                    <GradeBadge grade={r.finalGrade} />
                    {!isOfficialRun(r) && <ProposedTag status={r.ratingCase?.status} />}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    <OutcomeLabel outcome={r.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  );
}

function StatCard({
  label,
  value,
  small,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  small?: boolean;
  hint?: string;
  href?: string;
}) {
  const body = (
    <div className="card" style={{ padding: 16, height: "100%" }}>
      <div className="muted" style={{ fontSize: 12, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: small ? 15 : 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {hint && (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="stat-link" aria-label={`${label} : ${value}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

const WORK_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon à compléter", color: "var(--warn)" },
  REJECTED: { label: "Rejeté, à reprendre", color: "var(--bad)" },
  SUBMITTED: { label: "Votre avis ou décision", color: "var(--brand)" },
};

/** Ce qui attend l'utilisateur, en tête de session : dossiers, notes à renouveler, raccourcis. */
function MyWorkPanel({ work, renewals, validityMonths, canRate }: { work: WorkItem[]; renewals: number; validityMonths: number; canRate: boolean }) {
  const count = (s: string) => work.filter((w) => w.status === s).length;
  return (
    <section className="card" style={{ padding: 16, display: "grid", gap: 12 }} aria-labelledby="mon-travail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 id="mon-travail" style={{ fontWeight: 600 }}>
          Mon travail
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <form action="/counterparties" method="get" role="search" style={{ display: "flex", gap: 6 }}>
            <input type="search" name="q" placeholder="Client : nom, ICE, code T24…" aria-label="Rechercher un client" style={{ width: 230 }} />
            <button type="submit" className="btn-ghost">
              Rechercher
            </button>
          </form>
          {canRate && (
            <Link href="/scoring" className="btn-primary" style={{ textDecoration: "none" }}>
              Nouvelle notation
            </Link>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <span>
          <strong>{count("SUBMITTED")}</strong> dossier(s) attendent votre avis ou décision
        </span>
        <span>
          <strong>{count("DRAFT")}</strong> brouillon(s)
        </span>
        <span>
          <strong>{count("REJECTED")}</strong> rejeté(s) à reprendre
        </span>
        {renewals > 0 ? (
          <Link href="/cases#renouvellements" style={{ color: "var(--brand)" }}>
            <strong>{renewals}</strong> note(s) à renouveler (plus de {validityMonths} mois)
          </Link>
        ) : (
          <span className="muted">Aucune note à renouveler</span>
        )}
      </div>
      {work.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Aucun dossier en attente de votre part.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">À faire</th>
                <th scope="col">Étape</th>
                <th scope="col">Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {work.slice(0, 8).map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/cases/${w.id}`} style={{ color: "var(--brand)" }}>
                      {w.counterpartyName}
                    </Link>
                  </td>
                  <td style={{ color: WORK_STATUS[w.status]?.color, fontWeight: 600 }}>{WORK_STATUS[w.status]?.label ?? w.status}</td>
                  <td className="muted">{w.step ?? "—"}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {w.updatedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {work.length > 8 && (
        <Link href="/cases?tab=todo" style={{ color: "var(--brand)", fontSize: 13 }}>
          Voir les {work.length} dossiers à traiter →
        </Link>
      )}
    </section>
  );
}

/** Une notation soumise ou rejetée n'est pas la note de la contrepartie. */
function ProposedTag({ status }: { status?: string }) {
  return (
    <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
      {status === "REJECTED" ? "rejetée" : "proposée, non validée"}
    </span>
  );
}
