import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { i18n } from "@/lib/i18n";
import { getApplicant } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import LoginForm from "./LoginForm";

export default async function ApplicantLogin() {
  if (await getApplicant()) redirect("/apply");
  const { t, lang } = await i18n();
  const demo = await getSetting("demo_mode");
  return (
    <AuthLayout
      eyebrow={t("بوابة تقديم الطلبات", "Request portal")}
      title={t("ابدأ طلبك دون حساب", "Start without an account")}
      sub={t("رمز لمرة واحدة إلى جوالك أو بريدك يكفي. طلباتك تبقى مرتبطة بوسيلة التواصل التي تحققت منها فقط.", "A one-time code to your phone or email is enough. Your requests stay tied only to the contact you verified.")}
      points={[t("نموذج ذكي يتحقق أثناء الكتابة", "Smart form that checks as you type"), t("لصق قوائم الأفراد من Excel", "Paste people lists from Excel"), t("حجز موعد الدخول من جدول السعة", "Book your entry hour live")]}
    >
      <h1 className="font-display text-[1.75rem] font-bold text-white">{t("تسجيل الدخول", "Sign in")}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">{t("للجهات والشركات وممثليها", "For organizations and their representatives")}</p>
      <div className="mt-7">
        <LoginForm lang={lang} demo={demo} />
      </div>
    </AuthLayout>
  );
}
