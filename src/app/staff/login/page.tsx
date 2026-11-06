import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { i18n } from "@/lib/i18n";
import { getStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import DemoAccounts from "@/components/DemoAccounts";
import StaffLoginForm from "./StaffLoginForm";

export default async function StaffLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getStaff();
  const { next } = await searchParams;
  if (u) redirect(next?.startsWith("/") ? next : u.roles.includes("verifier") && u.roles.length === 1 ? "/verify" : "/staff");
  const { t, lang } = await i18n();
  const demo = await getSetting("demo_mode");
  return (
    <AuthLayout
      eyebrow={t("دخول مخصص للمخولين", "Authorized access only")}
      title={t("إدارة الميدان والجهات المختصة", "Field administration & agencies")}
      sub={t("كل مستخدم يرى ما يحتاجه لعمله فقط، وكل إجراء يُسجل في سجل لا يقبل التلاعب.", "Every user sees only what their job needs, and every action lands in a tamper-evident log.")}
      points={[t("إيقاف الحساب 15 دقيقة بعد 5 محاولات فاشلة", "15-minute lock after 5 failed attempts"), t("انتهاء الجلسة بعد 60 دقيقة خمول", "Session ends after 60 idle minutes"), t("كلمات مرور مشفرة (scrypt)", "Hashed passwords (scrypt)")]}
    >
      <h1 className="font-display text-[1.75rem] font-bold text-white">{t("دخول الموظفين", "Staff sign in")}</h1>
      <p className="mt-1.5 text-sm text-ink-soft">{t("المراجعون والمعتمدون والمشرفون والمتحققون الميدانيون", "Reviewers, approvers, supervisors and field verifiers")}</p>
      {demo && (
        <div className="mt-6">
          <DemoAccounts lang={lang} first={next?.startsWith("/verify") ? "verifier" : "reviewer"} />
          <p className="mt-5 flex items-center gap-3 text-[11px] text-cream/45"><span className="h-px flex-1 bg-white/10" />{t("أو ادخل باسم مستخدم وكلمة مرور", "or sign in with a username and password")}<span className="h-px flex-1 bg-white/10" /></p>
        </div>
      )}
      <div className={demo ? "mt-5" : "mt-7"}>
        <StaffLoginForm lang={lang} next={next} />
      </div>
    </AuthLayout>
  );
}
