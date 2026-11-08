import Link from "next/link";
import { GradeBadge } from "@/app/ui-helpers";
import { buildSurveillance, canViewSurveillance, loadPortfolio, loadSurveillanceSettings, parseSurveillanceParams, scaleInfo, type SurveillanceReport } from "@/lib/portfolio-data";
import { effectiveScale, today } from "@/lib/rating-scale";
import { safeQuery } from "@/lib/safe-db";
import { readableEntities, sortTree } from "@/lib/scope";
import { getPerimeter, requireSession } from "@/lib/session";
import { toGradeScaleConfig } from "@/reference/rating-scale";
import { KRI_CATALOG, type BreakdownRow, type KriValue, type RagStatus } from "@/reference/portfolio";
import { GroupedColumns, LineChart, MigrationHeatmap, ShareBar, Sparkline } from "./charts";
import { fmtAmount, fmtDate, fmtInt, fmtMonth, fmtNum, fmtPct } from "./format";

export const dynamic = "force-dynamic";

const RAG: Record<RagStatus, { icon: string; label: string; color: string }> = {
  VERT: { icon: "✓", label: "Vert", color: "var(--good)" },
  ORANGE: { icon: "▲", label: "Orange", color: "var(--warn)" },
  ROUGE: { icon: "✕", label: "Rouge", color: "var(--bad)" },
  NA: { icon: "–", label: "Sans objet", color: "var(--muted)" },
};

function RagChip({ rag }: { rag: RagStatus }) {
  const r = RAG[rag];
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12, fontWeight: 600, color: r.color }}>
      <span aria-hidden="true">{r.icon}</span>
      {r.label}
    </span>
  );
}

const fmtValue = (k: KriValue["def"], v: number | null) =>
  k.unit === "PCT" ? fmtPct(v) : k.unit === "GRADE" ? fmtNum(v, 2) : k.unit === "DAYS" ? (v === null ? "—" : `${fmtNum(v, 0)} j`) : fmtInt(v);

const thresholdFr = (k: KriValue["def"], t: { amber: number; red: number }) => {
  const u = k.unit === "PCT" ? " %" : k.unit === "DAYS" ? " j" : "";
  const op = k.direction === "UP_IS_WORSE" ? "≥" : "≤";
  return `orange ${op} ${fmtNum(t.amber, k.unit === "GRADE" ? 1 : 0)}${u} · rouge ${op} ${fmtNum(t.red, k.unit === "GRADE" ? 1 : 0)}${u}`;
};

const SERIES_OF: Record<string, keyof SurveillanceReport["series"][number]> = {
  NOTE_MOYENNE: "avgGrade",
  PART_RISQUE_ELEVE: "highRiskPct",
  PART_DEFAUT: "defaultPct",
  PART_WATCHLIST: "watchlistPct",
  CONCENTRATION_TOP10: "top10Pct",
  COUVERTURE: "coveragePct",
  NOTES_EXPIREES: "expiredPct",
};

function KriTile({ k, report }: { k: KriValue; report: SurveillanceReport }) {
  const t = report.settings.thresholds[k.def.code];
  const delta = k.value !== null && k.previous !== null ? k.value - k.previous : null;
  const worse = delta !== null && delta !== 0 && (k.def.direction === "UP_IS_WORSE" ? delta > 0 : delta < 0);
  const key = SERIES_OF[k.def.code];
  const spark = key ? report.series.slice(-12).map((p) => p[key] as number | null) : null;
  return (
    <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 4, borderTop: `3px solid ${RAG[k.rag].color}` }} title={k.def.definitionFr}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{k.def.labelFr}</span>
        <RagChip rag={k.rag} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 600, color: "var(--heading)" }}>{fmtValue(k.def, k.value)}</span>
        {spark && <Sparkline values={spark} label={`${k.def.labelFr} : 12 derniers mois`} />}
      </div>
      {delta !== null && (
        <span style={{ fontSize: 12, color: delta === 0 ? "var(--muted)" : worse ? "var(--bad)" : "var(--good)" }}>
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "= "}
          {k.def.unit === "PCT" ? `${fmtNum(delta, 1)} pt` : k.def.unit === "GRADE" ? `${fmtNum(delta, 2)} cran` : fmtNum(delta, 0)} sur {report.horizon} mois
        </span>
      )}
      {k.noteFr && <span style={{ fontSize: 12 }}>{k.noteFr}</span>}
      <span className="muted" style={{ fontSize: 11 }}>
        {thresholdFr(k.def, t)}
      </span>
    </div>
  );
}

function BreakdownTable({ title, rows, highRiskFrom }: { title: string; rows: BreakdownRow[]; highRiskFrom: number }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <h3 style={{ fontWeight: 600, fontSize: 14 }}>{title}</h3>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>{title.replace("Par ", "").replace(/^./, (c) => c.toUpperCase())}</th>
              <th style={{ textAlign: "right" }}>Clients</th>
              <th style={{ textAlign: "right" }}>Exposition</th>
              <th>Part</th>
              <th style={{ textAlign: "right" }}>Note moy.</th>
              <th style={{ textAlign: "right" }}>Risque élevé ({highRiskFrom}+)</th>
              <th style={{ textAlign: "right" }}>Défaut</th>
              <th style={{ textAlign: "right" }}>Watch list</th>
              <th style={{ textAlign: "right" }}>Dégradation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.key}</td>
                <td style={{ textAlign: "right" }}>{fmtInt(r.count)}</td>
                <td style={{ textAlign: "right" }}>{fmtAmount(r.exposure)}</td>
                <td>
                  <ShareBar pct={r.sharePct} />
                </td>
                <td style={{ textAlign: "right" }}>{fmtNum(r.avgGrade, 2)}</td>
                <td style={{ textAlign: "right" }}>{fmtPct(r.highRiskPct)}</td>
                <td style={{ textAlign: "right" }}>{fmtPct(r.defaultPct)}</td>
                <td style={{ textAlign: "right" }}>{fmtInt(r.watchlistCount)}</td>
                <td style={{ textAlign: "right" }} title={`Cohorte : ${r.cohort} client(s)`}>
                  {fmtPct(r.downgradePct)}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="muted">
                  Aucun client noté dans la sélection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card" style={{ padding: 16, display: "grid", gap: 12, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>{title}</h2>
        {intro && (
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {intro}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Surveillance du portefeuille : indicateurs de risque et de processus, leur
 * évolution, la matrice de migration, les ventilations par segment, secteur et
 * entité, la concentration et les alertes. Lecture seule, dans le périmètre de
 * la personne ; filtres en tête, ils s'appliquent à toute la page et à l'export.
 */
export default async function SurveillancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const identity = await requireSession();
  if (!(await canViewSurveillance(identity))) {
    return (
      <div className="card" style={{ padding: 16 }} role="alert">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Surveillance du portefeuille</h1>
        <p style={{ marginTop: 8 }}>
          Écran réservé à la surveillance des risques, à la contre-étude, aux directeurs de centre et aux gestionnaires des risques (droit « Consulter la
          surveillance du portefeuille », Administration › Paramétrage › Circuit).
        </p>
      </div>
    );
  }
  const params = await searchParams;
  const todayIso = today();
  const { data: base } = await safeQuery((db) => loadSurveillanceSettings(db), null);
  const { asOf, horizon, filters } = parseSurveillanceParams(params, todayIso, base?.horizonMonths ?? 12);
  const scale = scaleInfo(toGradeScaleConfig(await effectiveScale(asOf)));
  const perimeter = await getPerimeter();
  const { data, dbAvailable } = await safeQuery((db) => loadPortfolio(db, filters), null);
  if (!dbAvailable || !data) {
    return (
      <div className="card" style={{ padding: 16 }} role="alert">
        Base de données indisponible : la surveillance du portefeuille ne peut pas être calculée.
      </div>
    );
  }
  const report = buildSurveillance(data, asOf, horizon, scale);
  const entities = sortTree(readableEntities(data.tree, perimeter));
  const qs = new URLSearchParams(Object.entries({ entity: filters.entityId, segment: filters.segment, sector: filters.sector, asOf, horizon: String(horizon) }).filter((e): e is [string, string] => !!e[1])).toString();
  const s = report.series;
  const dates = s.map((p) => p.date);
  const m = report.migration;
  const hr = report.settings.highRiskFrom;
  const kRisk = report.kris.filter((k) => k.def.family === "RISQUE");
  const kProc = report.kris.filter((k) => k.def.family === "PROCESSUS");
  const segLabel = (v: string) => (v === "_" ? "Non déterminé" : v);
  const secLabel = (v: string) => (v === "_" ? "Non renseigné" : v);
  const late = report.alerts.watchlist.filter((w) => w.reviewLate || w.renotationLate);

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Surveillance du portefeuille</h1>
        <p className="muted">
          Photographie au {fmtDate(asOf)} des notes qui font foi (validées), comparée au {fmtDate(report.from)} ({horizon} mois). Exposition : position des
          lignes d&apos;engagement du client (T24 ou saisie) à partir de sa date, sinon engagement global déclaré à la notation. Seuils proposés, à arrêter
          en COPIL (Administration › Paramétrage).
        </p>
      </div>

      <form method="get" className="card" style={{ padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }} aria-label="Filtres de la surveillance">
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Date d&apos;arrêté
          <input type="date" name="asOf" defaultValue={asOf} max={todayIso} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Horizon
          <select name="horizon" defaultValue={String(horizon)}>
            {[3, 6, 12, 24].map((h) => (
              <option key={h} value={h}>
                {h} mois
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Entité
          <select name="entity" defaultValue={filters.entityId ?? ""}>
            <option value="">Tout le périmètre</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {" ".repeat(2 * Math.max(0, e.path.split("/").filter(Boolean).length - 1))}
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Segment
          <select name="segment" defaultValue={filters.segment ?? ""}>
            <option value="">Tous</option>
            {data.segments.map((v) => (
              <option key={v} value={v}>
                {segLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          Secteur
          <select name="sector" defaultValue={filters.sector ?? ""}>
            <option value="">Tous</option>
            {data.sectors.map((v) => (
              <option key={v} value={v}>
                {secLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Appliquer
        </button>
        <Link href="/surveillance" style={{ fontSize: 13 }}>
          Réinitialiser
        </Link>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
          Export CSV :
          <a href={`/surveillance/export?kind=portefeuille&${qs}`}>portefeuille</a>
          <a href={`/surveillance/export?kind=migrations&${qs}`}>migrations</a>
          <a href={`/surveillance/export?kind=indicateurs&${qs}`}>indicateurs</a>
          <a href={`/surveillance/export?kind=evolution&${qs}`}>évolution</a>
        </span>
      </form>

      <section className="card" style={{ padding: 16, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "end" }} aria-label="Synthèse">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Exposition notée
          </div>
          <div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1, color: "var(--heading)" }}>{fmtAmount(report.now.exposure)}</div>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
          <span>
            <strong>{fmtInt(report.now.rated)}</strong> client(s) noté(s)
            {report.now.population !== null ? ` sur ${fmtInt(report.now.population)} actif(s)` : ""}
          </span>
          <span>
            <strong>{fmtInt(report.now.watchlistCount)}</strong> en watch list
          </span>
          <span>
            <strong>{fmtInt(report.now.withFacilities)}</strong> exposition(s) tirée(s) des lignes d&apos;engagement
          </span>
          <span>
            <strong>{fmtInt(report.process.validatedInPeriod)}</strong> note(s) validée(s) sur {horizon} mois
          </span>
          {report.now.exposureUnknown > 0 && (
            <span style={{ color: "var(--warn)" }}>
              ▲ {report.now.exposureUnknown} client(s) sans exposition connue : comptés pour 0 dans les parts en exposition.
            </span>
          )}
        </div>
      </section>

      <Section id="kri" title="Indicateurs de risque (KRI)" intro="Qualité du portefeuille : feux selon les seuils paramétrés, variation sur l'horizon, tendance des 12 derniers mois.">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {kRisk.map((k) => (
            <KriTile key={k.def.code} k={k} report={report} />
          ))}
        </div>
      </Section>

      <Section id="kpi" title="Indicateurs de processus (KPI)" intro="Qualité du dispositif de notation : couverture, renouvellement, dérogations, délais, suivi de la watch list.">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {kProc.map((k) => (
            <KriTile key={k.def.code} k={k} report={report} />
          ))}
        </div>
      </Section>

      <Section id="evolution" title="Évolution sur 24 mois" intro="Photographie de fin de mois : chaque point reprend les notes qui faisaient foi à cette date. Parts en exposition notée.">
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14 }}>Parts en risque élevé, en défaut et en watch list</h3>
            <LineChart
              label="Évolution des parts en risque élevé, en défaut et en watch list"
              dates={dates}
              series={[
                { label: `Risque élevé (${hr}+)`, color: "var(--viz-1)", values: s.map((p) => p.highRiskPct) },
                { label: "Défaut", color: "var(--viz-2)", values: s.map((p) => p.defaultPct) },
                { label: "Watch list", color: "var(--viz-3)", values: s.map((p) => p.watchlistPct) },
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14 }}>Note moyenne pondérée (performants)</h3>
            <LineChart
              label="Évolution de la note moyenne pondérée"
              dates={dates}
              unit="grade"
              yFloor={1}
              series={[{ label: "Note moyenne", color: "var(--viz-1)", values: s.map((p) => p.avgGrade) }]}
            />
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14 }}>Couverture et notes expirées</h3>
            <LineChart
              label="Évolution de la couverture de la notation et des notes expirées"
              dates={dates}
              series={[
                { label: "Couverture", color: "var(--viz-1)", values: s.map((p) => p.coveragePct) },
                { label: "Notes expirées", color: "var(--viz-2)", values: s.map((p) => p.expiredPct) },
              ]}
            />
          </div>
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h3 style={{ fontWeight: 600, fontSize: 14 }}>Exposition notée</h3>
            <LineChart label="Évolution de l'exposition notée" dates={dates} unit="amount" series={[{ label: "Exposition", color: "var(--viz-1)", values: s.map((p) => p.exposure) }]} />
          </div>
        </div>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Voir les données mensuelles</summary>
          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table className="data" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Fin de mois</th>
                  <th style={{ textAlign: "right" }}>Clients notés</th>
                  <th style={{ textAlign: "right" }}>Exposition</th>
                  <th style={{ textAlign: "right" }}>Note moy.</th>
                  <th style={{ textAlign: "right" }}>Risque élevé</th>
                  <th style={{ textAlign: "right" }}>Défaut</th>
                  <th style={{ textAlign: "right" }}>Watch list</th>
                  <th style={{ textAlign: "right" }}>Couverture</th>
                  <th style={{ textAlign: "right" }}>Expirées</th>
                  <th style={{ textAlign: "right" }}>Validées</th>
                </tr>
              </thead>
              <tbody>
                {[...s].reverse().map((p) => (
                  <tr key={p.date}>
                    <td>{fmtMonth(p.date)}</td>
                    <td style={{ textAlign: "right" }}>{fmtInt(p.rated)}</td>
                    <td style={{ textAlign: "right" }}>{fmtAmount(p.exposure)}</td>
                    <td style={{ textAlign: "right" }}>{fmtNum(p.avgGrade, 2)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(p.highRiskPct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(p.defaultPct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(p.watchlistPct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(p.coveragePct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(p.expiredPct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtInt(p.validated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section id="repartition" title="Répartition par classe de note" intro={`Part de l'exposition notée par classe, au ${fmtDate(report.from)} et au ${fmtDate(asOf)}.`}>
        <GroupedColumns
          label="Répartition de l'exposition par classe de note, début et fin de période"
          categories={report.distribution.map((d) => (d.label === "D" ? "Déf." : d.label))}
          series={[
            { label: `Au ${fmtDate(report.from)}`, color: "var(--viz-past)", values: report.distribution.map((d) => d.beforePct) },
            { label: `Au ${fmtDate(asOf)}`, color: "var(--viz-1)", values: report.distribution.map((d) => d.nowPct) },
          ]}
          counts={[report.distribution.map((d) => d.beforeCount), report.distribution.map((d) => d.nowCount)]}
        />
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Voir les données</summary>
          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table className="data" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Classe</th>
                  <th style={{ textAlign: "right" }}>Clients (début)</th>
                  <th style={{ textAlign: "right" }}>Part (début)</th>
                  <th style={{ textAlign: "right" }}>Clients (fin)</th>
                  <th style={{ textAlign: "right" }}>Part (fin)</th>
                </tr>
              </thead>
              <tbody>
                {report.distribution.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label === "D" ? "Défaut" : d.label}</td>
                    <td style={{ textAlign: "right" }}>{fmtInt(d.beforeCount)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(d.beforePct)}</td>
                    <td style={{ textAlign: "right" }}>{fmtInt(d.nowCount)}</td>
                    <td style={{ textAlign: "right" }}>{fmtPct(d.nowPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section
        id="migration"
        title={`Matrice de migration sur ${horizon} mois`}
        intro="Cohorte : clients notés au début et à la fin de la période (note valide). Ligne = note de départ, colonne = note d'arrivée. Les entrées en portefeuille et les notes non renouvelées sont comptées à part pour ne pas fausser les taux. Les filtres segment, secteur et entité s'appliquent."
      >
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
          <span>
            Cohorte <strong>{fmtInt(m.cohort)}</strong>
          </span>
          <span>
            Améliorations <strong>{fmtPct(m.upgradePct)}</strong>
          </span>
          <span>
            Stables <strong>{fmtPct(m.stablePct)}</strong>
          </span>
          <span>
            Dégradations <strong>{fmtPct(m.downgradePct)}</strong>
          </span>
          <span>
            Solde <strong>{m.netPct === null ? "—" : `${m.netPct > 0 ? "+" : ""}${fmtNum(m.netPct, 1)} pt`}</strong>
          </span>
          <span>
            Variation moyenne <strong>{m.avgNotch === null ? "—" : `${m.avgNotch > 0 ? "+" : ""}${fmtNum(m.avgNotch, 2)} cran`}</strong>
          </span>
          <span>
            Passages en défaut <strong>{fmtInt(m.newDefaults)}</strong>
          </span>
          <span>
            Entrées <strong>{fmtInt(m.entrants)}</strong> · sorties ou non renouvelées <strong>{fmtInt(m.withdrawnTotal)}</strong>
          </span>
        </div>
        <MigrationHeatmap labels={m.labels} cells={m.cells} exposure={m.exposure} withdrawn={m.withdrawn} fromLabel={fmtDate(m.from)} toLabel={fmtDate(m.to)} />
      </Section>

      <Section id="ventilation" title="Ventilations" intro="Photographie à la date d'arrêté ; taux de dégradation calculé sur la cohorte de la matrice de migration.">
        <BreakdownTable title="Par segment" rows={report.bySegment} highRiskFrom={hr} />
        <BreakdownTable title="Par secteur" rows={report.bySector} highRiskFrom={hr} />
        <BreakdownTable title="Par entité" rows={report.byEntity} highRiskFrom={hr} />
      </Section>

      <Section id="concentration" title="Concentration : 20 premières expositions" intro="Part et part cumulée dans l'exposition notée de la sélection.">
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Client</th>
                <th>Entité</th>
                <th>Segment</th>
                <th>Secteur</th>
                <th>Note</th>
                <th style={{ textAlign: "right" }}>Exposition</th>
                <th style={{ textAlign: "right" }}>Part</th>
                <th style={{ textAlign: "right" }}>Cumul</th>
              </tr>
            </thead>
            <tbody>
              {report.top.map((r, i) => (
                <tr key={r.counterpartyId}>
                  <td>{i + 1}</td>
                  <td>
                    <Link href={`/counterparties/${r.counterpartyId}`}>{r.name}</Link>
                    {r.watchlist ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "var(--bad)" }}>{r.watchlist}</span> : null}
                    {r.expired ? <span style={{ marginLeft: 6, fontSize: 11, color: "var(--warn)" }}>note expirée</span> : null}
                  </td>
                  <td>{r.entityName}</td>
                  <td>{r.segment ?? "—"}</td>
                  <td>{r.sectorCode ?? "—"}</td>
                  <td>
                    <GradeBadge grade={r.grade} />
                  </td>
                  <td style={{ textAlign: "right" }}>{fmtAmount(r.exposure)}</td>
                  <td style={{ textAlign: "right" }}>{fmtPct(r.sharePct)}</td>
                  <td style={{ textAlign: "right" }}>{fmtPct(r.cumulativePct)}</td>
                </tr>
              ))}
              {!report.top.length && (
                <tr>
                  <td colSpan={9} className="muted">
                    Aucun client noté dans la sélection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="alertes" title="Alertes" intro="Listes de travail de la surveillance, à la date d'arrêté.">
        <AlertList
          title={`Dégradations fortes (${report.settings.strongDowngradeNotches} crans ou plus) sur ${horizon} mois`}
          empty="Aucune dégradation forte."
          head={["Client", "Avant", "Après", "Crans", "Exposition"]}
          rows={report.alerts.strongDowngrades.map((d) => [
            <Link key="n" href={`/counterparties/${d.counterpartyId}`}>
              {d.name}
            </Link>,
            <GradeBadge key="a" grade={d.fromGrade} />,
            <GradeBadge key="b" grade={d.toGrade} />,
            `+${d.notches}`,
            fmtAmount(d.exposure),
          ])}
        />
        <AlertList
          title={`Passages en défaut sur ${horizon} mois`}
          empty="Aucun passage en défaut."
          head={["Client", "Avant", "Après", "Exposition"]}
          rows={report.alerts.newDefaults.map((d) => [
            <Link key="n" href={`/counterparties/${d.counterpartyId}`}>
              {d.name}
            </Link>,
            <GradeBadge key="a" grade={d.fromGrade} />,
            <GradeBadge key="b" grade={d.toGrade} />,
            fmtAmount(d.exposure),
          ])}
        />
        <AlertList
          title={`Watch list : échéances (${late.length} en retard)`}
          empty="Aucun client en watch list."
          head={["Client", "Niveau", "Inscrit le", "Note", "Revue avant le", "Renotation avant le"]}
          rows={report.alerts.watchlist.map((w) => [
            <Link key="n" href={`/counterparties/${w.counterpartyId}`}>
              {w.name}
            </Link>,
            w.level,
            fmtDate(w.since),
            <GradeBadge key="g" grade={w.grade} />,
            <Due key="r" date={w.reviewDue} late={w.reviewLate} />,
            <Due key="t" date={w.renotationDue} late={w.renotationLate} done={!w.renotationLate && w.renotationDue < asOf} />,
          ])}
        />
        <AlertList
          title="Impayés et dépassements sur les lignes d'engagement"
          empty="Aucun impayé ni dépassement sur les lignes d'engagement."
          head={["Client", "Note", "Encours", "Impayés", "Plus ancien", "Dépassement"]}
          rows={report.alerts.facilities.slice(0, 50).map((r) => [
            <Link key="n" href={`/counterparties/${r.counterpartyId}#engagements`}>
              {r.name}
            </Link>,
            <GradeBadge key="g" grade={r.grade} />,
            fmtAmount(r.position!.outstanding),
            fmtAmount(r.position!.overdue),
            r.position!.maxOverdueDays ? `${r.position!.maxOverdueDays} j` : "—",
            r.position!.overrun ? "▲ plus de 10 %" : "—",
          ])}
        />
        <AlertList
          title={`Notes expirées (validité ${report.validityMonths} mois)`}
          empty="Aucune note expirée."
          head={["Client", "Note", "Validée le", "Exposition"]}
          rows={report.alerts.expired.slice(0, 50).map((r) => [
            <Link key="n" href={`/counterparties/${r.counterpartyId}`}>
              {r.name}
            </Link>,
            <GradeBadge key="g" grade={r.grade} />,
            fmtDate(r.effectiveDate),
            fmtAmount(r.exposure),
          ])}
        />
        <AlertList
          title="Notes à renouveler dans les deux mois"
          empty="Aucune note n'arrive à échéance dans les deux mois."
          head={["Client", "Note", "Validée le", "Exposition"]}
          rows={report.alerts.expiringSoon.slice(0, 50).map((r) => [
            <Link key="n" href={`/counterparties/${r.counterpartyId}`}>
              {r.name}
            </Link>,
            <GradeBadge key="g" grade={r.grade} />,
            fmtDate(r.effectiveDate),
            fmtAmount(r.exposure),
          ])}
        />
      </Section>

      <Section id="catalogue" title="Catalogue des indicateurs" intro="Définitions, seuils en vigueur, fréquence de production et responsable proposés. Les seuils se paramètrent dans Administration › Paramétrage.">
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Indicateur</th>
                <th>Type</th>
                <th>Définition</th>
                <th>Seuils</th>
                <th>Fréquence</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {KRI_CATALOG.map((k) => (
                <tr key={k.code}>
                  <td>
                    <strong>{k.labelFr}</strong>
                  </td>
                  <td>{k.family === "RISQUE" ? "KRI" : "KPI"}</td>
                  <td style={{ fontSize: 12 }}>{k.definitionFr}</td>
                  <td style={{ fontSize: 12 }}>{thresholdFr(k, report.settings.thresholds[k.code])}</td>
                  <td style={{ fontSize: 12 }}>{k.frequencyFr}</td>
                  <td style={{ fontSize: 12 }}>{k.ownerFr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Due({ date, late, done }: { date: string; late: boolean; done?: boolean }) {
  if (done) return <span className="muted">{fmtDate(date)} · faite</span>;
  return late ? (
    <span style={{ color: "var(--bad)", fontWeight: 600 }}>
      <span aria-hidden="true">✕ </span>
      {fmtDate(date)} · en retard
    </span>
  ) : (
    <span>{fmtDate(date)}</span>
  );
}

function AlertList({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <h3 style={{ fontWeight: 600, fontSize: 14 }}>
        {title} {rows.length ? <span className="muted">· {rows.length}</span> : null}
      </h3>
      {rows.length ? (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 13 }}>
          {empty}
        </p>
      )}
    </div>
  );
}
