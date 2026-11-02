"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MasterScaleVersion } from "@/reference/rating-scale";
import { deleteScaleVersionAction, saveScaleVersionAction } from "./actions";

type Row = MasterScaleVersion & { state: string };

const STATE_LABELS: Record<string, string> = { EN_VIGUEUR: "En vigueur", A_VENIR: "À venir", REMPLACEE: "Remplacée" };

function bounds(v: MasterScaleVersion, i: number): string {
  const b = v.bands[i];
  const upper = i === 0 ? null : v.bands[i - 1].minScore;
  if (b.minScore === null) return `< ${upper}`;
  if (upper === null) return `≥ ${b.minScore}`;
  return `${b.minScore} à ${upper}`;
}

function nextVersionId(versions: Row[]): string {
  const year = new Date().getFullYear();
  const n = versions.filter((v) => v.version.startsWith(`ECH10-${year}.`)).length + 1;
  return `ECH10-${year}.${n}`;
}

export function ScaleEditor({
  readOnly,
  today,
  versions,
  current,
  requiredGrades,
}: {
  readOnly: boolean;
  today: string;
  versions: Row[];
  current: MasterScaleVersion;
  requiredGrades: string[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveScaleVersionAction, undefined);
  const [editing, setEditing] = useState<{ base: MasterScaleVersion; replacing?: string } | null>(null);
  const [deleting, startDelete] = useTransition();
  const [deleteMsg, setDeleteMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [bands, setBands] = useState(current.bands);

  function startNew(base: MasterScaleVersion, replacing?: string) {
    setEditing({ base, replacing });
    setBands(base.bands.map((b) => ({ ...b })));
  }

  function remove(version: string) {
    if (!window.confirm(`Retirer la version ${version}, qui n'est pas encore en vigueur ?`)) return;
    startDelete(async () => {
      const res = await deleteScaleVersionAction(version);
      setDeleteMsg(res.errorFr ? { error: res.errorFr } : { ok: res.okFr });
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 6 }}>
          Version en vigueur — {current.version}
        </h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          {current.labelFr} · depuis le {current.effectiveFrom} · {current.status === "CALIBRATED" ? "calibrée" : "provisoire"}
          {current.noteFr ? ` · ${current.noteFr}` : ""}
        </p>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Score brut</th>
                <th>Libellé</th>
              </tr>
            </thead>
            <tbody>
              {current.bands.map((b, i) => (
                <tr key={b.grade}>
                  <td>
                    <strong>{b.grade}</strong>
                  </td>
                  <td className="nowrap">{bounds(current, i)}</td>
                  <td>{b.labelFr}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>DEF1 à DEF3</strong>
                </td>
                <td className="muted">hors échelle</td>
                <td className="muted">Défaut constaté (retard, improbabilité de paiement, procédure) : s&apos;impose quel que soit le score</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Classes citées par les plafonds des grilles : {requiredGrades.join(", ") || "aucune"} — une nouvelle version doit les
          conserver.
        </p>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Historique des versions</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date d&apos;effet</th>
                <th>État</th>
                <th>Classes</th>
                <th>Motif</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...versions].reverse().map((v) => (
                <tr key={v.version}>
                  <td className="nowrap">
                    <strong>{v.version}</strong>
                  </td>
                  <td className="nowrap">{v.effectiveFrom}</td>
                  <td>{STATE_LABELS[v.state] ?? v.state}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {v.bands.map((b, i) => `${b.grade} : ${bounds(v, i)}`).join(" · ")}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {v.noteFr ?? "—"}
                    {v.createdBy ? ` (${v.createdBy})` : ""}
                  </td>
                  <td className="nowrap">
                    {!readOnly && v.state === "A_VENIR" && (
                      <>
                        <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => startNew(v, v.version)}>
                          Modifier
                        </button>{" "}
                        <button type="button" className="btn-danger" style={{ fontSize: 12 }} disabled={deleting} onClick={() => remove(v.version)}>
                          Retirer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deleteMsg?.ok && (
          <p role="status" style={{ color: "var(--good)", fontSize: 13, marginTop: 8 }}>
            {deleteMsg.ok}
          </p>
        )}
        {deleteMsg?.error && (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13, marginTop: 8 }}>
            {deleteMsg.error}
          </p>
        )}
      </section>

      {readOnly ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Lecture seule : seul un administrateur du groupe peut publier une nouvelle version de l&apos;échelle.
        </p>
      ) : !editing ? (
        <button type="button" className="btn-primary" style={{ justifySelf: "start" }} onClick={() => startNew(current)}>
          + Nouvelle version de l&apos;échelle
        </button>
      ) : (
        <form action={action} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <h2 style={{ fontWeight: 600 }}>
            {editing.replacing ? `Modifier la version à venir ${editing.replacing}` : "Nouvelle version de l'échelle"}
          </h2>
          {editing.replacing && <input type="hidden" name="replacing" value={editing.replacing} />}
          <div className="grid-fields">
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Identifiant de version *
              </div>
              <input name="version" required defaultValue={editing.replacing ?? nextVersionId(versions)} maxLength={40} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Date d&apos;effet * (aujourd&apos;hui au plus tôt)
              </div>
              <input type="date" name="effectiveFrom" required min={today} defaultValue={editing.replacing ? editing.base.effectiveFrom : today} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Libellé *
              </div>
              <input name="labelFr_scale" required defaultValue={editing.base.labelFr} maxLength={120} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                Statut
              </div>
              <select name="status" defaultValue={editing.base.status}>
                <option value="PROVISIONAL">Provisoire (bornes expertes)</option>
                <option value="CALIBRATED">Calibrée (validée sur défauts observés)</option>
              </select>
            </label>
          </div>
          <label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Motif (décision du comité, référence)
            </div>
            <input name="noteFr" defaultValue={editing.replacing ? editing.base.noteFr : ""} maxLength={300} />
          </label>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Score minimal (inclus)</th>
                  <th>Libellé</th>
                  <th>
                    <span className="sr-only">Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        name="grade"
                        aria-label={`Code de la classe ${i + 1}`}
                        value={b.grade}
                        onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      {i === bands.length - 1 ? (
                        <>
                          <input type="hidden" name="minScore" value="" />
                          <span className="muted">jusqu&apos;à 0</span>
                        </>
                      ) : (
                        <input
                          name="minScore"
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          aria-label={`Score minimal de la classe ${b.grade || i + 1}`}
                          value={b.minScore ?? ""}
                          onChange={(e) =>
                            setBands((bs) => bs.map((x, j) => (j === i ? { ...x, minScore: e.target.value === "" ? null : Number(e.target.value) } : x)))
                          }
                          style={{ width: 100 }}
                        />
                      )}
                    </td>
                    <td>
                      <input
                        name="labelFr"
                        aria-label={`Libellé de la classe ${b.grade || i + 1}`}
                        value={b.labelFr}
                        onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, labelFr: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      {bands.length > 3 && (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ fontSize: 12 }}
                          aria-label={`Retirer la classe ${b.grade || i + 1}`}
                          onClick={() => setBands((bs) => bs.filter((_, j) => j !== i).map((x, j, arr) => (j === arr.length - 1 ? { ...x, minScore: null } : x)))}
                        >
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: 13 }}
              onClick={() =>
                setBands((bs) => {
                  const last = bs[bs.length - 1];
                  const prevMin = bs.length > 1 ? (bs[bs.length - 2].minScore ?? 10) : 50;
                  return [...bs.slice(0, -1), { ...last, minScore: Math.max(1, Math.round(prevMin / 2)) }, { grade: String(bs.length + 1), minScore: null, labelFr: "" }];
                })
              }
            >
              + Ajouter une classe
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Classes du meilleur au moins bon risque ; scores minimaux décroissants ; la dernière classe va jusqu&apos;à 0.
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer la version"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Annuler
            </button>
            {state?.errorFr && (
              <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
                {state.errorFr}
              </span>
            )}
            {state?.okFr && (
              <span role="status" style={{ color: "var(--good)", fontSize: 13 }}>
                {state.okFr}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
