"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

type Role = "applicant" | "reviewer" | "approver" | "supervisor" | "verifier" | "admin";
type Mission = { id: string; ar: string; en: string; href: string; done: boolean };
type State =
  | { active: false }
  | {
      active: true;
      contact: string;
      role: Role | null;
      missions: Record<Role, Mission[]>;
      codes: { kind: string; label: [string, string]; code: string; number?: string; org?: string }[];
      sms: { id: number; body: string; at: string }[];
      seeded: boolean;
    };

export const ROLE_META: Record<Role, { ar: string; en: string; icon: IconName; tone: string }> = {
  applicant: { ar: "ممثل جهة", en: "Organization", icon: "doc", tone: "#e9cfa6" },
  reviewer: { ar: "مراجع أولي", en: "Reviewer", icon: "inbox", tone: "#9fd6ec" },
  approver: { ar: "معتمد نهائي", en: "Approver", icon: "shield", tone: "#b9e3c6" },
  supervisor: { ar: "مشرف الميدان", en: "Supervisor", icon: "pulse", tone: "#f0cf8e" },
  verifier: { ar: "متحقق ميداني", en: "Verifier", icon: "scan", tone: "#f3b4ab" },
  admin: { ar: "مسؤول النظام", en: "Admin", icon: "settings", tone: "#d9c6f0" },
};
const ORDER: Role[] = ["applicant", "reviewer", "approver", "verifier", "supervisor", "admin"];
const HIDE = [/^\/permit\//, /^\/demo/, /^\/sandbox/, /^\/offline/, /^\/staff\/ops\/screen/, /^\/staff\/reports\/print/];

/** Floating roles-lab bar (demo mode only): switch roles, follow missions, read the representative's phone, test gate codes. */
export default function SandboxDock({ lang }: { lang: "ar" | "en" }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const path = usePathname();
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"roles" | "missions" | "phone" | "codes">("missions");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSms, setLastSms] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/sandbox/state", { cache: "no-store" });
      if (r.ok) setS(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, open ? 4000 : 12000);
    return () => clearInterval(id);
  }, [load, open, path]);

  // new SMS → gentle flash on the pill
  useEffect(() => {
    if (!s || !s.active || !s.sms.length) return;
    const top = s.sms[0].id;
    if (lastSms !== null && top !== lastSms) {
      setFlash(true);
      navigator.vibrate?.([20, 40, 20]);
      setTimeout(() => setFlash(false), 2500);
    }
    setLastSms(top);
  }, [s, lastSms]);

  if (!s || HIDE.some((r) => r.test(path))) return null;
  // No lab session yet: a small, always-visible invitation (login pages already show the accounts panel).
  if (!s.active) {
    if (/^\/(staff|apply)\/login/.test(path)) return null;
    return (
      <div className="no-print fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] start-3 z-[75] md:bottom-5 md:start-5">
        <Link href="/sandbox" className="flex min-h-12 items-center gap-2.5 rounded-full border border-gold/50 bg-[#2a120d]/95 py-1.5 pe-4 ps-1.5 text-sm text-cream shadow-[0_14px_34px_-12px_rgba(0,0,0,.8)] backdrop-blur-xl transition active:scale-95">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e9cfa6] text-noir"><Icon name="user" size={17} /></span>
          <span className="leading-tight text-start">
            <span className="block text-[10px] text-gold-soft">{t("حسابات تجريبية جاهزة", "Ready-made demo accounts")}</span>
            <span className="block text-xs font-semibold text-white">{t("جرّب كل الصلاحيات", "Try every role")}</span>
          </span>
        </Link>
      </div>
    );
  }
  const role = s.role;
  const ms = role ? s.missions[role] : [];
  const all = ORDER.flatMap((r) => s.missions[r]);
  const done = all.filter((m) => m.done).length;

  const go = async (r: Role, then?: string) => {
    setBusy(r);
    const res = await fetch("/api/sandbox/as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: r }) });
    const j = await res.json();
    location.href = then ?? j.href;
  };
  const code = (body: string) => body.match(/(\d{6})/)?.[1];

  return (
    <div className={`no-print fixed start-3 z-[75] md:bottom-5 md:start-5 ${path.startsWith("/apply/new") ? "bottom-[calc(10.5rem+env(safe-area-inset-bottom))]" : "bottom-[calc(5.6rem+env(safe-area-inset-bottom))]"}`}>
      {open && (
        <div className="al-item mb-3 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-gold/35 bg-[#2a120d]/97 text-cream shadow-[0_30px_70px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl" role="dialog" aria-label={t("مختبر الصلاحيات", "Roles lab")}>
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{t("مختبر الصلاحيات", "Roles lab")}</p>
              <p className="text-[11px] text-cream/55">{t(`${done} من ${all.length} مهمة · بيانات تجريبية`, `${done} of ${all.length} missions · trial data`)}</p>
            </div>
            <Link href="/sandbox" className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-gold-soft hover:border-gold/50">{t("صفحة المختبر", "Lab home")}</Link>
          </div>
          <div className="flex gap-1 border-b border-white/10 p-1.5" role="tablist">
            {([["missions", t("المهام", "Missions")], ["roles", t("الأدوار", "Roles")], ["phone", t("الجوال", "Phone")], ["codes", t("رموز البوابة", "Gate codes")]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-9 flex-1 rounded-lg text-[11px] font-semibold ${tab === k ? "bg-white/10 text-gold-soft" : "text-cream/60 hover:text-white"}`}>
                {l}{k === "phone" && s.sms.length > 0 && <span className="num ms-1 rounded-full bg-[#3aa0c8] px-1.5 text-[9px] text-white">{s.sms.length}</span>}
              </button>
            ))}
          </div>
          <div className="max-h-[22rem] overflow-y-auto p-3">
            {tab === "missions" && (
              <>
                {!s.seeded && (
                  <Link href="/sandbox" className="mb-3 block rounded-2xl border border-gold/40 bg-gold/10 p-3 text-xs text-gold-soft">{t("ابدأ بتجهيز السيناريو الواقعي من صفحة المختبر ليمتلئ النظام ببيانات تتفاعل معها.", "Prepare the realistic scenario on the lab page first so the system has data to work with.")}</Link>
                )}
                {role ? (
                  <>
                    <p className="mb-2 flex items-center gap-2 text-xs text-cream/70"><Icon name={ROLE_META[role].icon} size={14} /> {t(`مهامك كـ${ROLE_META[role].ar}`, `Your missions as ${ROLE_META[role].en}`)}</p>
                    <ul className="space-y-1.5">
                      {ms.map((m) => (
                        <li key={m.id}>
                          <Link href={m.href} className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition ${m.done ? "border-[#3aa0c8]/40 bg-[#3aa0c8]/10 text-cream/70" : "border-white/10 hover:border-gold/40"}`}>
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${m.done ? "bg-[#3aa0c8] text-white" : "border border-white/25"}`}>{m.done ? "✓" : ""}</span>
                            <span className={m.done ? "line-through decoration-white/30" : "text-white"}>{t(m.ar, m.en)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {ms.every((m) => m.done) && <p className="mt-3 rounded-xl bg-[#3aa0c8]/15 p-2.5 text-center text-xs text-[#9fd6ec]">{t("أنهيت مهام هذا الدور — جرّب دورًا آخر", "Role complete — try another one")}</p>}
                  </>
                ) : (
                  <p className="text-xs text-cream/60">{t("اختر دورًا للبدء.", "Pick a role to start.")}</p>
                )}
              </>
            )}
            {tab === "roles" && (
              <div className="grid grid-cols-2 gap-2">
                {ORDER.map((r) => {
                  const meta = ROLE_META[r];
                  const on = role === r;
                  const d = s.missions[r].filter((m) => m.done).length;
                  return (
                    <button key={r} onClick={() => go(r)} disabled={!!busy} className={`flex min-h-[4.25rem] flex-col items-start justify-between rounded-2xl border p-2.5 text-start transition ${on ? "border-gold-soft bg-white/10" : "border-white/10 hover:border-gold/40"} disabled:opacity-60`}>
                      <span className="flex w-full items-center justify-between">
                        <span className="grid h-7 w-7 place-items-center rounded-lg text-noir" style={{ background: meta.tone }}><Icon name={meta.icon} size={15} /></span>
                        <span className="num text-[10px] text-cream/50">{d}/{s.missions[r].length}</span>
                      </span>
                      <span className="text-xs font-semibold text-white">{busy === r ? t("جارٍ التبديل…", "Switching…") : t(meta.ar, meta.en)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {tab === "phone" && (
              <div>
                <p className="mb-2 text-[11px] text-cream/55">{t("جوال ممثل جهتك", "Your representative's phone")} · <span className="num">{s.contact}</span></p>
                {s.sms.length === 0 ? (
                  <p className="text-xs text-cream/50">{t("لا رسائل بعد.", "No messages yet.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {s.sms.map((m) => {
                      const c = code(m.body);
                      return (
                        <li key={m.id} className="rounded-2xl bg-white/[.06] p-3">
                          <p className="text-[12px] leading-relaxed text-cream/90">{m.body}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-cream/45">
                            <span className="num">{new Date(m.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}</span>
                            {c && <button onClick={() => navigator.clipboard?.writeText(c)} className="num rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-noir">{c} · {t("نسخ", "copy")}</button>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            {tab === "codes" && (
              <div>
                <p className="mb-2 text-[11px] text-cream/55">{t("بدل الكاميرا: افتح أي رمز مباشرة في بوابة التحقق كمتحقق ميداني.", "Instead of a camera: open any code straight in the verification portal as a verifier.")}</p>
                <ul className="space-y-2">
                  {s.codes.map((c) => (
                    <li key={c.kind}>
                      <button onClick={() => go("verifier", `/verify?code=${encodeURIComponent(c.code)}`)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 p-3 text-start hover:border-gold/40 disabled:opacity-60">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.kind === "valid" ? "bg-[#3aa0c8]" : c.kind === "fake" ? "bg-[#e0524a]" : "bg-[#d9a441]"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-white">{t(...c.label)}</span>
                          {c.number && <span className="num block truncate text-[10px] text-cream/50">{c.number} · {c.org}</span>}
                        </span>
                        <Icon name="scan" size={16} className="text-gold-soft" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex min-h-12 items-center gap-2.5 rounded-full border border-gold/50 bg-[#2a120d]/95 py-1.5 pe-4 ps-1.5 text-sm text-cream shadow-[0_14px_34px_-12px_rgba(0,0,0,.8)] backdrop-blur-xl transition active:scale-95 ${flash ? "ring-4 ring-[#3aa0c8]/60" : ""}`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-full text-noir" style={{ background: role ? ROLE_META[role].tone : "#e9cfa6" }}>
          <Icon name={role ? ROLE_META[role].icon : "user"} size={17} />
        </span>
        <span className="leading-tight text-start">
          <span className="block text-[10px] text-gold-soft">{t("مختبر الصلاحيات", "Roles lab")}</span>
          <span className="block text-xs font-semibold text-white">{role ? t(ROLE_META[role].ar, ROLE_META[role].en) : t("اختر دورًا", "Pick a role")} · <span className="num">{done}/{all.length}</span></span>
        </span>
      </button>
    </div>
  );
}
