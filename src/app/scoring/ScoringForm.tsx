"use client";

import { useMemo, useState } from "react";
import type {
  CriterionConfig,
  CriterionInput,
  DataStatus,
  ModelConfig,
  RatingResult,
  Segment,
} from "@/core/types";
import { runScoringAction } from "./actions";
import { ResultPanel } from "./ResultPanel";

interface Props {
  model: ModelConfig;
  counterparties: Array<{ id: string; name: string }>;
}

type CriterionState = {
  status: DataStatus;
  value: string;
  score: string;
  specialCase: string;
};

const STATUSES: DataStatus[] = [
  "AVAILABLE",
  "MISSING",
  "NOT_APPLICABLE",
  "INVALID",
  "STALE",
  "ESTIMATED",
];

const CONFIDENCE_LEVELS = [100, 75, 50, 25, 0];

export function ScoringForm({ model, counterparties }: Props) {
  const [segment, setSegment] = useState<Segment>("PME");
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [counterpartyId, setCounterpartyId] = useState("");
  const [criteria, setCriteria] = useState<Record<string, CriterionState>>(() =>
    Object.fromEntries(
      model.criteria.map((c) => [
        c.code,
        { status: "AVAILABLE" as DataStatus, value: "", score: "50", specialCase: "" },
      ])
    )
  );
  const [confidence, setConfidence] = useState({
    completeness: 100,
    freshness: 100,
    reliability: 75,
    provenance: 75,
  });
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [companyAgeYears, setCompanyAgeYears] = useState("");
  const [hasStrongGroupSupport, setHasStrongGroupSupport] = useState(false);
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [defaultTriggered, setDefaultTriggered] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RatingResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applicable = useMemo(
    () => model.criteria.filter((c) => (c.weightsBps[segment] ?? 0) > 0),
    [model, segment]
  );

  function update(code: string, patch: Partial<CriterionState>) {
    setCriteria((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  async function submit() {
    setPending(true);
    setError(null);
    setMessage(null);

    const payloadCriteria: Record<string, CriterionInput> = {};
    for (const c of applicable) {
      const state = criteria[c.code];
      const entry: CriterionInput = { status: state.status };
      if (state.status === "AVAILABLE" || state.status === "ESTIMATED" || state.status === "STALE") {
        if (state.specialCase) {
          entry.specialCase = state.specialCase;
        } else if (c.type === "QUANTITATIVE") {
          const num = Number(state.value);
          if (state.value === "" || Number.isNaN(num)) {
            entry.status = "MISSING";
          } else {
            entry.value = num;
          }
        } else {
          entry.score = Number(state.score) as 0 | 25 | 50 | 75 | 100;
        }
      }
      payloadCriteria[c.code] = entry;
    }

    const payload = {
      modelId: model.modelId,
      segment,
      asOfDate,
      criteria: payloadCriteria,
      confidence,
      structuralFlags: {
        ...Object.fromEntries(Object.entries(flags).filter(([, v]) => v)),
        // L'ancienneté conditionne le cap CAP01 : sans elle, ce cap ne peut
        // jamais se déclencher depuis l'interface.
        ...(companyAgeYears !== "" && !Number.isNaN(Number(companyAgeYears))
          ? { companyAgeYears: Number(companyAgeYears) }
          : {}),
        ...(hasStrongGroupSupport ? { hasStrongGroupSupport: true } : {}),
      },
      redFlags,
      defaultTriggered,
    };

    try {
      const res = await runScoringAction(payload, counterpartyId || undefined);
      if (!res.ok) {
        setError(res.errorFr ?? "Erreur de validation.");
        setResult(null);
      } else {
        setResult(res.result ?? null);
        if (res.persisted) {
          setMessage(`Notation enregistrée (run ${res.runId}).`);
        } else if (res.persistenceWarningFr) {
          setMessage(res.persistenceWarningFr);
        } else {
          setMessage("Calcul effectué (simulation, non enregistrée).");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 12 }}>Cadrage du dossier</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Segment
            </div>
            <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
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
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Contrepartie (facultatif — enregistre le run)
            </div>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
            >
              <option value="">— Simulation non enregistrée —</option>
              {counterparties.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: 12,
            marginTop: 12,
            alignItems: "end",
          }}
        >
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Ancienneté de l&apos;entreprise (années)
            </div>
            <input
              type="number"
              min={0}
              step="0.5"
              placeholder="ex. 7"
              value={companyAgeYears}
              onChange={(e) => setCompanyAgeYears(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 8 }}>
            <input
              type="checkbox"
              style={{ width: 16 }}
              checked={hasStrongGroupSupport}
              onChange={(e) => setHasStrongGroupSupport(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Support de groupe juridiquement robuste (lève le cap CAP01 pour une
              entreprise de moins de deux ans)
            </span>
          </label>
        </div>
      </section>

      {model.domains.map((domain) => {
        const domainCriteria = applicable.filter((c) => c.domainCode === domain.code);
        if (domainCriteria.length === 0) return null;
        const weight = domainCriteria.reduce(
          (acc, c) => acc + (c.weightsBps[segment] ?? 0),
          0
        );
        return (
          <section key={domain.code} className="card" style={{ padding: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}
            >
              <h2 style={{ fontWeight: 600 }}>
                {domain.code} — {domain.labelFr}
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                Poids {segment} : {(weight / 100).toFixed(2)} %
              </span>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              {domainCriteria.map((c) => (
                <CriterionRow
                  key={c.code}
                  criterion={c}
                  segment={segment}
                  state={criteria[c.code]}
                  onChange={(patch) => update(c.code, patch)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Qualité des données</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Confiance = {model.confidenceWeights.completeness} % complétude +{" "}
          {model.confidenceWeights.freshness} % fraîcheur +{" "}
          {model.confidenceWeights.reliability} % fiabilité +{" "}
          {model.confidenceWeights.provenance} % provenance. Un niveau insuffisant
          empêche la production d&apos;un grade final.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
                value={confidence[key]}
                onChange={(e) =>
                  setConfidence((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
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

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Caps structurels</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Politique interne : un cap plafonne le grade final sans jamais modifier le
          score brut. Le plus contraignant s&apos;applique.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {CAP_FLAGS.map((f) => (
            <label key={f.key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                style={{ width: 16, marginTop: 3 }}
                checked={flags[f.key] ?? false}
                onChange={(e) =>
                  setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))
                }
              />
              <span style={{ fontSize: 13 }}>{f.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 4 }}>Red flags et défaut</h2>
        <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Un signal BLOCK arrête la notation ; un signal DEFAULT_CHECK ou REFER n&apos;est
          jamais dilué dans la moyenne pondérée.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
          {model.redFlags.map((rf) => (
            <label key={rf.code} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                style={{ width: 16, marginTop: 3 }}
                checked={redFlags.includes(rf.code)}
                onChange={(e) =>
                  setRedFlags((prev) =>
                    e.target.checked
                      ? [...prev, rf.code]
                      : prev.filter((c) => c !== rf.code)
                  )
                }
              />
              <span style={{ fontSize: 13 }}>
                <strong>{rf.code}</strong>{" "}
                <span className={badgeClass(rf.level)}>{rf.level}</span> — {rf.labelFr}
              </span>
            </label>
          ))}
        </div>
        <label
          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}
        >
          <input
            type="checkbox"
            style={{ width: 16 }}
            checked={defaultTriggered}
            onChange={(e) => setDefaultTriggered(e.target.checked)}
          />
          <span style={{ fontSize: 13 }}>
            Définition de défaut déclenchée (force un grade défaut, indépendamment du
            score)
          </span>
        </label>
      </section>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={submit}
          disabled={pending}
          style={{
            background: "var(--brand)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 20px",
            fontWeight: 600,
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Calcul en cours…" : "Calculer la notation"}
        </button>
        {message && <span className="muted">{message}</span>}
        {error && <span style={{ color: "var(--bad)" }}>{error}</span>}
      </div>

      {result && <ResultPanel result={result} model={model} />}
    </div>
  );
}

const CAP_FLAGS = [
  { key: "negativeTangibleEquity", label: "Fonds propres tangibles négatifs (CAP02)" },
  { key: "goingConcernMaterialUncertainty", label: "Incertitude sur la continuité (CAP03)" },
  { key: "accountsTooOld", label: "Comptes annuels trop anciens (CAP04)" },
  { key: "ebitdaNegativeTwoOfThreeYears", label: "EBITDA négatif 2 années sur 3 (CAP05)" },
  { key: "baseDscrBelow1", label: "DSCR < 1,0× en base (CAP06)" },
  { key: "stressDscrBelow1", label: "DSCR < 1,0× en stress seulement (CAP07)" },
  { key: "singleClientDependencyUnmitigated", label: "Dépendance client unique non mitigée (CAP08)" },
  { key: "activeRestructuringForbearance", label: "Restructuration / forbearance active (CAP09)" },
  { key: "materialGroupFileIncomplete", label: "Dossier groupe matériel incomplet (CAP10)" },
];

function badgeClass(level: string): string {
  return level === "BLOCK" ? "muted" : "muted";
}

function CriterionRow({
  criterion,
  segment,
  state,
  onChange,
}: {
  criterion: CriterionConfig;
  segment: Segment;
  state: CriterionState;
  onChange: (patch: Partial<CriterionState>) => void;
}) {
  const weight = (criterion.weightsBps[segment] ?? 0) / 100;
  const bins = criterion.binsBySegment?.[segment] ?? criterion.binsBySegment?.ALL;
  const editable =
    state.status === "AVAILABLE" || state.status === "ESTIMATED" || state.status === "STALE";

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {criterion.code} — {criterion.labelFr}
            {criterion.critical && (
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          gap: 10,
          marginTop: 8,
          alignItems: "start",
        }}
      >
        <select
          value={state.status}
          onChange={(e) => onChange({ status: e.target.value as DataStatus })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {editable ? (
          criterion.type === "QUANTITATIVE" ? (
            <div>
              <input
                type="number"
                step="any"
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
            <select value={state.score} onChange={(e) => onChange({ score: e.target.value })}>
              {criterion.anchors?.map((a) => (
                <option key={a.score} value={a.score}>
                  {a.score} — {a.labelFr}
                </option>
              ))}
            </select>
          )
        ) : (
          <div className="muted" style={{ fontSize: 12, paddingTop: 6 }}>
            {state.status === "NOT_APPLICABLE"
              ? "Poids redistribué à l'intérieur du domaine."
              : criterion.critical
                ? "Donnée critique absente : la notation sera bloquée."
                : "Critère exclu du calcul ; impact porté par le niveau de confiance."}
          </div>
        )}
      </div>
    </div>
  );
}
