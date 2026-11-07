import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Shell, staffNav } from "@/components/Shell";
import { Card, PageTitle, btn } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import AutoRefresh from "@/components/AutoRefresh";
import { requireCap } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runHealth, type Status } from "@/lib/health";
import { i18n } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function recheckAction() {
  "use server";
  const u = await requireCap("health.view");
  const h = await runHealth();
  await audit(`user:${u.id}`, "health.checked", null, null, { status: h.operate, ready: h.ready, audit: h.audit, ms: h.ms });
  revalidatePath("/staff/health");
}

// status is always carried by an icon and a word, never by colour alone
const S: Record<Status, { icon: IconName; ar: string; en: string; chip: string; ring: string }> = {
  ok: { icon: "check", ar: "سليم", en: "OK", chip: "bg-ok-soft text-ok", ring: "border-ok/30" },
  warn: { icon: "alert", ar: "ملاحظة", en: "Attention", chip: "bg-wait-soft text-wait", ring: "border-wait/40" },
  fail: { icon: "close", ar: "خلل", en: "Failing", chip: "bg-bad-soft text-bad", ring: "border-bad/40" },
  info: { icon: "monitor", ar: "معلومة", en: "Info", chip: "bg-off-soft text-off", ring: "border-line" },
};

function Chip({ s, t }: { s: Status; t: (a: string, b: string) => string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${S[s].chip}`}>
      <Icon name={S[s].icon} size={14} strokeWidth={2.4} /> {t(S[s].ar, S[s].en)}
    </span>
  );
}

export default async function HealthPage() {
  const u = await requireCap("health.view");
  const { t, lang } = await i18n();
  const h = await runHealth();
  const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { timeStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(h.at));
  const count = (scope: "operate" | "ready") => {
    const cs = h.groups.filter((g) => g.scope === scope).flatMap((g) => g.checks).filter((c) => c.status !== "info");
    return { ok: cs.filter((c) => c.status === "ok").length, warn: cs.filter((c) => c.status === "warn").length, fail: cs.filter((c) => c.status === "fail").length, all: cs.length };
  };
  const verdict = {
    operate: { ok: ["كل الأنظمة تعمل", "All systems operational"], warn: ["يعمل مع ملاحظات", "Operational, with notes"], fail: ["جزء لا يعمل — يحتاج تدخلًا", "Something is failing — act now"], info: ["", ""] },
    ready: { ok: ["جاهز للتشغيل الفعلي", "Ready for live use"], warn: ["إعدادات التجربة ما زالت مفعّلة", "Trial settings still on"], fail: ["غير جاهز للتشغيل الفعلي", "Not ready for live use"], info: ["", ""] },
  } as const;

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/health" user={u.name} kind="staff" wide>
      <AutoRefresh seconds={60} />
      <PageTitle
        title={t("حالة النظام", "System health")}
        sub={t("فحص حي لكل أجزاء المنصة: القاعدة، وسلامة السجل، والأخطاء، وسير الطلبات، والميدان، والرسائل. يتحدّث تلقائيًا كل دقيقة.", "A live check of every part of the platform: database, audit integrity, errors, the request pipeline, the field and messaging. Refreshes every minute.")}
        action={
          <form action={recheckAction}>
            <button className={btn.secondary}><Icon name="log" size={16} /> {t("إعادة الفحص الآن", "Re-run checks")}</button>
          </form>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {(["operate", "ready"] as const).map((scope) => {
          const s = h[scope];
          const c = count(scope);
          return (
            <section key={scope} aria-live="polite" className={`flex items-center gap-4 rounded-2xl border bg-surface p-4 shadow-card sm:p-5 ${S[s].ring}`}>
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${S[s].chip}`}><Icon name={S[s].icon} size={24} strokeWidth={2.4} /></span>
              <div className="min-w-0">
                <p className="text-xs text-ink-soft">{scope === "operate" ? t("التشغيل الآن", "Operating now") : t("جاهزية التشغيل الفعلي", "Launch readiness")}</p>
                <p className="text-lg font-bold text-ink">{t(verdict[scope][s][0], verdict[scope][s][1])}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {t(`${c.ok} من ${c.all} سليم`, `${c.ok} of ${c.all} OK`)}
                  {c.warn > 0 && t(` · ${c.warn} ملاحظة`, ` · ${c.warn} to review`)}
                  {c.fail > 0 && t(` · ${c.fail} خلل`, ` · ${c.fail} failing`)}
                </p>
              </div>
            </section>
          );
        })}
      </div>
      <p className="mb-5 mt-2 text-xs text-ink-soft">
        {t("آخر فحص", "Last check")} <span className="num">{time}</span> · {t("استغرق", "took")} <span className="num">{h.ms}</span> {t("مللي ثانية", "ms")}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {h.groups.map((g) => (
          <Card key={g.id} title={t(...g.title)} action={<Chip s={g.checks.some((c) => c.status === "fail") ? "fail" : g.checks.some((c) => c.status === "warn") ? "warn" : "ok"} t={t} />}>
            <ul className="-my-2 divide-y divide-line">
              {g.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  <Chip s={c.status} t={t} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{t(...c.title)}</p>
                    <p className="mt-0.5 text-sm text-ink-soft [overflow-wrap:anywhere]">{t(...c.value)}</p>
                    {c.hint && <p className={`mt-1 text-xs [overflow-wrap:anywhere] ${c.status === "fail" ? "text-bad" : c.status === "warn" ? "text-wait" : "text-ink-soft"}`}>{t(...c.hint)}</p>}
                  </div>
                  {c.href && (
                    <Link href={c.href} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-chip/60" aria-label={`${t("فتح", "Open")} ${t(...c.title)}`}>
                      {t("فتح", "Open")} <Icon name="chevron" size={14} />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <p className="mt-5 text-xs text-ink-soft">
        {t("مدير التشغيل يطّلع ويتابع فقط: لا يتخذ قرارًا على الطلبات ولا يغيّر الإعدادات، تطبيقًا لفصل المهام. كل «إعادة فحص» تُسجَّل في سجل العمليات.", "The operations manager observes only: no decisions on requests and no settings changes (separation of duties). Every re-run is recorded in the audit log.")}
      </p>
    </Shell>
  );
}
