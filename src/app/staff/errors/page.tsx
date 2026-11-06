import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Shell, staffNav } from "@/components/Shell";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { errorStats, listErrors, setResolved } from "@/lib/errors";
import { i18n } from "@/lib/i18n";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function toggleAction(fd: FormData) {
  "use server";
  const u = await requireCap("errors.view");
  const id = Number(fd.get("id"));
  const resolved = fd.get("resolved") === "1";
  await setResolved(id, resolved, u.name);
  await audit(`user:${u.id}`, resolved ? "error.resolved" : "error.reopened", "error", id, {});
  revalidatePath("/staff/errors");
}

const SRC: Record<string, [string, string]> = {
  server: ["الخادم · صفحة", "Server · page"],
  api: ["الخادم · واجهة برمجية", "Server · API"],
  action: ["الخادم · إجراء", "Server · action"],
  client: ["المتصفح", "Browser"],
  render: ["المتصفح · عرض", "Browser · render"],
};

export default async function Errors({ searchParams }: { searchParams: Promise<{ status?: string; source?: string; q?: string; open?: string }> }) {
  const u = await requireCap("errors.view");
  const sp = await searchParams;
  const { t, lang } = await i18n();
  const status = sp.status ?? "open";
  const [rows, st, demo] = await Promise.all([listErrors({ status, source: sp.source, q: sp.q }), errorStats(), getSetting("demo_mode")]);
  const dt = (d: Date) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d));
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ status, source: sp.source, q: sp.q, ...o }).forEach(([k, v]) => v && p.set(k, v));
    return `/staff/errors?${p}`;
  };

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/errors" user={u.name} kind="staff" wide>
      <PageTitle
        title={t("سجل الأخطاء التقنية", "Technical error log")}
        sub={t("أخطاء الخادم والمتصفح تُسجَّل تلقائيًا وتُجمع حسب البصمة؛ الخطأ المتكرر سطر واحد بعدّاد. منفصل عن سجل العمليات، والبيانات الشخصية مخفية.", "Server and browser errors are captured automatically and grouped by fingerprint. Separate from the audit log; personal data is masked.")}
        action={demo ? <a href="/api/errors/test" className="inline-flex min-h-10 items-center rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:border-gold">{t("توليد خطأ تجريبي", "Trigger a test error")}</a> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [t("أخطاء مفتوحة", "Open"), st.open, st.open ? "text-bad" : "text-ok"],
          [t("تكرارات آخر 24 ساعة", "Occurrences (24h)"), st.occurrences24, "text-ink"],
          [t("جديدة آخر 24 ساعة", "New (24h)"), st.today, "text-ink"],
          [t("مفتوحة: خادم / متصفح", "Open: server / browser"), `${st.server} / ${st.client}`, "text-ink"],
        ].map(([k, v, c]) => (
          <div key={String(k)} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-xs text-ink-soft">{k}</p>
            <p className={`num mt-1 font-display text-3xl font-bold ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
        <input type="hidden" name="status" value={status} />
        {[["open", t("مفتوحة", "Open")], ["resolved", t("معالجة", "Resolved")], ["all", t("الكل", "All")]].map(([k, l]) => (
          <Link key={k} href={link({ status: k })} aria-current={status === k ? "page" : undefined} className={`min-h-9 content-center rounded-full border px-3.5 text-xs font-semibold ${status === k ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-gold"}`}>{l}</Link>
        ))}
        <select name="source" defaultValue={sp.source ?? ""} aria-label={t("المصدر", "Source")} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">{t("كل المصادر", "All sources")}</option>
          {Object.entries(SRC).map(([k, v]) => <option key={k} value={k}>{t(...v)}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder={t("بحث في الرسالة أو المسار أو رمز المرجع", "Search message, path or reference")} className="min-h-9 min-w-56 flex-1 rounded-lg border border-line px-3 text-sm" />
        <button className="min-h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-white">{t("بحث", "Search")}</button>
      </form>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-display text-lg font-bold text-ok">✓ {t("لا توجد أخطاء", "No errors")}</p>
            <p className="mt-1 text-sm text-ink-soft">{t("النظام يعمل دون أخطاء تقنية مسجلة ضمن هذا التصفية.", "No technical errors recorded for this filter.")}</p>
          </div>
        ) : (
          <ul className="-my-2 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <details open={sp.open === String(r.id)} className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.resolved ? "bg-ok" : r.level === "warning" ? "bg-wait" : "bg-bad"}`} aria-hidden />
                    <Badge tone={r.source === "client" || r.source === "render" ? "brand" : "hold"}>{t(...(SRC[r.source] ?? [r.source, r.source]))}</Badge>
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" dir="ltr">{r.message}</span>
                    <span className="num rounded-full bg-mist px-2 py-0.5 text-xs font-bold text-ink" title={t("عدد التكرار", "Occurrences")}>×{r.count}</span>
                    <span className="text-xs text-ink-soft">{dt(r.last_at)}</span>
                    {r.resolved && <Badge tone="ok">{t("معالج", "Resolved")}</Badge>}
                  </summary>
                  <div className="mt-3 space-y-3 rounded-xl bg-paper p-3 text-xs">
                    <dl className="grid gap-2 sm:grid-cols-4">
                      <div><dt className="text-ink-soft">{t("المسار", "Path")}</dt><dd className="font-mono" dir="ltr">{r.method ? `${r.method} ` : ""}{r.path ?? "—"}</dd></div>
                      <div><dt className="text-ink-soft">{t("رمز المرجع", "Reference")}</dt><dd className="num font-bold">{r.digest ?? "—"}</dd></div>
                      <div><dt className="text-ink-soft">{t("أول ظهور", "First seen")}</dt><dd>{dt(r.first_at)}</dd></div>
                      <div><dt className="text-ink-soft">{t("آخر ظهور", "Last seen")}</dt><dd>{dt(r.last_at)}</dd></div>
                    </dl>
                    {r.user_agent && <p className="truncate text-ink-soft" dir="ltr">{r.user_agent}</p>}
                    {r.stack && <pre className="max-h-64 overflow-auto rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-cream" dir="ltr">{r.stack}</pre>}
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={toggleAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="resolved" value={r.resolved ? "0" : "1"} />
                        <button className={`min-h-9 rounded-lg px-4 text-xs font-semibold ${r.resolved ? "border border-line text-ink" : "bg-ok text-white"}`}>{r.resolved ? t("إعادة فتح", "Reopen") : t("تمت المعالجة", "Mark resolved")}</button>
                      </form>
                      {r.resolved && r.resolved_by && <span className="text-ink-soft">{t(`عالجه ${r.resolved_by}`, `Resolved by ${r.resolved_by}`)} · {r.resolved_at ? dt(r.resolved_at) : ""}</span>}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
