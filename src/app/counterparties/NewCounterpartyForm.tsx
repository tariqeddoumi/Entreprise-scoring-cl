"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCounterpartyAction, extractCounterpartyAction, updateCounterpartyAction } from "./actions";
import { createFromT24Action, previewT24Action, type T24Result } from "./external-actions";
import { checkMinimalEntry, CUSTOMER_FIELDS, CUSTOMER_FIELD_LABELS } from "@/reference/core-banking";

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
  commercialSegment: string;
  coreBankingId: string;
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
  commercialSegment: "",
  coreBankingId: "",
};

const TEXT_FIELDS = ["ice", "rc", "fiscalId", "legalForm", "sectorCode", "city", "country", "currency", "commercialSegment", "coreBankingId"] as const;
const AI_FIELDS = ["ice", "rc", "fiscalId", "legalForm", "sectorCode", "city", "country", "currency"] as const;

/** Fiche existante à modifier (mode édition). */
export interface EditableCounterparty {
  id: string;
  entityId: string;
  values: Partial<FormState>;
}

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
  /** Présent : la fiche s'ouvre en modification de ce client. */
  edit?: EditableCounterparty;
  /** Rapatriement T24 activé (paramétrage). */
  t24Enabled?: boolean;
  /** Segments commerciaux actifs (paramétrage, alignés sur T24). */
  segments?: Array<{ code: string; labelFr: string }>;
  /** Fiche rapatriée de T24 (modification) : T24 fait foi. */
  fromT24?: boolean;
}

/** Création ou modification d'une fiche client. */
export function NewCounterpartyForm({ entities, defaultEntityId, aiUsable, edit, t24Enabled = false, segments = [], fromT24 = false }: Props) {
  const router = useRouter();
  const initial: FormState = edit ? { ...EMPTY, ...edit.values } : EMPTY;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormState>(initial);
  const [entityId, setEntityId] = useState(
    edit
      ? edit.entityId
      : defaultEntityId && entities.some((e) => e.id === defaultEntityId)
        ? defaultEntityId
        : (entities[0]?.id ?? "")
  );
  const [pending, startTransition] = useTransition();
  const [extracting, startExtraction] = useTransition();
  const [errorFr, setErrorFr] = useState<string | null>(null);
  const [successFr, setSuccessFr] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const entity = entities.find((e) => e.id === entityId);
  // Création : par le code client T24 (rapatriement), ou saisie minimale si le
  // client n'est pas encore dans T24 ou si T24 ne répond pas.
  const [mode, setMode] = useState<"T24" | "SAISIE">(t24Enabled ? "T24" : "SAISIE");
  const [t24Code, setT24Code] = useState("");
  const [t24, setT24] = useState<T24Result | null>(null);
  const [t24Pending, startT24] = useTransition();

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
        for (const k of ["name", ...AI_FIELDS] as const) {
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

    if (!edit) {
      const issues = checkMinimalEntry({ ...values, country: values.country || entity?.country || "MA" });
      if (issues.length) {
        setErrorFr(`Saisie minimale incomplète : ${issues.join(" ")}`);
        return;
      }
    }
    const payload: Record<string, string | null> = { name };
    if (entityId) payload.entityId = entityId;
    for (const key of TEXT_FIELDS) {
      const v = values[key].trim();
      if (v) payload[key] = key === "country" || key === "currency" ? v.toUpperCase() : v;
      // En modification, un champ vidé est effacé (la devise, elle, reste).
      else if (edit && key !== "currency" && initial[key]) payload[key] = null;
    }

    startTransition(async () => {
      const res = edit ? await updateCounterpartyAction(edit.id, payload) : await createCounterpartyAction(payload);
      if (res.ok && edit) {
        setSuccessFr("Fiche client mise à jour.");
        setOpen(false);
        router.refresh();
      } else if (res.ok) {
        setSuccessFr("Client enregistré.");
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
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className={edit ? "btn-ghost" : "btn-primary"}
          onClick={() => setOpen(true)}
          style={{ justifySelf: "start", fontSize: 13 }}
        >
          {edit ? "Modifier la fiche" : "+ Nouveau client"}
        </button>
        {successFr && (
          <span style={{ color: "var(--good)", fontSize: 13 }} role="status">
            {successFr}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>{edit ? "Modifier la fiche client" : "Nouveau client"}</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValues(initial);
            setErrorFr(null);
            setSuccessFr(null);
            setAiFilled(new Set());
          }}
          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13 }}
        >
          Fermer
        </button>
      </div>

      {!edit && (
        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          <legend className="sr-only">Mode de création</legend>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="mode" style={{ width: 16 }} checked={mode === "T24"} onChange={() => setMode("T24")} />
            Client présent dans T24 : rapatrier par le code client
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="radio" name="mode" style={{ width: 16 }} checked={mode === "SAISIE"} onChange={() => setMode("SAISIE")} />
            Pas encore dans T24, ou T24 indisponible : saisie minimale
          </label>
        </fieldset>
      )}

      {!edit && mode === "T24" && (
        <div style={{ display: "grid", gap: 10 }}>
          {!t24Enabled && (
            <p className="muted" style={{ fontSize: 12 }}>
              Rapatriement T24 non activé (Administration › Paramétrage › Référentiels externes) : utilisez la saisie minimale.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setT24(null);
              startT24(async () => setT24(await previewT24Action(t24Code)));
            }}
            style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}
          >
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Code client T24 *
              <input inputMode="numeric" value={t24Code} onChange={(e) => setT24Code(e.target.value)} placeholder="ex. 100245" style={{ maxWidth: 200 }} />
            </label>
            <button type="submit" className="btn-primary" disabled={t24Pending || !t24Code.trim()}>
              {t24Pending ? "Interrogation de T24…" : "Rapatrier depuis T24"}
            </button>
          </form>
          {t24 && !t24.ok && (
            <div role="alert" style={{ fontSize: 13, display: "grid", gap: 6 }}>
              <span style={{ color: "var(--bad)" }}>{t24.errorFr}</span>
              {t24.errorKind !== "CONFLIT" && t24.errorKind !== "INVALIDE" && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ justifySelf: "start", fontSize: 13 }}
                  onClick={() => {
                    setMode("SAISIE");
                    setValues((v) => ({ ...v, coreBankingId: t24.errorKind === "INTROUVABLE" ? "" : t24Code.replace(/\s/g, "") }));
                  }}
                >
                  Passer à la saisie minimale
                </button>
              )}
            </div>
          )}
          {t24?.ok && t24.customer && (
            <div className="card" style={{ padding: 12, boxShadow: "none", display: "grid", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Fiche T24 du client {t24.customer.code}</strong>
              <div className="table-scroll">
                <table className="data" style={{ minWidth: 420 }}>
                  <tbody>
                    {CUSTOMER_FIELDS.filter((f) => t24.customer![f]).map((f) => (
                      <tr key={f}>
                        <th style={{ width: "40%" }}>{CUSTOMER_FIELD_LABELS[f]}</th>
                        <td>{t24.customer![f]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t24.entityName ? (
                <span style={{ fontSize: 12 }}>Rattachement : {t24.entityName} (centre d&apos;affaires de T24).</span>
              ) : (
                entities.length > 1 && (
                  <label style={{ display: "grid", gap: 4, fontSize: 13, maxWidth: 360 }}>
                    Centre d&apos;affaires non reconnu : rattacher à
                    <select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                      {entities.map((e) => (
                        <option key={e.id} value={e.id}>
                          {"— ".repeat(e.level)}
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              )}
              <button
                type="button"
                className="btn-primary"
                style={{ justifySelf: "start", fontSize: 13 }}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await createFromT24Action(t24.customer!.code, entityId || null);
                    if (r.ok && r.id) router.push(`/counterparties/${r.id}`);
                    else setT24(r);
                  })
                }
              >
                {pending ? "Création…" : "Créer la fiche depuis T24"}
              </button>
            </div>
          )}
        </div>
      )}

      {aiUsable && !edit && mode === "SAISIE" && (
        <form action={extract} style={{ display: "grid", gap: 8, padding: 12, background: "var(--brand-soft)", borderRadius: 8 }}>
          <strong style={{ fontSize: 13 }}>Pré-remplir avec l&apos;IA</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            Joignez un extrait du registre de commerce, une attestation ICE ou les statuts, ou collez un texte : la fiche est
            remplie, vous la relisez avant d&apos;enregistrer.
          </span>
          <textarea name="text" rows={3} maxLength={20000} placeholder="Texte collé (facultatif)" aria-label="Texte à lire par l'IA" />
          <input type="file" name="file" aria-label="Pièce à lire par l'IA" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" />
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

      {(edit || mode === "SAISIE") && (
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        {!edit && (
          <p className="muted" style={{ fontSize: 12 }}>
            Saisie minimale : raison sociale, ICE ou RC, forme juridique, secteur et segment commercial suffisent pour dérouler la notation. La fiche
            sera complétée par T24 au rattachement du code client.
          </p>
        )}
        {fromT24 && (
          <p className="muted" style={{ fontSize: 12 }}>
            Fiche rapatriée de T24 : T24 fait foi, une modification ici sera remplacée à la prochaine actualisation.
          </p>
        )}
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
            {label(edit ? "ICE" : "ICE (ou RC) *", "ice")}
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
            {label(edit ? "Forme juridique" : "Forme juridique *", "legalForm")}
            <input type="text" maxLength={60} style={FIELD_STYLE} {...field("legalForm")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {label(edit ? "Secteur d'activité (code)" : "Secteur d'activité (code) *", "sectorCode")}
            <input type="text" maxLength={30} style={FIELD_STYLE} {...field("sectorCode")} />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            {edit ? "Segment commercial" : "Segment commercial *"}
            <select value={values.commercialSegment} onChange={(e) => setValues((v) => ({ ...v, commercialSegment: e.target.value }))} style={FIELD_STYLE}>
              <option value="">— Choisir —</option>
              {segments.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.labelFr}
                </option>
              ))}
              {values.commercialSegment && !segments.some((x) => x.code === values.commercialSegment) && <option value={values.commercialSegment}>{values.commercialSegment}</option>}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Code client T24 (si connu)
            <input type="text" inputMode="numeric" maxLength={20} disabled={fromT24} style={FIELD_STYLE} {...field("coreBankingId")} />
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
      )}
    </div>
  );
}
