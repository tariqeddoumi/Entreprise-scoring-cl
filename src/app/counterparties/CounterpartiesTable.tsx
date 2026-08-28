"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GradeBadge } from "../ui-helpers";

export interface CounterpartyRow {
  id: string;
  name: string;
  ice: string | null;
  segment: string | null;
  sectorCode: string | null;
  ratingRuns: Array<{ finalGrade: string | null; rawScore: unknown; asOfDate: string }>;
}

const SEGMENTS = ["TPE", "PME", "GE"] as const;

/** Échappement CSV minimal : guillemets doublés, champ entre guillemets si besoin. */
function csvField(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(rows: CounterpartyRow[]) {
  const header = ["Nom", "ICE", "Segment", "Secteur", "Dernier score", "Dernier grade", "Arrêté"];
  const lines = rows.map((c) => {
    const last = c.ratingRuns[0];
    return [
      c.name,
      c.ice ?? "",
      c.segment ?? "",
      c.sectorCode ?? "",
      last?.rawScore ? Number(last.rawScore).toFixed(2) : "",
      last?.finalGrade ?? "",
      last?.asOfDate ?? "",
    ]
      .map((v) => csvField(String(v)))
      .join(";");
  });
  // Point-virgule : Excel FR ouvre correctement sans étape d'import manuelle.
  // BOM UTF-8 en tête : préserve les accents à l'ouverture directe dans Excel.
  const csv = `﻿${[header.join(";"), ...lines].join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contreparties-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CounterpartiesTable({ items }: { items: CounterpartyRow[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<string>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) => {
      if (segment && c.segment !== segment) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.ice ?? "").toLowerCase().includes(q);
    });
  }, [items, query, segment]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Rechercher par nom ou ICE…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 280 }}
          aria-label="Rechercher une contrepartie"
        />
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          style={{ maxWidth: 140 }}
          aria-label="Filtrer par segment"
        >
          <option value="">Tous segments</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>
          {filtered.length} / {items.length} contrepartie(s)
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
        <p className="muted">Aucune contrepartie ne correspond à la recherche.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Nom</th>
              <th>ICE</th>
              <th>Segment</th>
              <th>Secteur</th>
              <th>Dernier score</th>
              <th>Dernier grade</th>
              <th>Arrêté</th>
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
                  </td>
                  <td className="muted">{c.ice ?? "—"}</td>
                  <td>{c.segment ?? "—"}</td>
                  <td className="muted">{c.sectorCode ?? "—"}</td>
                  <td>{last?.rawScore ? Number(last.rawScore).toFixed(2) : "—"}</td>
                  <td>
                    <GradeBadge grade={last?.finalGrade ?? null} />
                  </td>
                  <td className="muted">{last?.asOfDate ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
