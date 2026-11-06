import { ArchesArt, Silk } from "@/components/Arches";
import RetryButton from "./RetryButton";


export default function Offline() {
  return (
    <div className="noir relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center" dir="rtl" lang="ar">
      <Silk />
      <ArchesArt className="pointer-events-none absolute -bottom-10 w-[140%] max-w-3xl opacity-30" />
      <div className="relative z-10 max-w-sm">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-gold/40 bg-white/5 text-gold-soft">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M12 20h.01" />
          </svg>
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold text-white">لا يوجد اتصال</h1>
        <p className="mt-3 text-sm leading-[1.9] text-cream/70">
          هذه الصفحة تحتاج إلى الشبكة. بوابة التحقق الميداني وبطاقة الدخول على الجوال تعملان دون اتصال إذا فُتحتا مرة واحدة على الأقل.
        </p>
        <p className="mt-2 text-xs text-cream/45" dir="ltr">You&apos;re offline. The verification portal and the mobile pass keep working once opened.</p>
        <div className="mt-8 flex flex-col gap-2">
          <RetryButton />
          <a href="/verify" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-cream">بوابة التحقق</a>
        </div>
      </div>
    </div>
  );
}
