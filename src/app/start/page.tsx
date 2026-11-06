import Link from "next/link";
import { redirect } from "next/navigation";
import { getApplicant, getStaff } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { ArchesArt, Silk } from "@/components/Arches";
import { Icon } from "@/components/icons";
import { Masthead } from "@/components/Masthead";
import { getSetting } from "@/lib/settings";

/** App launcher (manifest start_url): resume where the user belongs, or show an app-style welcome. */
export default async function Start() {
  const staff = await getStaff();
  if (staff) redirect(staff.roles.length === 1 && staff.roles[0] === "verifier" ? "/verify" : "/staff");
  if (await getApplicant()) redirect("/apply");
  const { t } = await i18n();
  const demo = await getSetting("demo_mode");
  const roles = [
    { href: "/apply/login", icon: "doc" as const, title: t("أنا جهة أو شركة", "I'm an organization"), sub: t("قدّم طلبًا أو تابع تصاريحك", "Request or track permits") },
    { href: "/staff/login", icon: "shield" as const, title: t("موظف إدارة الميدان", "Field staff"), sub: t("المراجعة والاعتماد والعمليات", "Review, approval & ops") },
    { href: "/staff/login?next=/verify", icon: "scan" as const, title: t("متحقق ميداني", "Field verifier"), sub: t("مسح التصاريح عند البوابة", "Scan permits at the gate") },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
    <Masthead />
    <div className="noir relative flex flex-1 flex-col overflow-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <Silk />
      <ArchesArt className="pointer-events-none absolute -top-10 left-1/2 w-[160%] max-w-3xl -translate-x-1/2 opacity-35" />
      <div className="relative z-10 flex flex-1 flex-col justify-end">
        <div className="rise">
          <p className="flex items-center gap-3 text-xs font-semibold text-gold"><span className="h-px w-8 bg-gold/70" />{t("ميدان سيد الشهداء", "Sayyid Alshuhada Field")}</p>
          <h1 className="mt-4 font-display text-[2.1rem] font-bold leading-tight text-white">
            {t("أهلًا بك في", "Welcome to")}
            <span className="text-gold-grad block">{t("تصاريح الميدان", "Field Permits")}</span>
          </h1>
          <p className="mt-3 text-sm leading-[1.9] text-cream/65">{t("اختر طريقة دخولك وسنتذكرها لك في المرة القادمة.", "Choose how you enter — we'll remember next time.")}</p>
        </div>
        <ul className="mt-8 space-y-3">
          {roles.map((r, i) => (
            <li key={r.href} className="rise" style={{ animationDelay: `${0.1 + i * 0.07}s` }}>
              <Link href={r.href} className="flex min-h-[4.5rem] items-center gap-4 rounded-2xl border border-white/10 bg-white/[.05] px-4 backdrop-blur-md transition active:scale-[.98] active:bg-white/10">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-gold-soft to-gold text-noir"><Icon name={r.icon} size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-white">{r.title}</span>
                  <span className="block text-xs text-cream/55">{r.sub}</span>
                </span>
                <Icon name="chevron" size={18} className="text-gold/70 ltr:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
        {demo && (
          <Link href="/sandbox" className="rise mt-4 flex min-h-14 items-center justify-center gap-2.5 rounded-2xl border border-gold/50 text-[15px] font-semibold text-gold-soft active:scale-[.98]" style={{ animationDelay: ".35s" }}>
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" /></span>
            {t("مختبر الصلاحيات: جرّب كل الأدوار", "Roles lab: try every role")}
          </Link>
        )}
      </div>
    </div>
    </div>
  );
}
