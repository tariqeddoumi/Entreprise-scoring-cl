"use client";

import { useEffect } from "react";

/**
 * Un tableau large ou un bloc de code défile dans sa carte sur petit écran : il
 * doit alors être atteignable au clavier pour être parcouru (WCAG 2.1.1).
 * L'élément défilant reçoit le focus ; les autres restent hors de l'ordre de
 * tabulation.
 */
export function TableFocus() {
  useEffect(() => {
    const apply = () => {
      for (const t of document.querySelectorAll<HTMLElement>("table.data, pre")) {
        const scrolls = t.scrollWidth > t.clientWidth + 1;
        if (scrolls && !t.hasAttribute("tabindex")) {
          t.tabIndex = 0;
          t.dataset.scrollFocus = "1";
        } else if (!scrolls && t.dataset.scrollFocus) {
          t.removeAttribute("tabindex");
          delete t.dataset.scrollFocus;
        }
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);
  return null;
}
