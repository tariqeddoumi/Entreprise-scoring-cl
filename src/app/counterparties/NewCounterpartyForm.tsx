"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCounterpartyAction } from "./actions";

const FIELD_STYLE = { width: "100%" } as const;

interface FormState {
  name: string;
  ice: string;
  rc: string;
  fiscalId: string;
  legalForm: string;
  sectorCode: string;
  city: string;
}

const EMPTY: FormState = {
  name: "",
  ice: "",
  rc: "",
  fiscalId: "",
  legalForm: "",
  sectorCode: "",
  city: "",
};

export function NewCounterpartyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormState>(EMPTY);
  const [pending, startTransition] = useTransition();
  const [errorFr, setErrorFr] = useState<string | null>(null);
  const [successFr, setSuccessFr] = useState<string | null>(null);

  function field(name: keyof FormState) {
    return {
      value: values[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setValues((v) => ({ ...v, [name]: e.target.value })),
    };
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
    for (const key of ["ice", "rc", "fiscalId", "legalForm", "sectorCode", "city"] as const) {
      const v = values[key].trim();
      if (v) payload[key] = v;
    }

    startTransition(async () => {
      const res = await createCounterpartyAction(payload);
      if (res.ok) {
        setSuccessFr("Contrepartie enregistrée.");
        setValues(EMPTY);
        router.refresh();
      } else {
        setErrorFr(res.errorFr ?? "Échec de l'enregistrement.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "var(--brand)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 600,
          justifySelf: "start",
        }}
      >
        + Nouvelle contrepartie
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="card"
      style={{ padding: 16, display: "grid", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Nouvelle contrepartie</h2>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setValues(EMPTY);
            setErrorFr(null);
            setSuccessFr(null);
          }}
          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 13 }}
        >
          Fermer
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Raison sociale *
          <input type="text" required maxLength={300} style={FIELD_STYLE} {...field("name")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          ICE
          <input type="text" maxLength={20} style={FIELD_STYLE} {...field("ice")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Registre de commerce
          <input type="text" maxLength={30} style={FIELD_STYLE} {...field("rc")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Identifiant fiscal
          <input type="text" maxLength={30} style={FIELD_STYLE} {...field("fiscalId")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Forme juridique
          <input type="text" maxLength={60} style={FIELD_STYLE} {...field("legalForm")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Code secteur
          <input type="text" maxLength={30} style={FIELD_STYLE} {...field("sectorCode")} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          Ville
          <input type="text" maxLength={80} style={FIELD_STYLE} {...field("city")} />
        </label>
      </div>

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

      <button
        type="submit"
        disabled={pending}
        style={{
          justifySelf: "start",
          background: "var(--brand)",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
