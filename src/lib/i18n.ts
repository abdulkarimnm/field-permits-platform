import "server-only";
import { cookies } from "next/headers";

export type Lang = "ar" | "en";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lang")?.value === "en" ? "en" : "ar";
}

/** Inline bilingual strings: t("عربي", "English"). */
export async function i18n() {
  const lang = await getLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const fmtDate = (d: Date | string | null | undefined, withTime = true) =>
    d
      ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
          dateStyle: "medium",
          ...(withTime ? { timeStyle: "short" } : {}),
          timeZone: "Asia/Riyadh",
        }).format(new Date(d))
      : "—";
  return { lang, t, fmtDate, dir: lang === "ar" ? "rtl" : "ltr" } as const;
}
