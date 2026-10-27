"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCounterpartyAction, extractCounterpartyAction } from "./actions";

const FIELD_STYLE = { width: "100%" } as const;

interface FormState {
  name: string;
  ice: string;
  rc: string;
  fiscalId: string;
  legalForm: string;
  sectorCode: string;
  city: string;
  country: string;
  currency: string;
}

const EMPTY: FormState = {
  name: "",
  ice: "",
  rc: "",
  fiscalId: "",
  legalForm: "",
  sectorCode: "",
  city: "",
  country: "",
  currency: "",
};

const TEXT_FIELDS = ["ice", "rc", "fiscalId", "legalForm", "sectorCode", "city", "country", "currency"] as const;

export interface WritableEntity {
  id: string;
  name: string;
  level: number;
  country: string | null;
  currency: string;
}

interface Props {
  /** Banques et filiales où l'utilisateur peut créer une contrepartie. */
  entities: WritableEntity[];
  /** Entité de rattachement par défaut (celle de l'utilisateur). */
  defaultEntityId: string | null;
  aiUsable: boolean;
}

export function NewCounterpartyForm({ entities, defaultEntityId, aiUsable }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormState>(EMPTY);
  const [entityId, setEntityId] = useState(
    defaultEntityId && entities.some((e) => e.id === defaultEntityId) ? defaultEntityId : (entities[0]?.id ?? "")
  );
  const [pending, startTransition] = useTransition();
  const [extracting, startExtraction] = useTransition();
  const [errorFr, setErrorFr] = useState<string | null>(null);
  const [successFr, setSuccessFr] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const entity = entities.find((e) => e.id === entityId);

  function field(name: keyof FormState) {
    return {
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
    };
  }

  function label(text: string, name: keyof FormState) {
    return (
      <>
        {text}
        {aiFilled.has(name) && <span className="ai-mark">IA</span>}
      </>
    );
  }

  function extract(fd: FormData) {
    setAiNote(null);
    setErrorFr(null);
    startExtraction(async () => {
      const res = await extractCounterpartyAction(fd);
      if (!res.ok || !res.data) {
        setErrorFr(res.errorFr ?? "Pré-remplissage impossible.");
        return;
      }
      const data = res.data;
      const filled = new Set<string>();
      setValues((v) => {
        const next = { ...v };
        for (const k of ["name", ...TEXT_FIELDS] as const) {
          const val = data[k];
          if (val) {
            next[k] = val;
            filled.add(k);
          }
        }
        return next;
      });
      setAiFilled(filled);
      setAiNote(`${res.okFr ?? ""}${data.summary ? ` Activité : ${data.summary}` : ""}`);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorFr(null);
    setSuccessFr(null);
    const name = values.name.trim();
    if (!name) {
      setErrorFr("La raison sociale est obligatoire.");
      return;
    }

    const payload: Record<string, string> = { name };
    if (entityId) payload.entityId = entityId;
    for (const key of TEXT_FIELDS) {
      const v = values[key].trim();
      if (v) payload[key] = key === "country" || key === "currency" ? v.toUpperCase() : v;
    }

    startTransition(async () => {
      const res = await createCounterpartyAction(payload);
      if (res.ok) {
        setSuccessFr("Contrepartie enregistrée.");
        setValues(EMPTY);
        setAiFilled(new Set());
        setAiNote(null);
        router.refresh();
      } else {
        setErrorFr(res.errorFr ?? "Échec de l'enregistrement.");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)} style={{ justifySelf: "start", fontSize: 13 }}>
        + Nouvelle contrepartie
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Nouvelle contrepartie</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValues(EMPTY);
            setErrorFr(null);
            setSuccessFr(null);
            setAiFilled(new Set());
          }}
          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13 }}
        >
          Fermer
        </button>
      </div>

      {aiUsable && (
        <form action={extract} style={{ display: "grid", gap: 8, padding: 12, background: "var(--brand-soft)", borderRadius: 8 }}>
          <strong style={{ fontSize: 13 }}>Pré-remplir avec l&apos;IA</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Joignez un extrait du registre de commerce, une attestation ICE ou les statuts, ou collez un texte : la fiche est
            remplie, vous la relisez avant d&apos;enregistrer.
          </span>
          <textarea name="text" rows={3} maxLength={20000} placeholder="Texte collé (facultatif)" />
          <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" />
          <button type="submit" className="btn-ghost" disabled={extracting} style={{ justifySelf: "start" }}>
            {extracting ? "Lecture en cours…" : "Pré-remplir"}
          </button>
          {aiNote && (
            <span role="status" style={{ fontSize: 12 }}>
              {aiNote}
            </span>
          )}
        </form>
      )}

      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {entities.length > 1 && (
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Banque ou filiale *
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} style={FIELD_STYLE}>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {"— ".repeat(e.level)}
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Raison sociale *", "name")}
            <input type="text" required maxLength={300} style={FIELD_STYLE} {...field("name")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("ICE", "ice")}
            <input type="text" maxLength={20} style={FIELD_STYLE} {...field("ice")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Registre de commerce", "rc")}
            <input type="text" maxLength={30} style={FIELD_STYLE} {...field("rc")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Identifiant fiscal", "fiscalId")}
            <input type="text" maxLength={30} style={FIELD_STYLE} {...field("fiscalId")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Forme juridique", "legalForm")}
            <input type="text" maxLength={60} style={FIELD_STYLE} {...field("legalForm")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Code secteur", "sectorCode")}
            <input type="text" maxLength={30} style={FIELD_STYLE} {...field("sectorCode")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Ville", "city")}
            <input type="text" maxLength={80} style={FIELD_STYLE} {...field("city")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Pays (ISO)", "country")}
            <input type="text" maxLength={2} placeholder={entity?.country ?? "MA"} style={FIELD_STYLE} {...field("country")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label("Devise des comptes (ISO)", "currency")}
            <input type="text" maxLength={3} placeholder={entity?.currency ?? "MAD"} style={FIELD_STYLE} {...field("currency")} />
          </label>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Pays et devise vides : ceux de l&apos;entité de rattachement ({entity?.country ?? "—"}, {entity?.currency ?? "MAD"}). Les
          montants des dossiers sont saisis dans cette devise et convertis en MAD au cours du jour d&apos;arrêté.
        </span>

        {errorFr && (
          <p style={{ color: "var(--bad)", fontSize: 13 }} role="alert">
            {errorFr}
          </p>
        )}
        {successFr && (
          <p style={{ color: "var(--good)", fontSize: 13 }} role="status">
            {successFr}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={pending} style={{ justifySelf: "start", fontSize: 13 }}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
