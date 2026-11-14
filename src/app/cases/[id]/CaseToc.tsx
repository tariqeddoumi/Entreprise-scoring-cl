"use client";

import { useEffect, useState } from "react";

/**
 * Sommaire du dossier : les sections de la page (marquées data-toc) avec leur
 * état (data-toc-flag, data-toc-level), mis à jour pendant la saisie. Un clic
 * mène directement à la section — la page d'un dossier fait une vingtaine
 * d'écrans de haut.
 */

interface Entry {
  id: string;
  label: string;
  flag: string | null;
  level: string | null;
}

const COLORS: Record<string, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)" };

function scan(): Entry[] {
  // Une section repliée (détail fermé) n'est pas proposée : le lien n'y mènerait pas.
  return [...document.querySelectorAll<HTMLElement>("main [data-toc][id]")].filter((el) => !el.closest("details:not([open])")).map((el) => ({
    id: el.id,
    label: el.dataset.toc ?? el.id,
    flag: el.dataset.tocFlag ?? null,
    level: el.dataset.tocLevel ?? null,
  }));
}

export function CaseToc() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = scan();
        setEntries((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      });
    };
    refresh();
    const main = document.querySelector("main");
    if (!main) return;
    const obs = new MutationObserver(refresh);
    obs.observe(main, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-toc-flag", "data-toc-level", "open"] });
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  if (entries.length < 3) return null;
  return (
    <nav className="card" aria-label="Sommaire du dossier" style={{ padding: 12 }}>
      <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Sommaire</strong>
      <div className="case-toc">
        {entries.map((e) => (
          <a key={e.id} href={`#${e.id}`}>
            <span>{e.label}</span>
            {e.flag && (
              <span className="toc-flag" style={{ color: COLORS[e.level ?? ""] ?? "var(--muted)" }}>
                {e.flag}
              </span>
            )}
          </a>
        ))}
      </div>
    </nav>
  );
}
