"use client";
import { useEffect } from "react";

/**
 * Marks the page as "an overlay is open" (sheet, dialog) while `open` is true.
 * Floating chrome (the roles-lab bubble, the mobile tab bar) hides itself via CSS
 * (`html[data-overlay]`) so it can never sit on top of a dialog's buttons.
 * Also locks body scroll and closes on Escape.
 */
export function useOverlay(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const n = Number(html.dataset.overlay || 0) + 1;
    html.dataset.overlay = String(n);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    addEventListener("keydown", k);
    return () => {
      removeEventListener("keydown", k);
      const left = Number(html.dataset.overlay || 1) - 1;
      if (left > 0) html.dataset.overlay = String(left);
      else delete html.dataset.overlay;
      document.body.style.overflow = prevOverflow;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}
