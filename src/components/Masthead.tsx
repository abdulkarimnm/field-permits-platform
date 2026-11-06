import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { i18n } from "@/lib/i18n";
import { setLangAction } from "@/app/actions";

/** Official masthead: cream band, large logo in its original colours, Hijri/Gregorian date, language. */
export async function Masthead({ end, href = "/", wide = true }: { end?: ReactNode; href?: string; wide?: boolean }) {
  const { t, lang } = await i18n();
  const now = new Date();
  const hijri = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-US-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(now);
  const greg = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(now);
  return (
    <div className="no-print relative z-20 bg-[#fffaf5] text-ink">
      <div className="pt-[env(safe-area-inset-top)]" />
      <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 ${wide ? "max-w-7xl" : "max-w-6xl"}`}>
        <Link href={href} className="flex shrink-0 items-center gap-4" aria-label={t("الصفحة الرئيسية", "Home")}>
          <Image src="/brand/logo.png" alt={t("سيد الشهداء", "Sayyid Alshuhada")} width={240} height={57} priority className="h-11 w-auto sm:h-14 lg:h-16" />
          <span className="hidden h-10 w-px bg-line lg:block" />
          <span className="hidden leading-tight lg:block">
            <span className="block font-display text-[15px] font-bold text-brand">{t("منصة تصاريح دخول الميدان", "Field Entry Permits Platform")}</span>
            <span className="block text-xs text-ink-soft">{t("إدارة ميدان سيد الشهداء", "Sayyid Alshuhada Field Administration")}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-end text-xs leading-relaxed text-ink-soft md:block">
            <span className="block font-medium text-ink">{greg}</span>
            <span className="block">{hijri}</span>
          </span>
          {end}
          <form action={setLangAction}>
            <input type="hidden" name="lang" value={lang === "ar" ? "en" : "ar"} />
            <button className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-brand transition hover:border-gold" aria-label="Switch language">
              {lang === "ar" ? "EN" : "عربي"}
            </button>
          </form>
        </div>
      </div>
      <div className="h-[3px] bg-gradient-to-l from-brand via-gold to-brand" />
    </div>
  );
}
