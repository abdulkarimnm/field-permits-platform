"use client";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

export type ThemePref = "light" | "dark" | "system";
const META = { light: "#fffaf5", dark: "#16110f" };

/** Applies a preference: stores it in a cookie (so the server renders the right theme, no flash) and flips <html data-theme>. */
export function applyTheme(pref: ThemePref) {
  const html = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.classList.add("theme-switching"); // no colour transitions mid-switch
  html.dataset.themePref = pref;
  html.dataset.theme = dark ? "dark" : "light";
  html.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? META.dark : META.light));
  document.cookie = `theme=${pref}; path=/; max-age=31536000; samesite=lax`;
  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("theme-switching")));
}

const OPTS: [ThemePref, IconName, string, string][] = [
  ["light", "sun", "نهاري", "Light"],
  ["dark", "moon", "ليلي", "Dark"],
  ["system", "monitor", "تلقائي", "Auto"],
];

/**
 * variant "icon": one round button in the masthead — toggles light ⇄ dark.
 * variant "sheet": a 3-way segmented control (light / dark / follow the device) for menus.
 */
export default function ThemeSwitch({ lang, variant = "icon" }: { lang: "ar" | "en"; variant?: "icon" | "sheet" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [pref, setPref] = useState<ThemePref>("system");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    setPref((html.dataset.themePref as ThemePref) || "system");
    setDark(html.dataset.theme === "dark");
    const mo = new MutationObserver(() => {
      setPref((html.dataset.themePref as ThemePref) || "system");
      setDark(html.dataset.theme === "dark");
    });
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme", "data-theme-pref"] });
    return () => mo.disconnect();
  }, []);

  const choose = (p: ThemePref) => {
    navigator.vibrate?.(8);
    applyTheme(p);
  };

  if (variant === "icon")
    return (
      <button
        type="button"
        onClick={() => choose(dark ? "light" : "dark")}
        className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-brand transition hover:border-gold"
        aria-label={dark ? t("التبديل إلى المظهر النهاري", "Switch to light mode") : t("التبديل إلى المظهر الليلي", "Switch to dark mode")}
        title={dark ? t("المظهر النهاري", "Light mode") : t("المظهر الليلي", "Dark mode")}
      >
        <Icon name={dark ? "sun" : "moon"} size={18} />
      </button>
    );

  return (
    <div>
      <p className="mb-1.5 px-2 text-xs text-cream/60">{t("المظهر", "Appearance")}</p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[.06] p-1" role="radiogroup" aria-label={t("المظهر", "Appearance")}>
        {OPTS.map(([k, icon, ar, en]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={pref === k}
            onClick={() => choose(k)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm transition ${pref === k ? "bg-white/15 font-semibold text-gold-soft" : "text-cream/70 active:bg-white/10"}`}
          >
            <Icon name={icon} size={16} /> {t(ar, en)}
          </button>
        ))}
      </div>
    </div>
  );
}
