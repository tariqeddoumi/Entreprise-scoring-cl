"use client";

import { useMemo, useState } from "react";
import type { CriterionConfig, DataStatus, GroupSupportInput, ModelConfig, Segment } from "@/core/types";
import { CAP_TRIGGER_TO_FLAG, RETIRED_CAP_OBSERVATIONS } from "@/core/structural-flags";
import { DEFAULT_GRADES } from "@/reference/default-policy";
import {
  carriesValue,
  DATA_STATUSES,
  displaySegment,
  isGatedOut,
  type CaseDraft,
  type CriterionDraft,
  type MaterialityFlag,
} from "@/lib/case-input";
import { DATA_STATUS_LABELS, RedFlagLevelBadge } from "../ui-helpers";

interface Props {
  model: ModelConfig;
  draft: CaseDraft;
  onChange: (next: CaseDraft) => void;
  /** Dossier soumis, validé ou profil en lecture seule : la saisie est figée. */
  readOnly?: boolean;
  /** Devise de saisie des montants (celle de la contrepartie). */
  currency?: string;
  /** Champs remplis depuis une proposition de l'IA acceptée (repère visuel). */
  aiFields?: ReadonlySet<string>;
}

/** Libellé des portes de matérialité que le modèle peut déclarer. */
const MATERIALITY_LABELS: Record<MaterialityFlag, string> = {
  esgPhysicalMaterial: "Risque climatique physique matériel",
  esgTransitionMaterial: "Risque de transition matériel",
  esgComplianceMaterial: "Risque de conformité environnementale matériel",
  covenantsMaterial: "Covenants matériels",
};

const GROUP_SUPPORT_CONDITIONS = [
  ["capacityDocumented", "Capacité financière du garant documentée"],
  ["willingnessDocumented", "Volonté de soutien démontrée (historique, engagement écrit)"],
  ["legallyBinding", "Engagement juridiquement contraignant"],
  ["fundsTransferable", "Transférabilité effective des fonds établie"],
] as const;

const CONFIDENCE_LEVELS = [100, 75, 50, 25, 0];

const AMOUNT_FIELDS = [
  ["annualTurnover", "Chiffre d'affaires HT du dernier exercice"],
  ["groupAnnualTurnover", "Chiffre d'affaires du groupe (s'il y a lieu)"],
  ["globalBankExposure", "Engagements bancaires globaux"],
] as const;

const UNAVAILABLE_FR: Partial<Record<DataStatus, string>> = {
  MISSING: "manquante",
  INVALID: "invalide",
  STALE: "périmée",
};

/**
 * Ce que le moteur V3 fera réellement du critère, dit à l'analyste au moment
 * où il choisit le statut — et non une règle générique, encore moins celle de
 * la V2 (retrait du dénominateur, redistribution proportionnelle), que la V3
 * a supprimée.
 */
function unavailableExplanation(criterion: CriterionConfig, status: DataStatus): string {
  if (status === "NOT_APPLICABLE") {
    const rule = criterion.notApplicableRule;
    if (rule) {
      return `Non applicable selon la règle du modèle : le poids est transféré à ${rule.transferWeightTo}, le poids total reste inchangé.`;
    }
    return "Le modèle ne prévoit pas de non-applicabilité pour ce critère : il sera traité comme une donnée manquante, et l'incohérence sera signalée.";
  }
  const etat = UNAVAILABLE_FR[status] ?? "indisponible";
  if (criterion.unavailablePolicy === "BLOCK") {
    return `Donnée critique ${etat} : aucune notation ne sera produite.`;
  }
  return `Donnée ${etat} : score prudent ${criterion.unavailableScore ?? 25} appliqué par la grille, poids conservé. La couverture observée diminue d'autant.`;
}

/**
 * Un critère compte comme renseigné s'il porte la donnée qui sera réellement
 * soumise au moteur : une valeur (ou un cas particulier) pour un critère
 * quantitatif, toujours vrai pour un qualitatif puisque son sélecteur porte
 * une valeur par défaut valide (voir `submit`). Un statut explicitement
 * différent de AVAILABLE compte aussi comme une décision prise par l'analyste.
 */
function isAnswered(criterion: CriterionConfig, state: CriterionDraft): boolean {
  if (!carriesValue(state.status)) return true;
  if (state.specialCase) return true;
  if (criterion.type === "QUANTITATIVE") return state.value.trim() !== "";
  return true;
}


/** Repère « proposé par l'IA » à côté d'un champ rempli depuis une proposition acceptée. */
function AiMark({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ai-mark" title="Valeur reprise d'une proposition de l'IA, acceptée par l'analyste">
      IA
    </span>
  );
}

/**
 * Grille de saisie d'un dossier de notation, générée depuis la version de
 * modèle publiée. Composant contrôlé : l'état (le brouillon) appartient à
 * l'écran qui l'affiche — dossier ou simulation — pour que les propositions de
 * l'IA, l'enregistrement et l'aperçu travaillent sur la même saisie.
 */
export function ScoringForm({ model, draft, onChange, readOnly = false, currency = "MAD", aiFields }: Props) {
  const segment = displaySegment(draft, model);
  const ai = (key: string) => aiFields?.has(key) ?? false;
  const set = (patch: Partial<CaseDraft>) => onChange({ ...draft, ...patch });

  // Portes de matérialité dérivées du modèle chargé (D-43).
  const materialityGates = useMemo(() => {
    const byFlag = new Map<MaterialityFlag, { rationaleFr: string; criteria: string[] }>();
    for (const c of model.criteria) {
      if (!c.materialityGate) continue;
      const entry = byFlag.get(c.materialityGate.flag) ?? { rationaleFr: c.materialityGate.rationaleFr, criteria: [] };
      entry.criteria.push(`${c.code} — ${c.labelFr}`);
      byFlag.set(c.materialityGate.flag, entry);
    }
    return [...byFlag.entries()].map(([flag, v]) => ({ flag, ...v }));
  }, [model]);

  // Les cases d'exception sont dérivées du modèle chargé, jamais recopiées.
  const exceptionFlags = useMemo(
    () =>
      model.nonCompensatoryRules
        .map((rule) => {
          const key = CAP_TRIGGER_TO_FLAG[rule.trigger];
          return key ? { key: key as string, code: rule.code, label: rule.labelFr, maxGrade: rule.maxGrade } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [model]
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const applicable = useMemo(
    () => model.criteria.filter((c) => (c.weightsBps[segment] ?? 0) > 0),
    [model, segment]
  );

  const answered = (c: CriterionConfig) => isGatedOut(c, draft.materiality) || isAnswered(c, draft.criteria[c.code]);
  const answeredCount = applicable.filter(answered).length;
  const unansweredCritical = applicable.filter((c) => c.unavailablePolicy === "BLOCK" && !answered(c));

  function update(code: string, patch: Partial<CriterionDraft>) {
    onChange({ ...draft, criteria: { ...draft.criteria, [code]: { ...draft.criteria[code], ...patch } } });
  }
  const groupSupport: GroupSupportInput = draft.groupSupport;

  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: 18, minWidth: 0 }}>
      <section
        className="card no-print"
        style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 5 }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
            <span className="muted">
              {answeredCount} / {applicable.length} critères renseignés
            </span>
            {unansweredCritical.length > 0 && (
              <span style={{ color: "var(--bad)", fontWeight: 600 }}>
                {unansweredCritical.length} critère(s) critique(s) manquant(s) :{" "}
                {unansweredCritical.map((c) => c.code).join(", ")}
              </span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--bg)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${applicable.length ? (answeredCount / applicable.length) * 100 : 0}%`,
                background: unansweredCritical.length > 0 ? "var(--warn)" : "var(--good)",
                transition: "width 150ms ease",
              }}
            />
          </div>
        </div>
        {/* Replier n'est pas une saisie : reste actif en lecture seule. */}
        <button
          type="button"
          onClick={() => setCollapsed(Object.fromEntries(model.domains.map((d) => [d.code, true])))}
          style={buttonGhostStyle}
        >
          Tout replier
        </button>
        <button type="button" onClick={() => setCollapsed({})} style={buttonGhostStyle}>
          Tout déplier
        </button>
      </section>

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Cadrage du dossier</h2>
        <div className="grid-fields">
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Segment
            </div>
            <select value={draft.segment} onChange={(e) => set({ segment: e.target.value as Segment | "" })}>
              <option value="">Déterminé par les montants</option>
              {model.segments.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Date d&apos;arrêté
            </div>
            <input type="date" value={draft.asOfDate} onChange={(e) => set({ asOfDate: e.target.value })} />
          </label>
        </div>
        <div className="grid-fields" style={{ marginTop: 12 }}>
          {AMOUNT_FIELDS.map(([key, label]) => (
            <label key={key}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {label} ({currency}) <AiMark show={ai(`amounts.${key}`)} />
              </div>
              <input
                inputMode="decimal"
                placeholder="ex. 95 000 000"
                value={draft.amounts[key]}
                onChange={(e) => set({ amounts: { ...draft.amounts, [key]: e.target.value } })}
              />
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Montants saisis dans la devise de la contrepartie. Ils sont convertis en MAD au
          cours publié à la date d&apos;arrêté pour la segmentation et la délégation ; la
          conversion est consignée dans le dossier.
          {!draft.segment && " Sans segment imposé, le chiffre d'affaires est obligatoire."}
        </p>
        <div className="age-row">
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Ancienneté de l&apos;entreprise (années) <AiMark show={ai("structuralFlags.companyAgeYears")} />
            </div>
            <input
              type="number"
              min={0}
              step="0.5"
              placeholder="ex. 7"
              value={draft.companyAgeYears}
              onChange={(e) => set({ companyAgeYears: e.target.value })}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 8 }}>
            <input
              type="checkbox"
              style={{ width: 16 }}
              checked={draft.hasStrongGroupSupport}
              onChange={(e) => set({ hasStrongGroupSupport: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              Support de groupe juridiquement robuste (une entreprise de moins de deux
              ans reste alors notée sur la grille au lieu d&apos;être routée vers le
              traitement « jeune entreprise »)
            </span>
          </label>
        </div>
      </section>

      {model.domains.map((domain) => {
        const domainCriteria = applicable.filter((c) => c.domainCode === domain.code);
        if (domainCriteria.length === 0) return null;
        const weight = domainCriteria.reduce((acc, c) => acc + (c.weightsBps[segment] ?? 0), 0);
        const domainAnswered = domainCriteria.filter(answered).length;
        const missingCritical = domainCriteria.filter((c) => c.unavailablePolicy === "BLOCK" && !answered(c)).length;
        const isCollapsed = collapsed[domain.code] ?? false;
        return (
          <section key={domain.code} className="card no-print" style={{ padding: 16 }}>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [domain.code]: !isCollapsed }))}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                marginBottom: isCollapsed ? 0 : 12,
                textAlign: "left",
              }}
              aria-expanded={!isCollapsed}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="muted" style={{ fontSize: 11, width: 12, display: "inline-block" }}>
                  {isCollapsed ? "▸" : "▾"}
                </span>
                <h2 style={{ fontWeight: 600 }}>
                  {domain.code} — {domain.labelFr}
                </h2>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {missingCritical > 0 && (
                  <span style={{ color: "var(--bad)", fontSize: 11, fontWeight: 600 }}>
                    {missingCritical} critique(s) manquant(s)
                  </span>
                )}
                <span className="muted" style={{ fontSize: 12 }}>
                  {domainAnswered}/{domainCriteria.length} · poids {segment} {(weight / 100).toFixed(2)} %
                </span>
              </span>
            </button>
            {!isCollapsed && (
              <div style={{ display: "grid", gap: 14 }}>
                {domainCriteria.map((c) => (
                  <CriterionRow
                    key={c.code}
                    criterion={c}
                    segment={segment}
                    state={draft.criteria[c.code]}
                    gatedOut={isGatedOut(c, draft.materiality)}
                    aiFilled={ai(`criteria.${c.code}.value`) || ai(`criteria.${c.code}.score`) || ai(`criteria.${c.code}.status`)}
                    onChange={(patch) => update(c.code, patch)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {materialityGates.length > 0 && (
        <section className="card no-print" style={{ padding: 16 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Matérialité des risques ESG</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Ces critères ne sont évalués que si le risque est matériel pour la
            contrepartie. Case non cochée : le critère est écarté et son poids transféré
            au critère désigné par le modèle, quelle que soit la saisie. La matérialité
            s&apos;établit depuis le référentiel sectoriel et la localisation des sites ;
            elle doit être justifiée au dossier.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {materialityGates.map((g) => (
              <label key={g.flag} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  style={{ width: 16, marginTop: 3 }}
                  checked={draft.materiality[g.flag] ?? false}
                  onChange={(e) => set({ materiality: { ...draft.materiality, [g.flag]: e.target.checked } })}
                />
                <span style={{ fontSize: 13 }}>
                  {MATERIALITY_LABELS[g.flag]} <AiMark show={ai(`materiality.${g.flag}`)} />{" "}
                  <span className="muted">({g.criteria.join(" ; ")})</span>
                  <span className="muted" style={{ display: "block", fontSize: 11 }}>
                    {g.rationaleFr}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Support groupe</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          {model.groupSupport.methodFr}
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            style={{ width: 16 }}
            checked={groupSupport.claimed}
            onChange={(e) =>
              set({ groupSupport: e.target.checked ? { claimed: true, requestedNotches: 1 } : { claimed: false } })
            }
          />
          <span style={{ fontSize: 13 }}>
            Relèvement au titre du support groupe demandé <AiMark show={ai("groupSupport.claimed")} />
          </span>
        </label>
        {groupSupport.claimed && (
          <div style={{ display: "grid", gap: 8, marginTop: 10, paddingLeft: 24 }}>
            {GROUP_SUPPORT_CONDITIONS.map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  style={{ width: 16 }}
                  checked={groupSupport[key] ?? false}
                  onChange={(e) => set({ groupSupport: { ...groupSupport, [key]: e.target.checked } })}
                />
                <span style={{ fontSize: 13 }}>
                  {label} <AiMark show={ai(`groupSupport.${key}`)} />
                </span>
              </label>
            ))}
            <label style={{ maxWidth: 320 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Relèvement demandé (crans, plafonné à {model.groupSupport.maxNotches})
              </div>
              <select
                value={groupSupport.requestedNotches ?? 0}
                onChange={(e) => set({ groupSupport: { ...groupSupport, requestedNotches: Number(e.target.value) } })}
              >
                {Array.from({ length: model.groupSupport.maxNotches + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Qualité des données</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Confiance = {model.confidence.weights.completeness} % complétude +{" "}
          {model.confidence.weights.freshness} % fraîcheur +{" "}
          {model.confidence.weights.reliability} % fiabilité +{" "}
          {model.confidence.weights.provenance} % provenance. Un niveau insuffisant
          empêche la production d&apos;un grade final.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {(
            [
              ["completeness", "Complétude"],
              ["freshness", "Fraîcheur"],
              ["reliability", "Fiabilité"],
              ["provenance", "Provenance"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {label}
              </div>
              <select
                value={draft.confidence[key]}
                onChange={(e) => set({ confidence: { ...draft.confidence, [key]: Number(e.target.value) } })}
              >
                {CONFIDENCE_LEVELS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Exceptions non compensatoires</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Ces constats plafonnent le grade sans jamais modifier le score brut ; le plus
          contraignant s&apos;applique. La liste est celle du modèle chargé : elle ne peut
          donc pas proposer une exception que le moteur n&apos;évalue pas.
        </p>
        {exceptionFlags.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Ce modèle ne définit aucune exception non compensatoire.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
            {exceptionFlags.map((f) => (
              <label key={f.key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  style={{ width: 16, marginTop: 3 }}
                  checked={draft.flags[f.key] ?? false}
                  onChange={(e) => set({ flags: { ...draft.flags, [f.key]: e.target.checked } })}
                />
                <span style={{ fontSize: 13 }}>
                  <strong>{f.code}</strong> — {f.label} <span className="muted">(plafond {f.maxGrade})</span>{" "}
                  <AiMark show={ai(`structuralFlags.${f.key}`)} />
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Constats structurels enregistrés</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Ces constats sont conservés dans le dossier et alimentent les red flags, la
          porte de couverture et les travaux de calibration. Ils ne plafonnent{" "}
          <strong>pas</strong> le grade : leur contribution est déjà portée par le critère
          indiqué. Les cocher n&apos;est donc pas un garde-fou — c&apos;est une information.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {RETIRED_CAP_OBSERVATIONS.map((o) => (
            <label key={o.flag} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                style={{ width: 16, marginTop: 3 }}
                checked={draft.flags[o.flag] ?? false}
                onChange={(e) => set({ flags: { ...draft.flags, [o.flag]: e.target.checked } })}
              />
              <span style={{ fontSize: 13 }}>
                {o.labelFr} <AiMark show={ai(`structuralFlags.${o.flag}`)} />
                <span className="muted" style={{ display: "block", fontSize: 11 }}>
                  {o.treatmentFr}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card no-print" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Red flags et défaut</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Un signal BLOCK arrête la notation ; un signal DEFAULT_CHECK ou REFER n&apos;est
          jamais dilué dans la moyenne pondérée.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 6 }}>
          {model.redFlags.map((rf) => (
            <label key={rf.code} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                style={{ width: 16, marginTop: 3 }}
                checked={draft.redFlags.includes(rf.code)}
                onChange={(e) =>
                  set({
                    redFlags: e.target.checked
                      ? [...new Set([...draft.redFlags, rf.code])]
                      : draft.redFlags.filter((c) => c !== rf.code),
                  })
                }
              />
              <span style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{rf.code}</strong>
                <RedFlagLevelBadge level={rf.level} />
                {rf.labelFr}
                <AiMark show={ai(`redFlags.${rf.code}`)} />
              </span>
            </label>
          ))}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <input
            type="checkbox"
            style={{ width: 16 }}
            checked={draft.defaultTriggered}
            onChange={(e) => set({ defaultTriggered: e.target.checked })}
          />
          <span style={{ fontSize: 13 }}>
            Définition de défaut déclenchée (force un grade défaut, indépendamment du
            score) <AiMark show={ai("defaultTriggered")} />
          </span>
        </label>
        {draft.defaultTriggered && (
          <label style={{ display: "block", marginTop: 8, maxWidth: 520 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Nature du défaut constaté
            </div>
            <select
              value={draft.defaultGrade}
              onChange={(e) => set({ defaultGrade: e.target.value as CaseDraft["defaultGrade"] })}
            >
              {DEFAULT_GRADES.map((d) => (
                <option key={d.grade} value={d.grade}>
                  {d.grade} — {d.labelFr}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
    </fieldset>
  );
}

export const buttonGhostStyle = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "5px 12px",
  color: "var(--text)",
  fontSize: 12,
} as const;

function CriterionRow({
  criterion,
  segment,
  state,
  gatedOut,
  aiFilled,
  onChange,
}: {
  criterion: CriterionConfig;
  segment: Segment;
  state: CriterionDraft;
  gatedOut: boolean;
  aiFilled: boolean;
  onChange: (patch: Partial<CriterionDraft>) => void;
}) {
  const weight = (criterion.weightsBps[segment] ?? 0) / 100;
  const bins = criterion.binsBySegment?.[segment] ?? criterion.binsBySegment?.ALL;
  const editable = carriesValue(state.status);
  const name = `${criterion.code} — ${criterion.labelFr}`;

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {criterion.code} — {criterion.labelFr} <AiMark show={aiFilled} />
            {criterion.unavailablePolicy === "BLOCK" && (
              <span style={{ color: "var(--bad)", marginLeft: 6, fontSize: 11 }}>
                critique
              </span>
            )}
          </div>
          {criterion.descriptionFr && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {criterion.descriptionFr}
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          {weight.toFixed(2)} %
        </div>
      </div>

      {gatedOut ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Risque non déclaré matériel (section « Matérialité des risques ESG ») :
          critère écarté, poids transféré à{" "}
          {criterion.notApplicableRule?.transferWeightTo ?? "—"}. Aucune saisie
          n&apos;est transmise.
        </div>
      ) : (
        <div className="criterion-input">
          <select
            aria-label={`Statut de la donnée — ${name}`}
            value={state.status}
            onChange={(e) => onChange({ status: e.target.value as DataStatus })}
          >
            {DATA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DATA_STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </select>

          {editable ? (
            criterion.type === "QUANTITATIVE" ? (
              <div>
                <input
                  type="number"
                  step="any"
                  aria-label={`Valeur — ${name}`}
                  placeholder={`Valeur${criterion.unit ? ` (${criterion.unit.trim()})` : ""}`}
                  value={state.value}
                  onChange={(e) => onChange({ value: e.target.value })}
                />
                {bins && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    Barème {segment} :{" "}
                    {bins
                      .slice()
                      .sort((a, b) => b.score - a.score)
                      .map(
                        (b) =>
                          `${b.score} → ${b.min === null ? "-∞" : b.min}${b.max === null ? " et +" : `–${b.max}`}`
                      )
                      .join(" | ")}
                  </div>
                )}
                {criterion.specialCases && criterion.specialCases.length > 0 && (
                  <label style={{ display: "block", marginTop: 6 }}>
                    <span className="muted" style={{ fontSize: 11 }}>
                      Cas particulier (prime sur la valeur mesurée)
                    </span>
                    <select
                      value={state.specialCase}
                      onChange={(e) => onChange({ specialCase: e.target.value })}
                      style={{ marginTop: 3 }}
                    >
                      <option value="">— aucun —</option>
                      {criterion.specialCases.map((sc) => (
                        <option key={sc.code} value={sc.code}>
                          {sc.labelFr} (score {sc.score})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ) : (
              <select
                aria-label={`Ancrage retenu — ${name}`}
                value={state.score}
                onChange={(e) => onChange({ score: e.target.value })}
              >
                {criterion.anchors?.map((a) => (
                  <option key={a.score} value={a.score}>
                    {a.score} — {a.labelFr}
                  </option>
                ))}
              </select>
            )
          ) : (
            <div
              className="muted"
              style={{
                fontSize: 12,
                paddingTop: 6,
                color: criterion.unavailablePolicy === "BLOCK" ? "var(--bad)" : undefined,
              }}
            >
              {unavailableExplanation(criterion, state.status)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
