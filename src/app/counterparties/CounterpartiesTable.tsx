"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GradeBadge } from "../ui-helpers";
import { csvLine } from "@/lib/csv";

export interface CounterpartyRow {
  id: string;
  name: string;
  ice: string | null;
  segment: string | null;
  sectorCode: string | null;
  entityCode: string;
  currency: string;
  isActive: boolean;
  /** L'utilisateur peut ouvrir un dossier de notation pour ce client. */
  canRate: boolean;
  /** Statut du dossier en cours (brouillon ou soumis), s'il y en a un. */
  openCase: string | null;
  /** Dernière notation OFFICIELLE (validée, ou antérieure au workflow). */
  ratingRuns: Array<{ finalGrade: string | null; rawScore: number | null; asOfDate: string; equivalent?: string | null }>;
}

const SEGMENTS = ["TPE", "PME", "GE"] as const;

function downloadCsv(rows: CounterpartyRow[]) {
  const header = ["Nom", "Entité", "ICE", "Devise", "Segment", "Secteur", "Dernier score", "Dernier grade", "Arrêté"];
  const lines = rows.map((c) => {
    const last = c.ratingRuns[0];
    return csvLine([
      c.name,
      c.entityCode,
      c.ice ?? "",
      c.currency,
      c.segment ?? "",
      c.sectorCode ?? "",
      last?.rawScore ? Number(last.rawScore).toFixed(2) : "",
      last?.equivalent ? `${last.finalGrade} (≈ classe ${last.equivalent})` : (last?.finalGrade ?? ""),
      last?.asOfDate ?? "",
    ]);
  });
  // Point-virgule : Excel FR ouvre correctement sans étape d'import manuelle.
  // BOM UTF-8 en tête : préserve les accents à l'ouverture directe dans Excel.
  const csv = `﻿${[csvLine(header), ...lines].join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CounterpartiesTable({ items }: { items: CounterpartyRow[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<string>("");
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = items.filter((c) => !c.isActive).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (!showInactive && !c.isActive) return false;
      if (segment && c.segment !== segment) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.ice ?? "").toLowerCase().includes(q) ||
        c.entityCode.toLowerCase().includes(q)
      );
    });
  }, [items, query, segment, showInactive]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Rechercher par nom, ICE ou entité…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
          aria-label="Rechercher un client"
        />
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          style={{ width: "auto", minWidth: 160 }}
          aria-label="Filtrer par segment"
        >
          <option value="">Tous segments</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {inactiveCount > 0 && (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Afficher les désactivés ({inactiveCount})
          </label>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} / {items.length} client(s)
        </span>
        <button
          type="button"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 12px",
            color: "var(--text)",
            fontSize: 13,
          }}
        >
          Exporter CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Aucun client ne correspond à la recherche.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Entité</th>
              <th>ICE</th>
              <th>Devise</th>
              <th>Segment</th>
              <th>Secteur</th>
              <th>Score validé</th>
              <th>Grade validé</th>
              <th>Arrêté</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const last = c.ratingRuns[0];
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/counterparties/${c.id}`} style={{ color: "var(--brand)" }}>
                      {c.name}
                    </Link>
                    {!c.isActive && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                        · désactivé
                      </span>
                    )}
                    {c.openCase && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                        {c.openCase === "SUBMITTED" ? "· dossier en validation" : "· dossier en cours"}
                      </span>
                    )}
                  </td>
                  <td className="muted nowrap">{c.entityCode}</td>
                  <td className="muted nowrap">{c.ice ?? "—"}</td>
                  <td className="muted">{c.currency}</td>
                  <td>{c.segment ?? "—"}</td>
                  <td className="muted">{c.sectorCode ?? "—"}</td>
                  <td>{last?.rawScore != null ? last.rawScore.toFixed(2) : "—"}</td>
                  <td>
                    <GradeBadge grade={last?.finalGrade ?? null} />
                    {last?.equivalent && (
                      <span
                        className="muted"
                        style={{ fontSize: 11, marginLeft: 6 }}
                        title="Note produite sur l'échelle antérieure : classe équivalente sur l'échelle 1 à 10 en vigueur (lecture seulement, jusqu'à la prochaine notation)"
                      >
                        ≈ classe {last.equivalent}
                      </span>
                    )}
                  </td>
                  <td className="muted nowrap">{last?.asOfDate ?? "—"}</td>
                  <td className="nowrap">
                    <span style={{ display: "inline-flex", gap: 10 }}>
                    {c.canRate && (
                      <Link href={`/counterparties/${c.id}#noter`} style={{ color: "var(--brand)", fontWeight: 600 }}>
                        Noter
                      </Link>
                    )}
                    <Link href={`/counterparties/${c.id}`} style={{ color: "var(--brand)" }} aria-label={`Fiche de ${c.name}`}>
                      Fiche
                    </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
