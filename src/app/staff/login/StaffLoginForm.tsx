"use client";
import { useActionState } from "react";
import { staffLoginAction } from "./actions";
import { btn, input, label } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

export default function StaffLoginForm({ lang, next }: { lang: Lang; next?: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [s, action, pending] = useActionState(staffLoginAction, { error: null as null | "invalid" | "locked" });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="u" className={label}>{t("اسم المستخدم", "Username")}</label>
        <input id="u" name="username" required autoComplete="username" dir="ltr" className={input} />
      </div>
      <div>
        <label htmlFor="p" className={label}>{t("كلمة المرور", "Password")}</label>
        <input id="p" name="password" type="password" required autoComplete="current-password" dir="ltr" className={input} />
      </div>
      {s.error && (
        <p role="alert" className="text-sm text-bad">
          {s.error === "locked"
            ? t("الحساب موقوف 15 دقيقة بعد 5 محاولات فاشلة.", "Account locked for 15 minutes after 5 failed attempts.")
            : t("اسم المستخدم أو كلمة المرور غير صحيحة.", "Incorrect username or password.")}
        </p>
      )}
      <button data-primary className={`${btn.primary} shimmer-btn w-full`} disabled={pending}>
        {pending ? t("جارٍ الدخول…", "Signing in…") : t("دخول", "Sign in")}
      </button>
    </form>
  );
}
