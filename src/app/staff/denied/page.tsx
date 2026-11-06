import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { requireStaff } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { CAPS, ROLE_HOME, ROLE_INFO, rolesWith, type Cap, type Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/* Instead of a silent bounce: say what was needed, which roles have it, and where to go. */
export default async function Denied({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const u = await requireStaff();
  const { t } = await i18n();
  const need = (await searchParams).need as Cap | undefined;
  const cap = need && need in CAPS ? CAPS[need] : null;
  const holders = need && cap ? rolesWith(need) : [];
  const home = ROLE_HOME[(u.roles[0] as Role) ?? "reviewer"] ?? "/staff";
  return (
    <Shell nav={staffNav(u.roles)} active="" user={u.name} kind="staff">
      <div className="mx-auto max-w-lg py-10 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-chip text-brand" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">{t("هذا القسم خارج صلاحيات دورك", "This section is outside your role")}</h1>
        {cap ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {t("يتطلب صلاحية", "It requires")} <strong className="text-ink">«{t(cap.ar, cap.en)}»</strong>
            {holders.length > 0 && <>{t("، المتاحة لـ: ", ", available to: ")}<strong className="text-ink">{holders.map((r) => t(ROLE_INFO[r].ar, ROLE_INFO[r].en)).join(t(" و", " and "))}</strong></>}.
          </p>
        ) : <p className="mt-3 text-sm text-ink-soft">{t("لا تملك صلاحية الوصول إلى تلك الصفحة.", "You don't have access to that page.")}</p>}
        <p className="mt-2 text-xs text-ink-soft">{t("إن كان عملك يتطلبها فاطلب من مسؤول النظام إسناد الدور المناسب — كل تغيير في الأدوار يُسجَّل.", "If your work needs it, ask the system admin to assign the right role — every role change is logged.")}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={home} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep">{t("العودة إلى مساحة عملي", "Back to my workspace")}</Link>
          <Link href="/staff/access" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold hover:border-gold">{t("عرض صلاحياتي", "View my permissions")}</Link>
        </div>
      </div>
    </Shell>
  );
}
