"use client";

import { useMemo } from "react";
import type { ModelConfig } from "@/core/types";
import type { StatementFormat } from "@/financials/statement-format";
import { draftClassification, draftFinancials, type CaseDraft, type CaseLift } from "@/lib/case-input";
import { combineCaps, FAMILY_LABELS, FAMILY_ORDER, type ClassificationSettings, type ClassificationItem, type WatchlistCap } from "@/reference/classification";

const FAMILY_COLORS = { SENSIBLE: "var(--warn)", PREDOUTEUX: "var(--bcp-orange)", DOUTEUX: "var(--bad)", COMPROMIS: "var(--bad)" } as const;

function StateCell({ item }: { item: ClassificationItem }) {
  if (item.state === "COCHE")
    return (
      <span style={{ fontWeight: 700, color: FAMILY_COLORS[item.family] }}>
        ☑ Coché{item.by === "BILAN" ? " (bilan)" : ""}
      </span>
    );
  if (item.state === "LEVE") return <span style={{ fontWeight: 600, color: "var(--good)" }}>☑ Levé par le comité</span>;
  if (item.state === "SUGGERE") return <span style={{ color: "var(--bcp-orange)" }}>À vérifier (signalé par le bilan)</span>;
  return <span className="muted">☐ Non</span>;
}

/**
 * Critères de classement BAM (1/W/2025, 19/G/2002) du dossier : tableau
 * synthétique par famille, état de chaque critère et effet sur la note
 * (plafond ou défaut). Les critères issus du bilan se cochent seuls ; les
 * autres sont déclarés par l'analyste, datés et commentés. Seule une décision
 * de comité, enregistrée par un profil habilité, lève un critère.
 */
export function ClassificationPanel({
  model,
  draft,
  onChange,
  readOnly = false,
  format,
  settings,
  lifts,
  watchlist = null,
  cumulNotch = 0,
}: {
  model: ModelConfig;
  draft: CaseDraft;
  onChange?: (next: CaseDraft) => void;
  readOnly?: boolean;
  format?: StatementFormat;
  settings: ClassificationSettings;
  lifts: CaseLift[];
  watchlist?: WatchlistCap | null;
  cumulNotch?: number;
}) {
  const fin = useMemo(() => draftFinancials(draft, model, format), [draft, model, format]);
  const cl = useMemo(() => draftClassification(draft, fin, settings, lifts), [draft, fin, settings, lifts]);
  const declared = draft.classification?.declared ?? {};
  const editable = !readOnly && !!onChange;
  const setDeclared = (code: string, value: { date?: string; comment?: string } | null) => {
    const next = { ...declared };
    if (value) next[code] = value;
    else delete next[code];
    onChange?.({ ...draft, classification: { declared: next } });
  };
  const combined = cl.effect?.kind === "DEFAUT" ? null : combineCaps(cl.effect?.kind === "PLAFOND" ? cl.effect.grade : null, watchlist, cumulNotch);
  const wlFr = watchlist
    ? ` Watch list ${watchlist.level} (${watchlist.labelFr}) depuis le ${watchlist.since} : plafond ${watchlist.cap}.${combined ? ` Plafond appliqué : ${combined.cap}${combined.source === "CUMUL" ? " (cumul)" : ""}.` : ""}`
    : "";
  const effectFr = !cl.effect
    ? "Aucun critère actif : pas d'effet sur la note."
    : cl.effect.kind === "PLAFOND"
      ? `${FAMILY_LABELS[cl.family!]} : note plafonnée à ${cl.effect.grade} au mieux.`
      : `${FAMILY_LABELS[cl.family!]} : note de défaut ${cl.effect.grade}.`;

  return (
    <section id="classement" className="card no-print" style={{ padding: 16, display: "grid", gap: 12, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Critères de classement BAM</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Circulaire 1/W/2025 (et ancienne 19/G/2002). Les critères issus du bilan se cochent automatiquement ; les autres se déclarent, datés et
          commentés. Effet sur la note : créance sensible → note plafonnée à {settings.caps.SENSIBLE} ; pré-douteuse → {settings.caps.PREDOUTEUX} ;
          douteuse → {settings.caps.DOUTEUX} ; compromise → {settings.caps.COMPROMIS}. Seule une décision de comité, enregistrée par un profil habilité,
          lève un critère pour ce dossier. Le classement officiel des créances reste établi par le système de provisionnement.
        </p>
      </div>
      <div
        role="status"
        style={{
          borderLeft: `6px solid ${cl.family ? FAMILY_COLORS[cl.family] : watchlist ? "var(--bad)" : "var(--good)"}`,
          background: "var(--surface-2)",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        <strong>
          {cl.family ? FAMILY_LABELS[cl.family] : "Aucun critère de classement actif"}
          {watchlist ? ` · watch list ${watchlist.level}` : ""}
        </strong>
        <div style={{ fontSize: 13 }}>
          {effectFr}
          {wlFr}
          {cl.lifted.length > 0 ? ` Critère(s) levé(s) par le comité : ${cl.lifted.join(", ")}.` : ""}
        </div>
      </div>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Critère</th>
              <th>Source</th>
              <th>État</th>
              <th>Date et commentaire</th>
            </tr>
          </thead>
          <tbody>
            {FAMILY_ORDER.map((f) => {
              const rows = cl.items.filter((i) => i.family === f);
              if (!rows.length) return null;
              const n = rows.filter((i) => i.state === "COCHE").length;
              return [
                <tr key={f}>
                  <th colSpan={4} style={{ textAlign: "left", background: "var(--surface-2)" }}>
                    {FAMILY_LABELS[f]} {n > 0 ? <span style={{ color: FAMILY_COLORS[f] }}>· {n} coché(s)</span> : null}
                  </th>
                </tr>,
                ...rows.map((i) => {
                  const d = declared[i.code];
                  const canTick = editable && i.source === "DECLARE" && i.state !== "LEVE";
                  return (
                    <tr key={i.code}>
                      <td>
                        <strong>{i.code}</strong> — {i.labelFr}
                        <div className="muted" style={{ fontSize: 11 }}>{i.article}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{i.source === "BILAN" ? "Bilan (automatique)" : "Déclaratif"}</td>
                      <td style={{ fontSize: 12 }}>
                        {canTick ? (
                          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              style={{ width: 16 }}
                              aria-label={`Critère ${i.code} coché`}
                              checked={!!d}
                              onChange={(e) => setDeclared(i.code, e.target.checked ? { date: draft.asOfDate } : null)}
                            />
                            <StateCell item={i} />
                          </label>
                        ) : (
                          <StateCell item={i} />
                        )}
                      </td>
                      <td>
                        {canTick && d ? (
                          <div style={{ display: "grid", gap: 4 }}>
                            <input type="date" aria-label={`Date du constat ${i.code}`} value={d.date ?? ""} onChange={(e) => setDeclared(i.code, { ...d, date: e.target.value })} />
                            <input aria-label={`Commentaire ${i.code}`} maxLength={500} placeholder="Constat, pièce, source" value={d.comment ?? ""} onChange={(e) => setDeclared(i.code, { ...d, comment: e.target.value })} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 12 }}>
                            {i.date ?? ""}
                            {i.comment ? ` · ${i.comment}` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
