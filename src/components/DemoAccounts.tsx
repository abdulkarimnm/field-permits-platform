"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./icons";
import { ROLE_META } from "./SandboxDock";

type Role = keyof typeof ROLE_META;
const ORDER: Role[] = ["applicant", "reviewer", "approver", "verifier", "supervisor", "opsmanager", "admin"];
const DO: Record<Role, [string, string]> = {
  applicant: ["يقدّم الطلبات ويحمل البطاقة", "Submits requests, carries the pass"],
  reviewer: ["المراجعة الأولية للطلبات", "First-stage review"],
  approver: ["الاعتماد النهائي وإصدار التصريح", "Final approval, issues permits"],
  verifier: ["مسح الرموز عند البوابة", "Scans codes at the gate"],
  supervisor: ["مركز القيادة والتقارير", "Command center & reports"],
  opsmanager: ["حالة النظام ومتابعة التشغيل", "System health & oversight"],
  admin: ["المستخدمون والإعدادات", "Users & settings"],
};

/** Demo mode only: one-tap ready-made accounts for every role (no password, no OTP). */
export default function DemoAccounts({ lang, first }: { lang: "ar" | "en"; first?: Role }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [busy, setBusy] = useState<Role | null>(null);
  const [error, setError] = useState(false);
  const roles = first ? [first, ...ORDER.filter((r) => r !== first)] : ORDER;

  const enter = async (r: Role) => {
    setBusy(r);
    setError(false);
    try {
      const res = await fetch("/api/sandbox/as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: r }) });
      const j = await res.json();
      if (!res.ok || !j.href) throw new Error();
      location.href = j.href;
    } catch {
      setError(true);
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="demo-accounts" className="rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/[.12] to-white/[.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="demo-accounts" className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold" /></span>
            {t("حسابات تجريبية جاهزة", "Ready-made demo accounts")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-cream/65">{t("اختر دورًا وادخل بضغطة، بلا كلمة مرور ولا رمز تحقق. وبدّل بين الأدوار في أي وقت من الزر العائم.", "Pick a role and go in one tap, no password or code. Switch roles any time from the floating button.")}</p>
        </div>
        <Link href="/sandbox" className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-gold-soft hover:border-gold/50">{t("المختبر", "Lab")}</Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {roles.map((r) => {
          const m = ROLE_META[r];
          return (
            <button
              key={r}
              type="button"
              onClick={() => enter(r)}
              disabled={!!busy}
              aria-label={t(`ادخل كـ${m.ar}`, `Enter as ${m.en}`)}
              className="group flex min-h-14 items-center gap-2 rounded-xl sm:gap-2.5 border border-white/10 bg-black/20 px-2.5 py-2 text-start transition hover:border-gold/50 hover:bg-white/[.07] active:scale-[.98] disabled:opacity-60"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-noir sm:h-9 sm:w-9" style={{ background: m.tone }}>
                {busy === r ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={m.icon} size={17} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight text-white">{t(m.ar, m.en)}</span>
                <span className="mt-0.5 block text-[10.5px] leading-snug text-cream/55">{t(...DO[r])}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-[#ffb4ab]">{t("تعذر الدخول التجريبي، حاول مرة أخرى.", "Demo sign-in failed, try again.")}</p>}
    </section>
  );
}
