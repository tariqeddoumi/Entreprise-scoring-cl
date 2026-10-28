"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  createBatchAction,
  createScheduleAction,
  previewSelectionAction,
  toggleScheduleAction,
  type RenotationActionResult,
} from "./actions";

export interface SelectionChoices {
  entities: Array<{ id: string; name: string; level: number }>;
  groups: Array<{ id: string; code: string; name: string; members: number }>;
  sectors: string[];
}

function Feedback({ state }: { state: RenotationActionResult }) {
  if (state.errorFr)
    return (
      <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
        {state.errorFr}
      </div>
    );
  if (state.okFr)
    return (
      <div role="status" style={{ color: "var(--good)", fontSize: 13 }}>
        {state.okFr}
      </div>
    );
  return null;
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
    {children}
  </div>
);

/** Champs de sélection communs au lot immédiat et à la planification. */
function SelectionFields({ choices, defaults }: { choices: SelectionChoices; defaults?: { economicGroupId?: string; segment?: string; sectorPrefix?: string } }) {
  return (
    <div className="grid-fields">
      <label>
        <Label>Banque ou filiale (et sa descendance)</Label>
        <select name="entityId" defaultValue="">
          <option value="">Tout mon périmètre</option>
          {choices.entities.map((e) => (
            <option key={e.id} value={e.id}>
              {"  ".repeat(e.level)}
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>Groupe d&apos;affaires</Label>
        <select name="economicGroupId" defaultValue={defaults?.economicGroupId ?? ""}>
          <option value="">Tous</option>
          {choices.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} — {g.name} ({g.members})
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>Segment</Label>
        <select name="segment" defaultValue={defaults?.segment ?? ""}>
          <option value="">Tous</option>
          <option value="TPE">TPE</option>
          <option value="PME">PME</option>
          <option value="GE">GE</option>
        </select>
      </label>
      <label>
        <Label>Secteur (code ou début de code)</Label>
        <input name="sectorPrefix" list="renotation-sectors" placeholder="ex. C10, F41" defaultValue={defaults?.sectorPrefix ?? ""} maxLength={30} />
        <datalist id="renotation-sectors">
          {choices.sectors.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        <Label>Note validée depuis plus de (mois)</Label>
        <input name="validatedBeforeMonths" type="number" min={1} max={120} placeholder="toutes" />
      </label>
    </div>
  );
}

function OptionFields() {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 320px" }}>
        <input type="checkbox" name="openCases" defaultChecked style={{ width: "auto" }} />
        <span style={{ fontSize: 14 }}>Ouvrir un dossier de revue en cas de migration, d&apos;absence de note ou de défaut</span>
      </label>
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>à partir de</span>
        <input type="number" name="notchThreshold" min={1} max={10} defaultValue={1} style={{ width: 72 }} />
        <span style={{ fontSize: 14 }}>cran(s)</span>
      </label>
    </div>
  );
}

/** Lancement immédiat d'un lot. */
export function BatchForm({ choices, defaultAsOf, defaults }: { choices: SelectionChoices; defaultAsOf: string; defaults?: { economicGroupId?: string; segment?: string; sectorPrefix?: string } }) {
  const [state, action, pending] = useActionState(createBatchAction, { ok: false });
  const [preview, setPreview] = useState<RenotationActionResult | null>(null);
  const [previewing, startPreview] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Lancer une renotation</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Chaque contrepartie retenue est renotée à partir de la saisie de sa dernière notation validée, à la date d&apos;arrêté
          choisie et avec la version courante du modèle. Le résultat est une notation de surveillance : la note officielle ne
          change qu&apos;après instruction et validation d&apos;un dossier.
        </p>
      </div>
      <div className="grid-fields">
        <label>
          <Label>Nom du lot</Label>
          <input name="name" required minLength={3} maxLength={120} defaultValue={`Renotation arrêté ${defaultAsOf}`} />
        </label>
        <label>
          <Label>Date d&apos;arrêté</Label>
          <input type="date" name="asOfDate" required defaultValue={defaultAsOf} />
        </label>
      </div>
      <SelectionFields choices={choices} defaults={defaults} />
      <OptionFields />
      <label>
        <Label>Données rafraîchies (facultatif) : fichier CSV, première colonne « ice » ou « id »</Label>
        <input type="file" name="refresh" accept=".csv,text/csv" />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Colonnes : clés de champ du dossier, par exemple <code>criteria.D3.1.value</code> (retards en jours),{" "}
          <code>criteria.D3.5.score</code>, <code>amounts.globalBankExposure</code>, <code>redFlags.RF07</code>. Une valeur hors
          grille est refusée.
        </div>
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-ghost"
          disabled={previewing}
          onClick={() => formRef.current && startPreview(async () => setPreview(await previewSelectionAction(new FormData(formRef.current!))))}
        >
          {previewing ? "Comptage…" : "Compter la sélection"}
        </button>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Préparation du lot…" : "Lancer le lot"}
        </button>
        {preview && <Feedback state={preview} />}
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Planification périodique. */
export function ScheduleForm({ choices }: { choices: SelectionChoices }) {
  const [state, action, pending] = useActionState(createScheduleAction, { ok: false });
  return (
    <form action={action} className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ fontWeight: 600 }}>Planifier une renotation périodique</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          Le lot est créé automatiquement à chaque échéance, avec pour date d&apos;arrêté la fin du mois précédent, puis traité par
          la tâche planifiée du serveur.
        </p>
      </div>
      <div className="grid-fields">
        <label>
          <Label>Nom</Label>
          <input name="name" required minLength={3} maxLength={120} placeholder="ex. Surveillance mensuelle PME" />
        </label>
        <label>
          <Label>Fréquence</Label>
          <select name="intervalMonths" defaultValue="1">
            <option value="1">Mensuelle</option>
            <option value="3">Trimestrielle</option>
            <option value="6">Semestrielle</option>
            <option value="12">Annuelle</option>
          </select>
        </label>
        <label>
          <Label>Jour d&apos;exécution (1 à 28)</Label>
          <input type="number" name="dayOfMonth" min={1} max={28} defaultValue={5} />
        </label>
      </div>
      <SelectionFields choices={choices} />
      <OptionFields />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer la planification"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function ScheduleToggle({ scheduleId, active }: { scheduleId: string; active: boolean }) {
  const [state, action, pending] = useActionState(toggleScheduleAction, { ok: false });
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" className="btn-ghost" disabled={pending} style={{ fontSize: 12 }}>
        {active ? "Suspendre" : "Réactiver"}
      </button>
      {state.errorFr && <span style={{ color: "var(--bad)", fontSize: 12 }}>{state.errorFr}</span>}
    </form>
  );
}
