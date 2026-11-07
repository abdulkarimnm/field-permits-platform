"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Silk } from "@/components/Arches";
import { ROLE_META } from "@/components/SandboxDock";

type Role = keyof typeof ROLE_META;
type Mission = { id: string; ar: string; en: string; href: string; done: boolean };
type State = { active: false } | { active: true; contact: string; role: Role | null; missions: Record<Role, Mission[]>; seeded: boolean };

const ORDER: Role[] = ["applicant", "reviewer", "approver", "verifier", "supervisor", "opsmanager", "admin"];
const ABOUT: Record<Role, [string, string]> = {
  applicant: ["تقدّم الطلبات وتتابعها، وتستكمل ما يُعاد إليك، وتحمل بطاقة الدخول على جوالك.", "Submit and track requests, complete returned ones, carry the pass on your phone."],
  reviewer: ["تفرز الطلبات بدرجة المخاطر وتعتمد أوليًا أو تعيد أو ترفض بسبب واضح.", "Triage by risk score; approve, return or reject with a clear reason."],
  approver: ["تعتمد نهائيًا فيصدر التصريح تلقائيًا، وتوقف التصاريح عند المخالفة.", "Give final approval to issue permits; suspend them on violations."],
  verifier: ["تمسح الرموز عند البوابة، وتطابق الموجودين، وتتحقق من الممثل برمز مؤقت.", "Scan at the gate, match who's present, verify the representative by code."],
  supervisor: ["تراقب الميدان من مركز القيادة، وتعيد تفعيل التصاريح، وتصدّر التقارير.", "Watch the field from the command center, reactivate permits, export reports."],
  opsmanager: ["تتابع التشغيل كاملًا من «حالة النظام»: القاعدة وسلامة السجل والأخطاء وسير الطلبات والميدان — للاطلاع دون قرار.", "Oversee the whole operation from System health: database, audit integrity, errors, pipeline and field — view-only."],
  admin: ["تحدد مسؤول كل مرحلة، ووضع رمز الممثل، والمستخدمين والمناطق والسعة.", "Set stage owners, the representative-code mode, users, zones and capacity."],
};

export default function SandboxHub({ lang }: { lang: "ar" | "en" }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const [s, setS] = useState<State | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [made, setMade] = useState<{ label: string; ref: string }[] | null>(null);
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/sandbox/begin", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const seed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const r = await fetch("/api/sandbox/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMade(j.made);
      navigator.vibrate?.([30, 60, 30]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSeeding(false);
    }
  };
  const enter = async (r: Role) => {
    setBusy(r);
    const res = await fetch("/api/sandbox/as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: r }) });
    const j = await res.json();
    location.href = j.href;
  };

  const ready = s && s.active;
  const all = ready ? ORDER.flatMap((r) => s.missions[r]) : [];
  const done = all.filter((m) => m.done).length;
  const pct = all.length ? done / all.length : 0;
  const C = 2 * Math.PI * 34;

  return (
    <div className="noir relative flex-1 overflow-hidden">
      <Silk />
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6">
        {/* hero */}
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="rise">
            <p className="shiny text-xs font-semibold">{t("نموذج تجريبي حقيقي · يعمل على النظام الفعلي", "A real trial model · runs on the actual system")}</p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
              {t("مختبر الصلاحيات", "The roles lab")}
              <span className="text-gold-grad block">{t("استخدم النظام بكل دور", "Use the system as every role")}</span>
            </h1>
            <p className="mt-5 max-w-2xl leading-[1.95] text-cream/75">
              {t(
                "انتقل بين ستة أدوار بلمسة واحدة، ونفّذ مهام كل دور على الشاشات الحقيقية، وشاهد أثر قرارك فورًا عند بقية الأدوار: ما تعتمده كمعتمد يظهر للمتحقق عند البوابة، وما تمسحه كمتحقق يظهر في مركز القيادة.",
                "Switch between six roles in one tap, complete each role's missions on the real screens, and see your decision ripple to the others: what you approve shows at the gate, what you scan shows in the command center.",
              )}
            </p>
          </div>
          {ready && (
            <div className="rise flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[.05] p-4" style={{ animationDelay: ".1s" }}>
              <svg width="84" height="84" className="-rotate-90" aria-hidden>
                <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7" />
                <circle cx="42" cy="42" r="34" fill="none" stroke="#e9cfa6" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: "stroke-dashoffset 1s" }} />
              </svg>
              <div>
                <p className="num font-display text-3xl font-bold text-white">{done}<span className="text-lg text-cream/50">/{all.length}</span></p>
                <p className="text-xs text-cream/60">{t("مهمة منجزة", "missions done")}</p>
              </div>
            </div>
          )}
        </div>

        {/* two paths */}
        <div className="mt-10 grid gap-4 md:grid-cols-[1fr_2fr]">
          <Link href="/demo" className="group rounded-3xl border border-white/10 bg-white/[.04] p-5 transition hover:border-gold/40">
            <span className="text-xs font-semibold text-gold">{t("المسار الأول", "Path one")}</span>
            <p className="mt-2 text-lg font-bold text-white">{t("رحلة موجهة · 3 دقائق", "Guided story · 3 minutes")}</p>
            <p className="mt-1 text-sm leading-relaxed text-cream/65">{t("قصة من سبعة فصول تمر بكل الأدوار تلقائيًا — مناسبة للعرض السريع.", "A seven-chapter story through every role — great for a quick demo.")}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-soft">{t("ابدأ الرحلة", "Start the story")} <span aria-hidden className="ltr:rotate-180">←</span></span>
          </Link>
          <div className="rounded-3xl border border-gold/40 bg-gradient-to-b from-white/[.08] to-white/[.03] p-5">
            <span className="text-xs font-semibold text-gold">{t("المسار الثاني · الخطوة 1", "Path two · step 1")}</span>
            <p className="mt-2 text-lg font-bold text-white">{t("جهّز سيناريو ميداني واقعي", "Prepare a realistic field scenario")}</p>
            <p className="mt-1 text-sm leading-relaxed text-cream/65">
              {t(
                "طلبات لجهات مختلفة في كل المسارات، وطلب معاد لجهتك، وآخر بانتظار الاعتماد النهائي، وتصاريح سارية وأخرى موقوفة، ونشاط عند البوابات، وحجوزات قادمة تُشعل توقع الازدحام.",
                "Requests from several organizations across all lanes, one returned to you, one awaiting final approval, valid and suspended permits, gate activity, and upcoming bookings that light up the congestion forecast.",
              )}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={seed} disabled={seeding || !ready} className="shimmer-btn inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-b from-gold-soft to-gold px-6 font-bold text-noir disabled:opacity-60">
                {seeding ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="grid" size={18} />}
                {seeding ? t("جارٍ تجهيز الميدان…", "Preparing the field…") : ready && s.seeded ? t("أضف سيناريو آخر", "Add another scenario") : t("جهّز السيناريو", "Prepare the scenario")}
              </button>
              {ready && s.seeded && !made && <span className="inline-flex items-center gap-1.5 text-xs text-[#9fd6ec]"><Icon name="shield" size={14} /> {t("السيناريو جاهز — اختر دورك أدناه", "Scenario ready — pick your role below")}</span>}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-[#ffb4ab]">{error}</p>}
            {made && (
              <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {made.map((m, i) => (
                  <li key={m.ref} className="al-item flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs" style={{ animationDelay: `${i * 0.05}s` }}>
                    <span className="text-[#9fd6ec]">✓</span><span className="num font-semibold text-white">{m.ref}</span><span className="truncate text-cream/60">{m.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* roles */}
        <h2 className="mt-12 font-display text-2xl font-bold text-white">{t("الخطوة 2 · اختر دورك وابدأ", "Step 2 · pick a role and go")}</h2>
        <p className="mt-1 text-sm text-cream/60">{t("يمكنك التبديل بين الأدوار في أي لحظة من الشريط العائم أسفل الشاشة.", "Switch roles any time from the floating bar at the bottom of the screen.")}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((r, i) => {
            const meta = ROLE_META[r];
            const ms = ready ? s.missions[r] : [];
            const d = ms.filter((m) => m.done).length;
            const on = ready && s.role === r;
            return (
              <div key={r} className={`bf-in rise flex flex-col rounded-3xl border p-5 ${on ? "border-gold-soft bg-white/[.09]" : "border-white/10 bg-white/[.04]"}`} style={{ animationDelay: `${0.05 * i}s` }}>
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl text-noir" style={{ background: meta.tone }}><Icon name={meta.icon} size={22} /></span>
                  <span className="num rounded-full bg-black/25 px-2.5 py-1 text-[11px] text-cream/70">{d}/{ms.length}</span>
                </div>
                <p className="mt-4 text-lg font-bold text-white">{t(meta.ar, meta.en)} {on && <span className="ms-1 rounded-full bg-gold-soft px-2 py-0.5 align-middle text-[10px] font-bold text-noir">{t("دورك الآن", "current")}</span>}</p>
                <p className="mt-1 text-sm leading-relaxed text-cream/65">{t(...ABOUT[r])}</p>
                <ul className="mt-4 flex-1 space-y-1.5">
                  {ms.map((m) => (
                    <li key={m.id} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${m.done ? "bg-[#3aa0c8] text-white" : "border border-white/25"}`}>{m.done ? "✓" : ""}</span>
                      <span className={m.done ? "text-cream/45 line-through decoration-white/25" : "text-cream/85"}>{t(m.ar, m.en)}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => enter(r)} disabled={!!busy || !ready} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gold/45 bg-white/5 font-semibold text-gold-soft transition hover:bg-white/10 disabled:opacity-50">
                  {busy === r ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                  {t(`ادخل كـ${meta.ar}`, `Enter as ${meta.en}`)}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-xs text-cream/45">{t("يعمل المختبر في وضع التجربة الداخلية فقط، ويُعطَّل تلقائيًا عند إيقافه من الإعدادات قبل الإطلاق. كل البيانات تجريبية.", "The lab works in internal-trial mode only and is disabled automatically when that mode is switched off before launch. All data is trial data.")}</p>
      </div>
    </div>
  );
}
