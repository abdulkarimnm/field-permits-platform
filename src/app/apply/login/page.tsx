import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { i18n } from "@/lib/i18n";
import { getApplicant } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import LoginForm from "./LoginForm";
import DemoAccounts from "@/components/DemoAccounts";

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
      {demo && (
        <div className="mt-6">
          <DemoAccounts lang={lang} first="applicant" />
          <p className="mt-5 flex items-center gap-3 text-[11px] text-cream/45"><span className="h-px flex-1 bg-white/10" />{t("أو ادخل برقم جوال ورمز تحقق", "or sign in with a mobile and a code")}<span className="h-px flex-1 bg-white/10" /></p>
        </div>
      )}
      <div className={demo ? "mt-5" : "mt-7"}>
        <LoginForm lang={lang} demo={demo} />
      </div>
    </AuthLayout>
  );
}
