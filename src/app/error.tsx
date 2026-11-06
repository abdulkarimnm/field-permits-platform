"use client";
import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/ClientErrorReporter";

/* Branded error screen. Server errors are already logged by instrumentation (they carry a digest);
   pure browser render errors are reported from here. The user gets a reference code to quote. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError({ message: error.message, stack: error.stack, kind: "render" });
  }, [error]);
  const code = error.digest ?? "CLIENT";
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 py-16" dir="rtl">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(61,42,36,.35)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-hold-soft text-2xl text-hold" aria-hidden>!</div>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">حدث خلل تقني غير متوقع</h1>
        <p className="mt-2 text-sm text-ink-soft">سُجّل الخلل تلقائيًا لدى الفريق التقني. لم تُفقد بياناتك المحفوظة.</p>
        <p className="mt-1 text-xs text-ink-soft" dir="ltr">An unexpected error occurred and was logged automatically.</p>
        <p className="mt-4 inline-block rounded-lg bg-mist px-3 py-1.5 text-xs text-ink-soft">رمز المرجع: <span className="num font-bold text-ink">{code}</span></p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep">إعادة المحاولة</button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-ink hover:border-gold">الصفحة الرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
