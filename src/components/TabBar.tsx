"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useOverlay } from "./useOverlay";
import ThemeSwitch from "./ThemeSwitch";
import { logoutAction, setLangAction } from "@/app/actions";

export type Tab = { href: string; label: string; full: string; icon: IconName; primary?: boolean };

const tap = () => navigator.vibrate?.(8);

/** Native-style bottom tab bar (mobile only) + a "More" bottom sheet. */
export default function TabBar({
  tabs,
  more,
  user,
  kind,
  lang,
  labels,
}: {
  tabs: Tab[];
  more: Tab[];
  user: string | null;
  kind: "staff" | "applicant" | null;
  lang: "ar" | "en";
  labels: { more: string; signOut: string; language: string; close: string; menu: string };
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = [...tabs, ...more];
  // longest matching prefix wins
  const current = all.filter((t) => path === t.href || path.startsWith(t.href + "/")).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => setOpen(false), [path]);
  useOverlay(open, () => setOpen(false));

  return (
    <>
      <nav
        className="no-print tabbar fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-noir/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label={labels.menu}
      >
        <div className="gold-line absolute inset-x-0 top-0 opacity-40" />
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {tabs.map((t) => {
            const on = current === t.href;
            if (t.primary)
              return (
                <li key={t.href} className="flex flex-1">
                  {/* The main action sits in the bar like its siblings (same height, same baseline);
                      the gold pill alone marks it as primary. */}
                  <Link
                    href={t.href}
                    onClick={tap}
                    aria-current={on ? "page" : undefined}
                    className="relative flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 transition active:scale-95"
                  >
                    {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" />}
                    <span className={`grid h-8 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-soft to-gold text-noir shadow-[0_4px_12px_-4px_rgba(201,166,107,.7)] transition ${on ? "ring-2 ring-gold-soft/40" : ""}`}>
                      <Icon name={t.icon} size={20} strokeWidth={2.4} />
                    </span>
                    <span className={`text-[11px] font-semibold ${on ? "text-gold-soft" : "text-cream/75"}`}>{t.label}</span>
                  </Link>
                </li>
              );
            return (
              <li key={t.href} className="flex flex-1">
                <Link
                  href={t.href}
                  onClick={tap}
                  aria-current={on ? "page" : undefined}
                  className="relative flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 transition active:scale-95"
                >
                  {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold" />}
                  <span className={`grid h-8 w-12 place-items-center rounded-full transition ${on ? "bg-white/10 text-gold-soft" : "text-cream/70"}`}>
                    <Icon name={t.icon} size={22} strokeWidth={on ? 2 : 1.7} />
                  </span>
                  <span className={`text-[11px] ${on ? "font-semibold text-gold-soft" : "text-cream/75"}`}>{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              onClick={() => {
                tap();
                setOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 text-cream/75 active:scale-95"
            >
              <span className="grid h-8 w-12 place-items-center rounded-full"><Icon name="more" size={24} strokeWidth={2.6} /></span>
              <span className="text-[11px]">{labels.more}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* More sheet */}
      <div className={`fixed inset-0 z-[80] md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div onClick={() => setOpen(false)} className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.menu}
          className={`noir absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-gold/30 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${open ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20" />
          {user && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/[.05] p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-b from-gold-soft to-gold text-noir"><Icon name="user" /></span>
              <span className="min-w-0 truncate text-sm font-semibold text-white">{user}</span>
            </div>
          )}
          <ul className="space-y-1">
            {more.map((m) => (
              <li key={m.href}>
                <Link href={m.href} onClick={tap} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] active:bg-white/10 ${current === m.href ? "text-gold-soft" : "text-cream"}`}>
                  <Icon name={m.icon} className="text-gold/80" /> {m.full}
                </Link>
              </li>
            ))}
            <li>
              <form action={setLangAction}>
                <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
                <button className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-cream active:bg-white/10">
                  <Icon name="globe" className="text-gold/80" /> {labels.language}
                </button>
              </form>
            </li>
            <li className="px-1 py-1.5">
              <ThemeSwitch lang={lang} variant="sheet" />
            </li>
            {kind && (
              <li>
                <form action={logoutAction} data-logout>
                  <input type="hidden" name="kind" value={kind} />
                  <button className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-[#f3a39d] active:bg-white/10">
                    <Icon name="logout" /> {labels.signOut}
                  </button>
                </form>
              </li>
            )}
          </ul>
          <button onClick={() => setOpen(false)} className="mt-3 min-h-12 w-full rounded-xl border border-white/10 text-sm font-semibold text-cream/80">
            {labels.close}
          </button>
        </div>
      </div>
    </>
  );
}
