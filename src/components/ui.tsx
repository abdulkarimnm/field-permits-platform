import Link from "next/link";
import type { ReactNode } from "react";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-deep px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(118,59,48,.8),inset_0_1px_0_rgba(255,255,255,.15)] transition hover:brightness-110 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-11",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-gold hover:bg-chip/40 disabled:opacity-50 min-h-11",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-bad px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50 min-h-11",
  ghost: "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-brand hover:bg-chip/60",
};

export const input =
  "w-full rounded-lg border border-line-strong bg-field px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-soft/60 outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25 aria-[invalid=true]:border-bad";

export const label = "mb-1.5 block text-sm font-medium text-ink";

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line/80 bg-surface shadow-card ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink"><span className="h-4 w-1 rounded-full bg-gradient-to-b from-gold to-brand" />{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const tones = {
  ok: "bg-ok-soft text-ok",
  wait: "bg-wait-soft text-wait",
  off: "bg-off-soft text-off",
  hold: "bg-hold-soft text-hold",
  bad: "bg-bad-soft text-bad",
  brand: "bg-chip text-brand",
};
export type Tone = keyof typeof tones;

export function Badge({ tone = "brand", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export const requestTone: Record<string, Tone> = {
  pending_review: "wait",
  pending_approval: "wait",
  returned: "hold",
  rejected: "bad",
  approved: "ok",
  withdrawn: "off",
};
export const liveTone: Record<string, Tone> = { valid: "ok", not_started: "wait", expired: "off", suspended: "hold", revoked: "bad" };
export const laneTone: Record<string, Tone> = { fast: "ok", normal: "brand", strict: "bad" };

export function PageTitle({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-10 text-center text-sm text-ink-soft">{children}</div>;
}

export function Alert({ tone = "wait", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{k}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{v || "—"}</dd>
    </div>
  );
}

export function NavLink({ href, active, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-white/15 text-white" : "text-cream/80 hover:bg-white/10 hover:text-white"}`}
    >
      {children}
    </Link>
  );
}
