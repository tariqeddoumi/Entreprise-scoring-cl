"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { getAt, MIN_MOTIF, type Correction, type FieldSpec } from "@/reference/corrections";
import type { IdentityCheck } from "@/reference/credit-report";
import { correctReportAction, updateIdentityAction } from "../external-actions";

/**
 * Outils communs aux rapports lus (solvabilité, InfoRisque) : signalétique
 * comparée à la fiche client, corrections motivées, historique des corrections.
 * Le rapport tel que lu n'est jamais modifié.
 */

const show = (v: unknown, spec?: FieldSpec | null): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "number") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(v);
  if (spec?.optionLabels && typeof v === "string") return spec.optionLabels[v] ?? v;
  return String(v);
};

export function IdentityChecks({
  checks,
  counterpartyId,
  kind,
  reportId,
  canEdit,
  t24,
}: {
  checks: IdentityCheck[];
  counterpartyId: string;
  kind: "CREDIT_REPORT" | "LEGAL_REPORT";
  reportId: string;
  canEdit: boolean;
  t24: boolean;
}) {
  const router = useRouter();
  const actionable = checks.filter((c) => c.status !== "IDENTIQUE" && !(t24 && c.status === "DIFFERENT"));
  const [picked, setPicked] = useState<string[]>(actionable.map((c) => c.field));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  if (!checks.length) return null;
  const color = { IDENTIQUE: "var(--good)", MANQUANT_FICHE: "var(--warn)", DIFFERENT: "var(--bad)" } as const;
  const label = { IDENTIQUE: "identique à la fiche", MANQUANT_FICHE: "absent de la fiche", DIFFERENT: "différent de la fiche" } as const;
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <strong style={{ fontSize: 13 }}>Signalétique du rapport et fiche client</strong>
      <div className="table-scroll">
        <table className="data" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {canEdit && actionable.length > 0 && <th scope="col">Reprendre</th>}
              <th scope="col">Rubrique</th>
              <th scope="col">Rapport</th>
              <th scope="col">Fiche client</th>
              <th scope="col">Contrôle</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => {
              const can = actionable.some((a) => a.field === c.field);
              return (
                <tr key={c.field}>
                  {canEdit && actionable.length > 0 && (
                    <td>
                      {can && (
                        <input
                          type="checkbox"
                          style={{ width: 16 }}
                          aria-label={`Reprendre ${c.labelFr} dans la fiche client`}
                          checked={picked.includes(c.field)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, c.field] : picked.filter((f) => f !== c.field))}
                        />
                      )}
                    </td>
                  )}
                  <td>{c.labelFr}</td>
                  <td>{c.report}</td>
                  <td>{c.client || <span className="muted">—</span>}</td>
                  <td style={{ color: color[c.status], fontWeight: 600 }}>
                    {label[c.status]}
                    {t24 && c.status === "DIFFERENT" ? " — à corriger dans T24" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && actionable.length > 0 && (
        <div>
          <button
            type="button"
            className="btn-ghost"
            disabled={pending || !picked.length}
            onClick={() =>
              start(async () => {
                const r = await updateIdentityAction(counterpartyId, kind, reportId, picked);
                setMsg(r.ok ? { ok: r.okFr } : { error: r.errorFr });
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? "Mise à jour…" : `Mettre à jour la fiche client (${picked.length})`}
          </button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
            Chaque reprise est journalisée avec l&apos;ancienne et la nouvelle valeur.{t24 ? " Fiche T24 : seuls les champs vides se complètent." : ""}
          </span>
        </div>
      )}
      {msg?.ok && (
        <p role="status" style={{ fontSize: 13, color: "var(--good)" }}>
          {msg.ok}
        </p>
      )}
      {msg?.error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>
          {msg.error}
        </p>
      )}
    </div>
  );
}

export function CorrectionsList({ items, documentHref }: { items: Correction[]; documentHref: (id: string) => string }) {
  if (!items.length) return null;
  return (
    <details>
      <summary style={{ cursor: "pointer", fontSize: 13 }}>Corrections motivées ({items.length})</summary>
      <div className="table-scroll" style={{ marginTop: 6 }}>
        <table className="data" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Par</th>
              <th scope="col">Champ</th>
              <th scope="col">Lu ou avant</th>
              <th scope="col">Retenu</th>
              <th scope="col">Motif</th>
              <th scope="col">Justificatif</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td style={{ whiteSpace: "nowrap" }}>{c.at.slice(0, 10)}</td>
                <td>{c.by}</td>
                <td>{c.labelFr}</td>
                <td>{show(c.before)}</td>
                <td style={{ fontWeight: 600 }}>{show(c.after)}</td>
                <td>{c.motif}</td>
                <td>{c.documentId ? <a href={documentHref(c.documentId)}>{c.documentName ?? "pièce"}</a> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface CorrectionTarget {
  path: string;
  group: string;
  spec: FieldSpec;
}

/** Formulaire de correction motivée : champ, nouvelle valeur, motif, justificatif. */
export function CorrectionForm({
  kind,
  counterpartyId,
  reportId,
  targets,
  current,
}: {
  kind: "CREDIT" | "LEGAL";
  counterpartyId: string;
  reportId: string;
  targets: CorrectionTarget[];
  current: unknown;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const target = targets.find((t) => t.path === path) ?? null;
  const groups = useMemo(() => [...new Set(targets.map((t) => t.group))], [targets]);
  if (!targets.length) return null;
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {!open ? (
        <button type="button" className="btn-ghost" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
          Corriger une information (motif et justificatif)
        </button>
      ) : (
        <form
          className="card"
          style={{ padding: 12, boxShadow: "none", display: "grid", gap: 8, minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" }}
          action={(fd) =>
            start(async () => {
              setMsg(null);
              const r = await correctReportAction(kind, counterpartyId, reportId, fd);
              if (r.ok) {
                setMsg({ ok: r.okFr });
                setPath("");
                setOpen(false);
                router.refresh();
              } else setMsg({ error: r.errorFr });
            })
          }
        >
          <strong style={{ fontSize: 13 }}>Correction motivée</strong>
          <p className="muted" style={{ fontSize: 12 }}>
            La valeur lue reste conservée et visible ; la correction s&apos;ajoute, datée et attribuée. Exemple : un impayé régularisé depuis l&apos;édition du
            rapport, attestation de mainlevée à l&apos;appui.
          </p>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Information à corriger
            <select name="path" value={path} onChange={(e) => setPath(e.target.value)} required>
              <option value="">— Choisir —</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {targets
                    .filter((t) => t.group === g)
                    .map((t) => (
                      <option key={t.path} value={t.path}>
                        {t.spec.labelFr} : {show(getAt(current, t.path), t.spec)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          {target && (
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              Nouvelle valeur (actuelle : {show(getAt(current, target.path), target.spec)})
              {target.spec.kind === "boolean" ? (
                <select name="value" required defaultValue="">
                  <option value="">— Choisir —</option>
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              ) : target.spec.kind === "enum" ? (
                <select name="value" required defaultValue="">
                  <option value="">— Choisir —</option>
                  {target.spec.options?.map((o) => (
                    <option key={o} value={o}>
                      {target.spec.optionLabels?.[o] ?? o}
                    </option>
                  ))}
                </select>
              ) : (
                <input name="value" type={target.spec.kind === "date" ? "date" : "text"} inputMode={target.spec.kind === "number" ? "decimal" : undefined} />
              )}
            </label>
          )}
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Motif ({MIN_MOTIF} caractères au moins)
            <textarea name="motif" required minLength={MIN_MOTIF} rows={2} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
            Justificatif (facultatif : attestation, mainlevée, courrier…)
            <input type="file" name="proof" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn-primary" disabled={pending || !target}>
              {pending ? "Enregistrement…" : "Enregistrer la correction"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {msg?.ok && (
        <p role="status" style={{ fontSize: 13, color: "var(--good)" }}>
          {msg.ok}
        </p>
      )}
      {msg?.error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--bad)" }}>
          {msg.error}
        </p>
      )}
    </div>
  );
}

/** Repère d'une valeur corrigée : la valeur lue en infobulle. */
export function Corrected({ value, read, corrected }: { value: string; read: string; corrected: boolean }) {
  if (!corrected) return <>{value}</>;
  return (
    <span title={`Valeur lue : ${read}`} style={{ fontWeight: 600, color: "var(--bcp-brown, #462016)" }}>
      {value} <span style={{ fontSize: 11, color: "var(--bcp-orange)" }}>(corrigé, lu {read})</span>
    </span>
  );
}
