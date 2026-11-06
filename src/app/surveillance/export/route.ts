import { csvLine } from "@/lib/csv";
import { buildSurveillance, canViewSurveillance, loadPortfolio, loadSurveillanceSettings, parseSurveillanceParams, scaleInfo } from "@/lib/portfolio-data";
import { effectiveScale, today } from "@/lib/rating-scale";
import { getDb, getSessionIdentity } from "@/lib/session";
import { toGradeScaleConfig } from "@/reference/rating-scale";

export const dynamic = "force-dynamic";

const n = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d).replace(".", ","));

/**
 * Export CSV de la surveillance (séparateur « ; », Excel FR), mêmes filtres que
 * l'écran : portefeuille (photographie), migrations (mouvements individuels et
 * matrice), indicateurs, évolution mensuelle. Données du périmètre de la session.
 */
export async function GET(req: Request) {
  const session = await getSessionIdentity("READONLY");
  if (!session.ok) return new Response(session.reasonFr, { status: 401 });
  if (!(await canViewSurveillance(session.identity))) return new Response("Accès réservé à la surveillance du portefeuille.", { status: 403 });
  const url = new URL(req.url);
  const p = Object.fromEntries(url.searchParams.entries());
  const db = await getDb();
  const base = await loadSurveillanceSettings(db);
  const { asOf, horizon, filters } = parseSurveillanceParams(p, today(), base.horizonMonths);
  const report = buildSurveillance(await loadPortfolio(db, filters), asOf, horizon, scaleInfo(toGradeScaleConfig(await effectiveScale(asOf))));
  const kind = p.kind ?? "portefeuille";
  let lines: string[];
  if (kind === "migrations") {
    const m = report.migration;
    lines = [
      csvLine([`Migrations du ${m.from} au ${m.to}`]),
      csvLine(["Client", "Entité", "Segment", "Secteur", "Note de départ", "Note d'arrivée", "Crans", "Exposition"]),
      ...m.moves.map((x) => csvLine([x.name, report.entityName[x.entityId] ?? x.entityId, x.segment, x.sectorCode, x.fromGrade, x.toGrade, x.notches, n(x.exposure, 0)])),
      "",
      csvLine(["Matrice (clients)", ...m.labels, "Sortie / non renouvelée"]),
      ...m.labels.map((l, i) => csvLine([l, ...m.cells[i], m.withdrawn[i]])),
    ];
  } else if (kind === "indicateurs") {
    lines = [
      csvLine([`Indicateurs au ${asOf}, horizon ${horizon} mois`]),
      csvLine(["Code", "Indicateur", "Type", "Valeur", "Valeur au début", "Feu", "Seuil orange", "Seuil rouge", "Commentaire"]),
      ...report.kris.map((k) =>
        csvLine([k.def.code, k.def.labelFr, k.def.family === "RISQUE" ? "KRI" : "KPI", n(k.value), n(k.previous), k.rag, n(report.settings.thresholds[k.def.code]?.amber), n(report.settings.thresholds[k.def.code]?.red), k.noteFr])
      ),
    ];
  } else if (kind === "evolution") {
    lines = [
      csvLine(["Fin de mois", "Clients notés", "Exposition", "Note moyenne", "Risque élevé %", "Défaut %", "Watch list %", "Couverture %", "Notes expirées %", "Concentration top 10 %", "Notes validées"]),
      ...report.series.map((s) => csvLine([s.date, s.rated, n(s.exposure, 0), n(s.avgGrade), n(s.highRiskPct), n(s.defaultPct), n(s.watchlistPct), n(s.coveragePct), n(s.expiredPct), n(s.top10Pct), s.validated])),
    ];
  } else {
    lines = [
      csvLine(["Client", "Entité", "Segment", "Secteur", "Note", "Arrêté", "Validée le", "Exposition", "Exposition connue", "Note expirée", "Watch list"]),
      ...[...report.rows]
        .sort((a, b) => b.exposure - a.exposure)
        .map((r) => csvLine([r.name, report.entityName[r.entityId] ?? r.entityId, r.segment, r.sectorCode, r.grade, r.asOfDate, r.effectiveDate, n(r.exposure, 0), r.exposureKnown ? "oui" : "non", r.expired ? "oui" : "non", r.watchlist])),
    ];
  }
  const file = `surveillance-${kind}-${asOf}.csv`.replace(/[^\w.\-]/g, "_");
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
  });
}
