"use client";
import { useActionState, useState } from "react";
import { sendCodeAction, verifyCodeAction, type SendState } from "./actions";
import { btn, input, label } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

const ERR: Record<string, [string, string]> = {
  invalid_contact: ["أدخل جوالًا بصيغة 05XXXXXXXX أو بريدًا إلكترونيًا صحيحًا", "Enter a 05XXXXXXXX mobile or a valid email"],
  cooldown: ["انتظر قليلًا قبل طلب رمز جديد", "Please wait before requesting a new code"],
  hourly_limit: ["تجاوزت الحد المسموح (8 رموز في الساعة). حاول لاحقًا", "Hourly limit reached (8 codes). Try later"],
  expired: ["انتهت صلاحية الرمز، اطلب رمزًا جديدًا", "Code expired, request a new one"],
  wrong: ["الرمز غير صحيح", "Incorrect code"],
  too_many: ["تجاوزت عدد المحاولات (5). اطلب رمزًا جديدًا", "Too many attempts (5). Request a new code"],
};

export default function LoginForm({ lang, demo }: { lang: Lang; demo: boolean }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [sent, sendAction, sending] = useActionState<SendState, FormData>(sendCodeAction, { step: "contact" });
  const [ver, verifyAction, verifying] = useActionState<SendState, FormData>(verifyCodeAction, { step: "code" });
  const [, force] = useState(0);
  const step = sent.step;
  const err = (ver.error && step === "code" ? ver.error : sent.error) ?? null;
  const msg = err ? t(...(ERR[err] ?? ["حدث خطأ", "Something went wrong"])) + (sent.info && err === "cooldown" ? ` (${sent.info}s)` : "") : null;

  if (step === "contact")
    return (
      <form action={sendAction} className="space-y-4">
        <div>
          <label htmlFor="contact" className={label}>
            {t("رقم الجوال أو البريد الإلكتروني", "Mobile number or email")}
          </label>
          <input id="contact" name="contact" required autoComplete="tel email" inputMode="email" dir="ltr" placeholder="05XXXXXXXX" className={input} aria-invalid={!!err} defaultValue={sent.contact} />
          <p className="mt-1.5 text-xs text-ink-soft">{t("سنرسل رمزًا لمرة واحدة صالحًا 10 دقائق. لا حاجة لإنشاء حساب.", "We'll send a one-time code valid for 10 minutes. No account needed.")}</p>
        </div>
        {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
        <button data-primary className={`${btn.primary} shimmer-btn w-full`} disabled={sending}>
          {sending ? t("جارٍ الإرسال…", "Sending…") : t("إرسال رمز التحقق", "Send code")}
        </button>
      </form>
    );

  return (
    <div className="space-y-4">
      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="contact" value={sent.contact} />
        <div>
          <label htmlFor="code" className={label}>
            {t("رمز التحقق المرسل إلى", "Code sent to")} <span className="num font-semibold">{sent.contact}</span>
          </label>
          <input id="code" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" className={`${input} text-center text-2xl tracking-[0.5em]`} aria-invalid={!!err} />
        </div>
        {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
        <button data-primary className={`${btn.primary} shimmer-btn w-full`} disabled={verifying}>
          {verifying ? t("جارٍ التحقق…", "Verifying…") : t("دخول", "Sign in")}
        </button>
      </form>
      <form action={sendAction} className="flex items-center justify-between text-sm" onSubmit={() => force((x) => x + 1)}>
        <input type="hidden" name="contact" value={sent.contact} />
        <input type="hidden" name="resend" value="1" />
        <button data-ghost className={btn.ghost}>{t("إعادة إرسال الرمز", "Resend code")}</button>
        {demo && (
          <a href="/dev/outbox" target="_blank" className="text-xs text-ink-soft underline">
            {t("عرض الرسالة التجريبية", "View test message")}
          </a>
        )}
      </form>
    </div>
  );
}
