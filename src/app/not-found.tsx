import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { btn } from "@/components/ui";
import { i18n } from "@/lib/i18n";

/** Branded, themed 404 (Next's default page ignores the theme and reads white-on-light in day mode). */
export default async function NotFound() {
  const { t } = await i18n();
  return (
    <>
      <Masthead />
      <main className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-12 text-center">
        <div className="w-full rounded-3xl border border-line bg-surface p-8 shadow-card">
          <p className="num font-display text-5xl font-bold text-brand">404</p>
          <h1 className="mt-3 text-xl font-bold text-ink">{t("الصفحة غير موجودة", "Page not found")}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t("قد يكون الرابط قديمًا أو أن هذا السجل غير متاح لحسابك.", "The link may be old, or this record isn't available to your account.")}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/" className={btn.secondary}>{t("الصفحة الرئيسية", "Home")}</Link>
            <Link href="/start" className={btn.primary}>{t("ابدأ", "Start")}</Link>
          </div>
        </div>
      </main>
    </>
  );
}
