import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { Card, PageTitle } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { requireCap } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { isReportId, parseFilters, REPORTS, runReport, type Cell } from "@/lib/reports";
import { listGates, listZones } from "@/lib/settings";

export const dynamic = "force-dynamic";
const PREVIEW = 100;

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireCap("reports.view");
  const sp = await searchParams;
  const { t, lang } = await i18n();
  const id = isReportId(sp.r ?? "") ? (sp.r as (typeof REPORTS)[number]["id"]) : "kpi";
  const f = parseFilters(sp);
  const [r, zones, gates] = await Promise.all([runReport(id, f, lang), listZones(true), listGates()]);
  const usesGate = ["checks", "gates", "tamper", "kpi"].includes(id);

  const qs = (extra: Record<string, string | number | null | undefined> = {}) => {
    const p = new URLSearchParams();
    const all = { r: id, from: f.from, to: f.to, zone: f.zone, gate: usesGate ? f.gate : null, ...extra };
    Object.entries(all).forEach(([k, v]) => v != null && v !== "" && p.set(k, String(v)));
    return p.toString();
  };
  const today = new Date(Date.now() + 3 * 3600_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ago = (n: number) => iso(new Date(today.getTime() - n * 86400_000));
  const monthStart = `${iso(today).slice(0, 8)}01`;
  const presets: [string, string, string, string][] = [
    ["اليوم", "Today", iso(today), iso(today)],
    ["آخر 7 أيام", "Last 7 days", ago(6), iso(today)],
    ["آخر 30 يومًا", "Last 30 days", ago(29), iso(today)],
    ["هذا الشهر", "This month", monthStart, iso(today)],
  ];
  const fmt = (v: Cell, kind: string) => {
    if (v == null || v === "") return "—";
    // fixed numeric format reads the same in RTL and LTR tables (and matches the Excel cells)
    if (v instanceof Date) return new Date(v.getTime() + 3 * 3600_000).toISOString().slice(0, kind === "date" ? 10 : 16).replace("T", " ");
    return String(v);
  };

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/reports" user={u.name} kind="staff" wide>
      <PageTitle
        title={t("التقارير", "Reports")}
        sub={t("تقارير رسمية محسوبة مباشرة من سجلات النظام، تُصدَّر إلى Excel أو PDF بهوية الميدان. كل تصدير يُسجَّل في سجل العمليات.", "Official reports computed directly from system records, exported to Excel or branded PDF. Every export is logged.")}
      />

      {/* report picker */}
      <nav aria-label={t("نوع التقرير", "Report type")} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {REPORTS.map((x) => {
          const on = x.id === id;
          return (
            <Link key={x.id} href={`/staff/reports?${qs({ r: x.id })}`} aria-current={on ? "page" : undefined}
              className={`group flex min-h-24 flex-col gap-2 rounded-2xl border p-3 transition ${on ? "border-brand bg-gradient-to-b from-brand to-brand-deep text-white shadow-[0_14px_30px_-18px_rgba(118,59,48,.9)]" : "border-line bg-white hover:border-gold"}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${on ? "bg-white/15 text-gold-soft" : "bg-cream text-brand"}`}><Icon name={x.icon as IconName} size={18} /></span>
              <span className="text-sm font-bold leading-snug">{t(x.ar, x.en)}</span>
            </Link>
          );
        })}
      </nav>

      {/* filters */}
      <form method="get" className="mt-4 rounded-2xl border border-line bg-white p-4">
        <input type="hidden" name="r" value={id} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-soft">{t("من تاريخ", "From")}</label>
            <input id="from" name="from" type="date" dir="ltr" defaultValue={f.from} max={iso(today)} className="min-h-11 rounded-lg border border-line px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-soft">{t("إلى تاريخ", "To")}</label>
            <input id="to" name="to" type="date" dir="ltr" defaultValue={f.to} max={iso(today)} className="min-h-11 rounded-lg border border-line px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="zone" className="mb-1 block text-xs font-medium text-ink-soft">{t("المنطقة", "Zone")}</label>
            <select id="zone" name="zone" defaultValue={f.zone ?? ""} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm">
              <option value="">{t("كل المناطق", "All zones")}</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{t(z.name_ar, z.name_en)}</option>)}
            </select>
          </div>
          {usesGate && (
            <div>
              <label htmlFor="gate" className="mb-1 block text-xs font-medium text-ink-soft">{t("البوابة", "Gate")}</label>
              <select id="gate" name="gate" defaultValue={f.gate ?? ""} className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm">
                <option value="">{t("كل البوابات", "All gates")}</option>
                {gates.map((g) => <option key={g.id} value={g.id}>{t(g.name_ar, g.name_en)}</option>)}
              </select>
            </div>
          )}
          <button className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white hover:bg-brand">{t("عرض التقرير", "Show report")}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map(([ar, en, a, b]) => {
            const on = f.from === a && f.to === b;
            return (
              <Link key={ar} href={`/staff/reports?${qs({ from: a, to: b })}`} aria-current={on ? "true" : undefined}
                className={`min-h-9 content-center rounded-full border px-3.5 text-xs font-semibold transition ${on ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-gold"}`}>
                {t(ar, en)}
              </Link>
            );
          })}
        </div>
      </form>

      {/* result */}
      <Card
        className="mt-4"
        title={<span>{r.title}</span>}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/reports/${id}?${qs()}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1d6f42] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110">
              <Icon name="download" size={16} /> {t("تصدير Excel", "Export Excel")}
            </a>
            <a href={`/staff/reports/print?${qs()}`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-brand to-brand-deep px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110">
              <Icon name="doc" size={16} /> {t("PDF رسمي", "Official PDF")}
            </a>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">{r.subtitle}</p>
        <p className="mt-1 text-xs text-ink-soft">{r.filtersText}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {r.summary.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-paper p-3">
              <p className="text-xs text-ink-soft">{s.label}</p>
              <p className="num mt-1 font-display text-2xl font-bold text-brand">{s.value}</p>
              {s.note && <p className="mt-0.5 truncate text-xs text-ink-soft" title={s.note}>{s.note}</p>}
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-brand-deep text-white">
              <tr>{r.cols.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {r.rows.length === 0 && (
                <tr><td colSpan={r.cols.length} className="px-3 py-8 text-center text-ink-soft">{t("لا توجد بيانات ضمن الفترة والتصفية المحددة", "No data for the selected period and filters")}</td></tr>
              )}
              {r.rows.slice(0, PREVIEW).map((row, i) => (
                <tr key={i} className="border-t border-line odd:bg-white even:bg-paper/60">
                  {row.map((v, j) => {
                    const k = r.cols[j].kind;
                    const numeric = typeof v === "number" || k === "num" || k === "hours";
                    return <td key={j} className={`px-3 py-2 align-top ${numeric ? "num whitespace-nowrap text-center" : v instanceof Date ? "num whitespace-nowrap" : ""} ${id === "kpi" && j === 1 ? "font-bold text-brand" : ""}`}>{fmt(v, k)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.rows.length > PREVIEW && (
          <p className="mt-2 text-xs text-ink-soft">{t(`المعروض أول ${PREVIEW} سجل من ${r.rows.length}. التصدير يشمل كل السجلات.`, `Showing the first ${PREVIEW} of ${r.rows.length}. Exports include all records.`)}</p>
        )}
        <p className="mt-3 text-xs text-ink-soft">{t("لحماية البيانات: لا تُدرج أرقام الهوية في التقارير، وتظهر أرقام الجوال مخفية جزئيًا.", "Data protection: ID numbers are excluded and phone numbers are partially masked.")}</p>
      </Card>
    </Shell>
  );
}
