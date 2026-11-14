"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  FACILITY_SIGNALS,
  FACILITY_STATUS_LABELS,
  facilityTotals,
  NATURE_LABELS,
  type Facility,
  type FacilityFinding,
  type FacilitySettings,
  type FacilityTotals,
  type FacilityType,
} from "@/reference/facilities";
import { reconcileFacilitiesAction, saveFacilitiesAction, syncFacilitiesAction } from "../facility-actions";
import { RECONCILIATION_LABELS, type FacilityReconciliation, type MatchProposal } from "@/reference/reconciliation";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const amount = (v: number | null | undefined) => (v === null || v === undefined ? "—" : nf.format(v));
const LEVEL = { INFO: { c: "var(--muted)", i: "ℹ" }, ATTENTION: { c: "var(--warn)", i: "▲" }, ALERTE: { c: "var(--bad)", i: "✕" } } as const;
const BASIS_FR = { MAX: "le plus grand de l'autorisé et de l'encours", AUTORISE: "l'autorisé", ENCOURS: "l'encours" } as const;

export interface FacilityRow extends Facility {
  id: string;
  source: "API" | "SAISIE";
  asOfDate: string;
  reconciliation?: FacilityReconciliation | null;
  matchedReference?: string | null;
}

/**
 * Rapprochement des lignes saisies avec les lignes rapatriées de T24 :
 * l'appariement proposé (référence, type, montants, échéance) se confirme ou
 * se corrige ligne à ligne. Tant qu'il n'est pas validé, les lignes saisies ne
 * comptent pas dans les totaux.
 */
function ReconcilePanel({
  counterpartyId,
  lines,
  proposals,
  typeLabel,
  onDone,
}: {
  counterpartyId: string;
  lines: FacilityRow[];
  proposals: MatchProposal[];
  typeLabel: (code: string) => string;
  onDone: (msg: string) => void;
}) {
  const router = useRouter();
  const api = lines.filter((l) => l.source === "API");
  const byId = new Map(lines.map((l) => [l.id, l]));
  const [choice, setChoice] = useState<Record<string, { action: FacilityReconciliation; apiId: string }>>(() =>
    Object.fromEntries(proposals.map((p) => [p.manualId, { action: p.apiId ? "RAPPROCHEE" : "CONSERVEE", apiId: p.apiId ?? "" }]))
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const desc = (l: FacilityRow | undefined) =>
    l ? `${l.labelFr || typeLabel(l.typeCode)}${l.reference ? ` · ${l.reference}` : ""} · autorisé ${amount(l.authorized)} · encours ${amount(l.outstanding)}` : "—";
  return (
    <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 8, borderLeft: "4px solid var(--warn)" }}>
      <strong style={{ fontSize: 13 }}>Rapprochement des lignes saisies avec T24 ({proposals.length})</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        Appariement proposé par référence, type, montants et échéance. Rapprochée : la ligne T24 la remplace dans les totaux, la saisie reste
        consultable. Gardée : ligne absente de T24 (elle s&apos;ajoute aux lignes T24). Écartée : ligne saisie par erreur ou soldée.
      </p>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th scope="col">Ligne saisie</th>
              <th scope="col">Ligne T24 proposée</th>
              <th scope="col">Décision</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => {
              const c = choice[p.manualId];
              return (
                <tr key={p.manualId}>
                  <td style={{ fontSize: 12 }}>{desc(byId.get(p.manualId))}</td>
                  <td>
                    <select
                      aria-label={`Ligne T24 pour ${desc(byId.get(p.manualId))}`}
                      value={c.apiId}
                      onChange={(e) => setChoice((x) => ({ ...x, [p.manualId]: { action: e.target.value ? "RAPPROCHEE" : x[p.manualId].action === "RAPPROCHEE" ? "CONSERVEE" : x[p.manualId].action, apiId: e.target.value } }))}
                    >
                      <option value="">— Aucune —</option>
                      {api.map((a) => (
                        <option key={a.id} value={a.id}>
                          {desc(a)}
                        </option>
                      ))}
                    </select>
                    {p.apiId && p.apiId === c.apiId && p.why.length > 0 && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        Proposée : {p.why.join(", ")}
                      </div>
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`Décision pour ${desc(byId.get(p.manualId))}`}
                      value={c.action}
                      onChange={(e) => setChoice((x) => ({ ...x, [p.manualId]: { ...x[p.manualId], action: e.target.value as FacilityReconciliation } }))}
                    >
                      <option value="RAPPROCHEE" disabled={!c.apiId}>
                        Rapprocher de la ligne T24
                      </option>
                      <option value="CONSERVEE">Garder (absente de T24)</option>
                      <option value="ECARTEE">Écarter</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await reconcileFacilitiesAction(
                counterpartyId,
                proposals.map((p) => ({ manualId: p.manualId, action: choice[p.manualId].action, apiId: choice[p.manualId].action === "RAPPROCHEE" ? choice[p.manualId].apiId : null }))
              );
              if (r.ok) {
                onDone(r.okFr ?? "");
                router.refresh();
              } else setMsg({ error: r.errorFr });
            })
          }
        >
          {pending ? "Enregistrement…" : "Valider le rapprochement"}
        </button>
      </div>
      {msg?.ok && (
        <p role="status" style={{ color: "var(--good)", fontSize: 13 }}>
          {msg.ok}
        </p>
      )}
      {msg?.error && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {msg.error}
        </p>
      )}
    </div>
  );
}

function Totals({ t, currency, settings }: { t: FacilityTotals; currency: string; settings: FacilitySettings }) {
  const cell = (label: string, value: string, sub?: string) => (
    <div className="card" style={{ padding: 10, boxShadow: "none", minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--heading)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11 }} className="muted">{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {cell(
        "Engagement global",
        `${amount(t.exposure)} ${currency}`,
        `Par ligne : ${BASIS_FR[settings.basis]}${settings.offBalanceWeightPct !== 100 ? ` ; signature à ${settings.offBalanceWeightPct} %` : ""}`
      )}
      {cell("Autorisé", amount(t.authorized), `Bilan ${amount(t.bilan.authorized)} · signature ${amount(t.horsBilan.authorized)}`)}
      {cell("Encours", amount(t.outstanding), t.utilisationPct !== null ? `Utilisation ${Math.round(t.utilisationPct)} %` : undefined)}
      {cell("Court terme / moyen et long terme", `${amount(t.shortTerm.outstanding)} / ${amount(t.longTerm.outstanding)}`, "Encours")}
      {cell("Impayés", amount(t.overdue), t.maxOverdueDays ? `Plus ancien : ${t.maxOverdueDays} jours` : undefined)}
      {cell("Garanties", amount(t.guaranteeValue), "Valeur déclarée")}
    </div>
  );
}

const EMPTY: Facility = {
  reference: "",
  typeCode: "FACILITE_CAISSE",
  labelFr: "",
  authorized: null,
  outstanding: null,
  overdue: null,
  overdueDays: null,
  startDate: "",
  maturityDate: "",
  guarantees: "",
  guaranteeValue: null,
  status: "ACTIVE",
};

/**
 * Engagements du client chez la banque, ligne par ligne : rapatriés de T24
 * (remplacés à chaque rapatriement) ou saisis (remplacés à chaque saisie).
 */
export function FacilitiesPanel({
  counterpartyId,
  lines,
  totals,
  findings,
  signals,
  positionDate,
  settings,
  types,
  currency,
  today,
  canEdit,
  t24Ready,
  compact = false,
  guaranteeTypes = [],
  pendingMatches = [],
}: {
  counterpartyId: string;
  lines: FacilityRow[];
  totals: FacilityTotals;
  findings: FacilityFinding[];
  signals: string[];
  positionDate: string | null;
  settings: FacilitySettings;
  types: FacilityType[];
  currency: string;
  today: string;
  canEdit: boolean;
  t24Ready: boolean;
  /** Vue du dossier : synthèse, détail sur la fiche client. */
  compact?: boolean;
  /** Types de garantie paramétrés (saisie par liste). */
  guaranteeTypes?: Array<{ code: string; labelFr: string; active: boolean }>;
  /** Lignes saisies à rapprocher des lignes T24, avec l'appariement proposé. */
  pendingMatches?: MatchProposal[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Facility[] | null>(null);
  const [asOf, setAsOf] = useState(today);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.labelFr ?? code;
  const nature = (code: string) => NATURE_LABELS[types.find((t) => t.code === code)?.nature ?? "BILAN"];
  // Aperçu en saisie : avec des lignes T24, les nouvelles lignes saisies seront à rapprocher (hors totaux).
  const hasApi = lines.some((l) => l.source === "API");
  const draftTotals = useMemo(() => (edit ? facilityTotals(hasApi ? lines.filter((l) => l.source === "API" || l.reconciliation === "CONSERVEE") : edit, types, settings) : null), [edit, lines, types, settings, hasApi]);
  const set = (i: number, p: Partial<Facility>) => setEdit((e) => e!.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));
  const run = (f: () => Promise<{ ok: boolean; okFr?: string; errorFr?: string }>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await f();
      if (r.ok) {
        setMsg({ ok: r.okFr });
        after?.();
        router.refresh();
      } else setMsg({ error: r.errorFr });
    });

  return (
    <section id="engagements" data-toc="Engagements chez la banque" className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Engagements chez la banque</h2>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Lignes d&apos;autorisation, crédits et engagements par signature, rapatriés de T24 ou saisis, en {currency}. Ils donnent l&apos;engagement global du
          dossier (segmentation, délégation) et se rapprochent de l&apos;encours déclaré au crédit bureau.
          {positionDate ? ` Position au ${positionDate}.` : ""}
        </p>
      </div>
      {lines.length ? (
        <Totals t={totals} currency={currency} settings={settings} />
      ) : (
        <p role="status" style={{ fontSize: 13, color: "var(--warn)" }}>
          ▲ Aucune ligne d&apos;engagement enregistrée pour ce client{t24Ready ? " : rapatriez-les depuis T24 ou saisissez-les." : " : saisissez-les."}
        </p>
      )}
      {findings.length > 0 && (
        <ul style={{ display: "grid", gap: 4, margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 13 }}>
          {findings.map((f, i) => (
            <li key={i} style={{ display: "flex", gap: 6 }}>
              <span aria-hidden="true" style={{ color: LEVEL[f.level].c, fontWeight: 700 }}>
                {LEVEL[f.level].i}
              </span>
              <span>{f.textFr}</span>
            </li>
          ))}
        </ul>
      )}
      {signals.length > 0 && (
        <div style={{ fontSize: 13, padding: "8px 12px", borderLeft: "4px solid var(--bcp-orange)", background: "var(--surface-2)", borderRadius: 6 }}>
          <strong>Critères de classement BAM proposés à vérifier :</strong> {signals.map((s) => FACILITY_SIGNALS[s as keyof typeof FACILITY_SIGNALS] ?? s).join(" ; ")}.
        </div>
      )}
      {compact ? (
        <Link href={`/counterparties/${counterpartyId}#engagements`} style={{ color: "var(--brand)", fontSize: 13 }}>
          Détail des {lines.length} ligne(s) sur la fiche client
        </Link>
      ) : (
        lines.length > 0 &&
        !edit && (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Nature</th>
                  <th style={{ textAlign: "right" }}>Autorisé</th>
                  <th style={{ textAlign: "right" }}>Encours</th>
                  <th style={{ textAlign: "right" }}>Impayé</th>
                  <th>Échéance</th>
                  <th>Garanties</th>
                  <th>Statut</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.labelFr || typeLabel(l.typeCode)}
                      {l.reference ? <div className="muted" style={{ fontSize: 11 }}>{l.reference}</div> : null}
                    </td>
                    <td style={{ fontSize: 12 }}>{nature(l.typeCode)}</td>
                    <td style={{ textAlign: "right" }}>{amount(l.authorized)}</td>
                    <td style={{ textAlign: "right" }}>{amount(l.outstanding)}</td>
                    <td style={{ textAlign: "right" }}>
                      {amount(l.overdue)}
                      {l.overdueDays ? ` (${l.overdueDays} j)` : ""}
                    </td>
                    <td>{l.maturityDate || "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.guarantees || "—"}
                      {l.guaranteeValue ? ` · ${amount(l.guaranteeValue)}` : ""}
                    </td>
                    <td>{FACILITY_STATUS_LABELS[l.status]}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.source === "API" ? `T24 (${l.asOfDate})` : `Saisie (${l.asOfDate})`}
                      {l.source === "SAISIE" && l.reconciliation && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {RECONCILIATION_LABELS[l.reconciliation]}
                          {l.matchedReference ? ` ${l.matchedReference}` : ""}
                          {l.reconciliation !== "CONSERVEE" ? " — hors totaux" : ""}
                        </div>
                      )}
                      {l.source === "SAISIE" && !l.reconciliation && lines.some((x) => x.source === "API") && (
                        <div style={{ fontSize: 11, color: "var(--warn)", fontWeight: 600 }}>à rapprocher — hors totaux</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {canEdit && !compact && !edit && pendingMatches.length > 0 && (
        <ReconcilePanel
          key={pendingMatches.map((p) => `${p.manualId}:${p.apiId ?? ""}`).join(",")}
          counterpartyId={counterpartyId}
          lines={lines}
          proposals={pendingMatches}
          typeLabel={typeLabel}
          onDone={(m) => setMsg({ ok: m })}
        />
      )}

      {canEdit && !compact && !edit && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {t24Ready && (
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => syncFacilitiesAction(counterpartyId))}>
              {pending ? "Interrogation de T24…" : "Rapatrier depuis T24"}
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const manual = lines.filter((l) => l.source === "SAISIE");
              setEdit(manual.length ? manual.map(({ id: _id, source: _s, asOfDate: _a, reconciliation: _r, matchedReference: _m, ...f }) => f) : [{ ...EMPTY }]);
              setAsOf(manual[0]?.asOfDate ?? today);
            }}
          >
            {lines.some((l) => l.source === "SAISIE") ? "Modifier les lignes saisies" : "Saisir les lignes"}
          </button>
        </div>
      )}

      {edit && (
        <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>Lignes saisies</strong>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Position au *
              <input type="date" max={today} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
            {lines.some((l) => l.source === "API") && <span className="muted" style={{ fontSize: 12 }}>Les lignes rapatriées de T24 restent inchangées.</span>}
          </div>
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 1180 }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Référence</th>
                  <th>Autorisé</th>
                  <th>Encours</th>
                  <th>Impayé</th>
                  <th>Jours</th>
                  <th>Mise en place</th>
                  <th>Échéance</th>
                  <th>Garanties</th>
                  <th>Valeur</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {edit.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select aria-label={`Ligne ${i + 1} : type`} value={l.typeCode} onChange={(e) => set(i, { typeCode: e.target.value })}>
                        {types
                          .filter((t) => t.active || t.code === l.typeCode)
                          .map((t) => (
                            <option key={t.code} value={t.code}>
                              {t.labelFr}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input aria-label={`Ligne ${i + 1} : référence`} style={{ maxWidth: 120 }} value={l.reference} onChange={(e) => set(i, { reference: e.target.value })} />
                    </td>
                    {(["authorized", "outstanding", "overdue", "overdueDays"] as const).map((k) => (
                      <td key={k}>
                        <input
                          inputMode="decimal"
                          style={{ maxWidth: 120 }}
                          aria-label={`Ligne ${i + 1} : ${{ authorized: "autorisé", outstanding: "encours", overdue: "impayé", overdueDays: "jours d'impayé" }[k]}`}
                          value={l[k] ?? ""}
                          onChange={(e) => set(i, { [k]: num(e.target.value) })}
                        />
                      </td>
                    ))}
                    <td>
                      <input type="date" aria-label={`Ligne ${i + 1} : mise en place`} value={l.startDate} onChange={(e) => set(i, { startDate: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" aria-label={`Ligne ${i + 1} : échéance`} value={l.maturityDate} onChange={(e) => set(i, { maturityDate: e.target.value })} />
                    </td>
                    <td>
                      {guaranteeTypes.length > 0 ? (
                        <select aria-label={`Ligne ${i + 1} : garanties`} value={l.guarantees} onChange={(e) => set(i, { guarantees: e.target.value })}>
                          <option value="">— Choisir —</option>
                          {guaranteeTypes.filter((g) => g.active).map((g) => (
                            <option key={g.code} value={g.labelFr}>
                              {g.labelFr}
                            </option>
                          ))}
                          {l.guarantees && !guaranteeTypes.some((g) => g.active && g.labelFr === l.guarantees) && <option value={l.guarantees}>{l.guarantees} (hors liste)</option>}
                        </select>
                      ) : (
                        <input aria-label={`Ligne ${i + 1} : garanties`} value={l.guarantees} maxLength={300} onChange={(e) => set(i, { guarantees: e.target.value })} />
                      )}
                    </td>
                    <td>
                      <input inputMode="decimal" style={{ maxWidth: 110 }} aria-label={`Ligne ${i + 1} : valeur des garanties`} value={l.guaranteeValue ?? ""} onChange={(e) => set(i, { guaranteeValue: num(e.target.value) })} />
                    </td>
                    <td>
                      <select aria-label={`Ligne ${i + 1} : statut`} value={l.status} onChange={(e) => set(i, { status: e.target.value as Facility["status"] })}>
                        {(Object.keys(FACILITY_STATUS_LABELS) as Facility["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {FACILITY_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn-ghost" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => setEdit((e) => e!.filter((_, k) => k !== i))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-ghost" style={{ justifySelf: "start", fontSize: 12 }} onClick={() => setEdit((e) => [...e!, { ...EMPTY }])}>
            + Ajouter une ligne
          </button>
          {draftTotals && (
            <p style={{ fontSize: 13 }}>
              Après enregistrement : engagement global <strong>{amount(draftTotals.exposure)} {currency}</strong>, autorisé {amount(draftTotals.authorized)}, encours{" "}
              {amount(draftTotals.outstanding)}.
            </p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveFacilitiesAction(counterpartyId, edit, asOf), () => setEdit(null))}>
              {pending ? "Enregistrement…" : "Enregistrer les lignes"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
              Abandonner
            </button>
          </div>
        </div>
      )}
      {msg?.error && (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {msg.error}
        </p>
      )}
      {msg?.ok && (
        <p role="status" style={{ color: "var(--good)", fontSize: 13 }}>
          {msg.ok}
        </p>
      )}
    </section>
  );
}
