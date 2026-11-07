import Link from "next/link";
import type { ReactNode } from "react";
import { i18n } from "@/lib/i18n";
import { logoutAction } from "@/app/actions";
import { Masthead } from "./Masthead";
import TabBar, { type Tab } from "./TabBar";
import type { IconName } from "./icons";
import { capsOf, type Cap } from "@/lib/rbac";

export type NavItem = { href: string; ar: string; en: string; icon?: IconName; short?: [string, string] };

export async function Shell({
  children,
  nav = [],
  active,
  user,
  kind,
  wide,
  dark,
}: {
  children: ReactNode;
  nav?: NavItem[];
  active?: string;
  user?: string | null;
  kind?: "staff" | "applicant";
  wide?: boolean;
  dark?: boolean;
}) {
  const { t, lang } = await i18n();
  const max = wide ? "max-w-7xl" : "max-w-6xl";

  // Mobile app tabs: the first 4 destinations; the rest go to the "More" sheet.
  const all: Tab[] = nav.map((n) => ({ href: n.href, label: t(...(n.short ?? [n.ar, n.en])), full: t(n.ar, n.en), icon: n.icon ?? "list", primary: n.href === "/apply/new" }));
  // Always ≤5 slots: up to 4 destinations + a "More" sheet (overflow, language, sign out).
  const tabs = all.slice(0, 4);
  const more = all.slice(4);

  return (
    <div className={`flex min-h-dvh flex-col ${dark ? "noir" : ""}`}>
      <header className="no-print sticky top-0 z-40 md:relative">
        <Masthead
          href="/start"
          wide={wide}
          end={
            user && kind ? (
              <form action={logoutAction} data-logout className={`items-center gap-1 ${nav.length ? "hidden md:flex" : "flex"}`}>
                <input type="hidden" name="kind" value={kind} />
                <span className="hidden max-w-44 truncate rounded-lg bg-chip/70 px-3 py-2 text-sm font-medium text-brand lg:inline">{user}</span>
                <button className="min-h-10 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-bad">{t("خروج", "Sign out")}</button>
              </form>
            ) : null
          }
        />
        {nav.length > 0 && (
          <div className="band hidden md:block">
            <nav className={`mx-auto flex gap-1 overflow-x-auto px-4 py-2 sm:px-6 ${max}`} aria-label={t("التنقل", "Navigation")}>
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active === n.href ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${active === n.href ? "bg-white/10 text-gold-soft ring-1 ring-gold/40" : "text-cream/75 hover:bg-white/5 hover:text-white"}`}
                >
                  {t(n.ar, n.en)}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 md:py-7 ${nav.length ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6" : ""} ${max}`}>{children}</main>
      <footer className={`no-print hidden border-t py-4 text-center text-xs md:block ${dark ? "border-white/10 text-cream/40" : "border-line text-ink-soft"}`}>
        {t("إدارة ميدان سيد الشهداء — منصة تصاريح الدخول", "Sayyid Alshuhada Field Administration — Entry Permits Platform")}
      </footer>
      {nav.length > 0 && (
        <TabBar
          tabs={tabs}
          more={more}
          user={user ?? null}
          kind={kind ?? null}
          lang={lang}
          labels={{ more: t("المزيد", "More"), signOut: t("تسجيل الخروج", "Sign out"), language: t("English", "العربية"), close: t("إغلاق", "Close"), menu: t("القائمة", "Menu") }}
        />
      )}
    </div>
  );
}

export const STAFF_NAV: (NavItem & { cap?: Cap; any?: Cap[] })[] = [
  { href: "/staff", ar: "مساحة العمل", en: "Workspace", short: ["عملي", "Work"], icon: "home", any: ["request.view", "users.manage", "ops.view"] },
  { href: "/verify", ar: "بوابة التحقق", en: "Verification", short: ["التحقق", "Verify"], icon: "scan", cap: "verify.scan" },
  { href: "/staff/health", ar: "حالة النظام", en: "System health", short: ["الحالة", "Health"], icon: "gauge", cap: "health.view" },
  { href: "/staff/ops", ar: "غرفة العمليات", en: "Operations room", short: ["العمليات", "Ops"], icon: "pulse", cap: "ops.view" },
  { href: "/staff/permits", ar: "التصاريح والطلبات", en: "Permits & requests", short: ["التصاريح", "Permits"], icon: "doc", cap: "permit.view" },
  { href: "/staff/capacity", ar: "السعة", en: "Capacity", icon: "grid", cap: "capacity.view" },
  { href: "/staff/reports", ar: "التقارير", en: "Reports", icon: "download", cap: "reports.view" },
  { href: "/staff/audit", ar: "سجل العمليات", en: "Audit log", short: ["السجل", "Audit"], icon: "log", cap: "audit.view" },
  { href: "/staff/errors", ar: "الأخطاء التقنية", en: "Error log", short: ["الأخطاء", "Errors"], icon: "shield", cap: "errors.view" },
  { href: "/staff/access", ar: "الصلاحيات", en: "Permissions", short: ["الصلاحيات", "Access"], icon: "key", cap: "users.manage" },
  { href: "/staff/admin", ar: "الإعدادات", en: "Settings", icon: "settings", cap: "settings.manage" },
];

/** Navigation is derived from the permission matrix (lib/rbac.ts): a section appears only if the user can open it. */
export function staffNav(roles: string[]) {
  const caps = capsOf(roles);
  return STAFF_NAV.filter((n) => (n.cap ? caps.has(n.cap) : n.any ? n.any.some((c) => caps.has(c)) : true));
}
