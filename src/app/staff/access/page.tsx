import Link from "next/link";
import { Fragment } from "react";
import { Shell, staffNav } from "@/components/Shell";
import { Card, PageTitle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { requireStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { CAP_GROUPS, CAPS, can, capsOf, ROLE_CAPS, ROLE_INFO, ROLES, type Cap, type Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/* Transparent RBAC: everyone can see exactly what each role may do (and what their own roles grant).
   Admins additionally see who holds each role and can preview any role's view. */
export default async function Access({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const u = await requireStaff();
  const sp = await searchParams;
  const { t } = await i18n();
  const mine = capsOf(u.roles);
  const admin = can(u, "users.manage");
  const users = admin ? await q<{ id: number; name: string; username: string; roles: string[]; active: boolean }>(`SELECT id, name, username, roles, active FROM users ORDER BY id`) : [];
  const preview = admin && ROLES.includes(sp.as as Role) ? (sp.as as Role) : null;
  const previewNav = preview ? staffNav([preview]) : [];
  const capList = Object.keys(CAPS) as Cap[];

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/access" user={u.name} kind="staff" wide>
      <PageTitle
        title={t("الصلاحيات", "Permissions")}
        sub={t("مبدأ أقل صلاحية: كل دور يرى ما يحتاجه لعمله فقط، ولا توجد صلاحيات خفية لأي دور — حتى مسؤول النظام. القرار على كل مرحلة لمسؤولها المحدد، مع فصل المهام بين المرحلتين.", "Least privilege: each role sees only what its job needs, with no hidden powers — not even for the admin. Each stage is decided by its assigned owner, with separation of duties.")}
      />

      {/* my access */}
      <Card title={t("صلاحياتي", "My permissions")}>
        <div className="flex flex-wrap gap-2">
          {u.roles.map((r) => ROLE_INFO[r as Role] && (
            <span key={r} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[r as Role].tone }} />{t(ROLE_INFO[r as Role].ar, ROLE_INFO[r as Role].en)}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CAP_GROUPS.map((g) => {
            const items = capList.filter((c) => CAPS[c].group === g.id);
            return (
              <div key={g.id} className="rounded-xl border border-line bg-paper p-3">
                <p className="mb-2 text-xs font-bold text-ink-soft">{t(g.ar, g.en)}</p>
                <ul className="space-y-1.5">
                  {items.map((c) => {
                    const on = mine.has(c);
                    return (
                      <li key={c} className={`flex items-start gap-2 text-[13px] ${on ? "text-ink" : "text-ink-soft/60"}`}>
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${on ? "bg-ok text-white" : "border border-line"}`} aria-hidden>{on ? "✓" : ""}</span>
                        <span className={on ? "" : "line-through decoration-ink-soft/30"}>{t(CAPS[c].ar, CAPS[c].en)}</span>
                        <span className="sr-only">{on ? t("متاح", "granted") : t("غير متاح", "not granted")}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* the matrix */}
      <Card className="mt-5" title={t("مصفوفة الأدوار والصلاحيات", "Role × permission matrix")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{t("مصفوفة الصلاحيات", "Permission matrix")}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 bg-white px-3 py-3 text-start text-xs font-semibold text-ink-soft">{t("الصلاحية", "Permission")}</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className={`px-2 py-3 text-center text-xs font-bold ${u.roles.includes(r) ? "rounded-t-xl bg-cream text-brand" : "text-ink"}`}>
                    <span className="mx-auto mb-1 block h-1.5 w-8 rounded-full" style={{ background: ROLE_INFO[r].tone }} />
                    {t(ROLE_INFO[r].ar, ROLE_INFO[r].en)}
                    {u.roles.includes(r) && <span className="block text-[10px] font-semibold text-brand/70">{t("دورك", "your role")}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAP_GROUPS.map((g) => (
                <Fragment key={g.id}>
                  <tr><th colSpan={ROLES.length + 1} scope="colgroup" className="border-t border-line bg-paper px-3 py-1.5 text-start text-[11px] font-bold uppercase tracking-wide text-ink-soft">{t(g.ar, g.en)}</th></tr>
                  {capList.filter((c) => CAPS[c].group === g.id).map((c) => (
                    <tr key={c} className="group">
                      <th scope="row" className="sticky start-0 border-t border-line bg-white px-3 py-2 text-start font-medium text-ink group-hover:bg-paper">{t(CAPS[c].ar, CAPS[c].en)}</th>
                      {ROLES.map((r) => {
                        const on = ROLE_CAPS[r].includes(c);
                        return (
                          <td key={r} className={`border-t border-line px-2 py-2 text-center group-hover:bg-paper ${u.roles.includes(r) ? "bg-cream/50" : ""}`}>
                            {on ? <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-ok text-xs font-bold text-white" aria-label={t("مسموح", "allowed")}>✓</span> : <span className="text-ink-soft/40" aria-label={t("غير مسموح", "not allowed")}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid gap-2 text-xs text-ink-soft sm:grid-cols-3">
          <li className="rounded-xl bg-paper p-3"><strong className="text-ink">{t("مسؤول المرحلة", "Stage owner")}:</strong> {t("صلاحية المراجعة أو الاعتماد تُمارَس فقط على الطلبات المسندة لدورك أو لشخصك في إعدادات المسار.", "Review/approval applies only to requests assigned to your role or to you in the workflow settings.")}</li>
          <li className="rounded-xl bg-paper p-3"><strong className="text-ink">{t("فصل المهام", "Separation of duties")}:</strong> {t("من اعتمد المرحلة الأولى لا يعتمد النهائية للطلب نفسه عند تفعيل الخيار.", "Whoever did stage 1 cannot do stage 2 of the same request when enabled.")}</li>
          <li className="rounded-xl bg-paper p-3"><strong className="text-ink">{t("حماية البيانات", "Data protection")}:</strong> {t("أرقام الهوية مخفية جزئيًا، وكل إظهار كامل أو اطلاع على مرفق يُسجَّل.", "IDs are partially masked; every full reveal or attachment view is logged.")}</li>
        </ul>
      </Card>

      {admin && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title={t("من يحمل كل دور", "Who holds each role")} action={<Link href="/staff/admin?tab=users" className="text-xs font-semibold text-brand">{t("إدارة المستخدمين", "Manage users")}</Link>}>
            <ul className="space-y-3">
              {ROLES.map((r) => {
                const holders = users.filter((x) => x.roles.includes(r));
                return (
                  <li key={r}>
                    <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[r].tone }} />{t(ROLE_INFO[r].ar, ROLE_INFO[r].en)} <span className="num text-xs font-normal text-ink-soft">({holders.length})</span></p>
                    <p className="mt-1 text-sm text-ink-soft">{holders.length ? holders.map((h) => `${h.name}${h.active ? "" : t(" (معطّل)", " (disabled)")}`).join("، ") : <span className="text-hold">{t("لا أحد — عيّن مستخدمًا لهذا الدور", "Nobody — assign a user")}</span>}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title={t("معاينة ما يراه كل دور", "Preview what each role sees")}>
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {ROLES.map((r) => (
                <Link key={r} href={`/staff/access?as=${r}`} role="tab" aria-selected={preview === r} className={`min-h-9 content-center rounded-full border px-3 text-xs font-semibold ${preview === r ? "border-brand bg-brand text-white" : "border-line hover:border-gold"}`}>{t(ROLE_INFO[r].ar, ROLE_INFO[r].en)}</Link>
              ))}
            </div>
            {preview ? (
              <>
                <p className="mt-3 text-sm text-ink">{t(...ROLE_INFO[preview].job)}</p>
                <p className="mt-3 text-xs font-semibold text-ink-soft">{t("الأقسام الظاهرة في قائمته:", "Sections in their menu:")}</p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {previewNav.length === 0 && <li className="text-sm text-ink-soft">—</li>}
                  {previewNav.map((n) => (
                    <li key={n.href} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm"><Icon name={n.icon as IconName} size={16} className="text-brand" />{t(n.ar, n.en)}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-soft">{preview === "verifier" ? t("يُوجَّه مباشرة إلى بوابة التحقق عند الدخول ولا يرى الطلبات أو المرفقات.", "Lands directly on the verification portal and never sees requests or attachments.") : t(`${ROLE_CAPS[preview].length} صلاحية من ${capList.length}.`, `${ROLE_CAPS[preview].length} of ${capList.length} permissions.`)}</p>
              </>
            ) : <p className="mt-3 text-sm text-ink-soft">{t("اختر دورًا لمعاينة قائمته وصلاحياته.", "Pick a role to preview its menu and permissions.")}</p>}
          </Card>
        </div>
      )}
    </Shell>
  );
}
