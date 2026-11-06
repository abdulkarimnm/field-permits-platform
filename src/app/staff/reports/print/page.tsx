import Image from "next/image";
import { requireCap } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { i18n } from "@/lib/i18n";
import { fingerprint, isReportId, parseFilters, REPORTS, runReport, type Cell } from "@/lib/reports";
import SystemSeal from "@/components/SystemSeal";
import PrintButton, { BackButton } from "@/app/permit/[id]/PrintButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const meta = REPORTS.find((x) => x.id === sp.r) ?? REPORTS[0];
  const f = parseFilters(sp);
  // the browser uses the page title as the PDF file name
  return { title: `${meta.ar} ${f.from} – ${f.to}` };
}

export default async function ReportPrint({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireCap("reports.export");
  const sp = await searchParams;
  const { t, lang } = await i18n();
  const id = isReportId(sp.r ?? "") ? (sp.r as (typeof REPORTS)[number]["id"]) : "kpi";
  const f = parseFilters(sp);
  const r = await runReport(id, f, lang);
  const ref = `RPT-${new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  const fp = fingerprint(r, f);
  await audit(`user:${u.id}`, "report.export_pdf", "report", id, { filters: f, rows: r.rows.length, ref, fingerprint: fp });

  const dt = (d: Date, withTime = true) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" } : { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(d);
  const hijri = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-u-ca-islamic-umalqura", { dateStyle: "long", timeZone: "Asia/Riyadh" }).format(r.generatedAt);
  const fmt = (v: Cell, kind: string) =>
    v == null || v === "" ? "—" : v instanceof Date ? new Date(v.getTime() + 3 * 3600_000).toISOString().slice(0, kind === "date" ? 10 : 16).replace("T", " ") : String(v);
  const dense = r.cols.length > 10;
  const confidential = t("سري — للاستخدام الرسمي", "Confidential — official use");

  return (
    <div className="force-light min-h-dvh bg-mist py-6 print:bg-white print:py-0" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      {/* landscape A4 with running footer & page numbers (Chrome @page margin boxes) */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm 10mm 14mm 10mm;
            @bottom-center { content: "${t("صفحة", "Page")} " counter(page) " / " counter(pages); font: 9px "IBM Plex Sans Arabic", sans-serif; color: #6e5a53; }
            @bottom-left { content: "${ref}"; font: 9px "IBM Plex Sans Arabic", sans-serif; color: #6e5a53; }
            @bottom-right { content: "${confidential}"; font: 9px "IBM Plex Sans Arabic", sans-serif; color: #763b30; }
          }
          .rpt-sheet { width: auto !important; box-shadow: none !important; padding: 0 !important; }
          .rpt-table thead { display: table-header-group; }
          .rpt-table tr { break-inside: avoid; }
          .rpt-sign { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-between gap-2 px-4">
        <BackButton />
        <PrintButton />
      </div>

      <article className="rpt-sheet mx-auto w-[297mm] max-w-full bg-white px-[12mm] py-[10mm] shadow-sm">
        {/* masthead */}
        <header className="flex items-center justify-between gap-6 border-b-[3px] border-brand pb-3">
          <div className="flex items-center gap-4">
            <Image src="/brand/logo.png" alt={t("سيد الشهداء", "Sayyid Alshuhada")} width={220} height={52} className="h-12 w-auto" priority />
            <div className="border-s border-rose-soft ps-4">
              <p className="text-[12px] font-bold text-brand">{t("إدارة ميدان سيد الشهداء", "Sayyid Alshuhada Field Administration")}</p>
              <p className="text-[10px] text-ink-soft">{t("منصة تصاريح دخول الميدان", "Field Entry Permits Platform")}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-[10px] font-semibold tracking-wide text-ink-soft">{t("تقرير رسمي", "OFFICIAL REPORT")}</p>
            <h1 className="font-display text-[22px] font-bold leading-tight text-brand">{r.title}</h1>
          </div>
        </header>

        {/* meta strip */}
        <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-lg border border-rose-soft text-center">
          {[
            [t("رقم التقرير", "Report no."), <span key="r" className="num">{ref}</span>],
            [t("الفترة", "Period"), <span key="p" className="num">{f.from} — {f.to}</span>],
            [t("تاريخ الإعداد", "Generated"), <span key="g">{dt(r.generatedAt)}<span className="block text-[9px] font-medium text-ink-soft">{hijri}</span></span>],
            [t("أعدّه", "Prepared by"), u.name],
          ].map(([k, v], i) => (
            <div key={i} className={`bg-cream/60 px-2 py-2 ${i ? "border-s border-rose-soft" : ""}`}>
              <p className="text-[9.5px] text-ink-soft">{k}</p>
              <p className="mt-0.5 text-[12px] font-bold text-brand">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-ink-soft">{r.subtitle} <span className="text-ink">· {r.filtersText}</span></p>

        {/* summary */}
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${r.summary.length}, minmax(0,1fr))` }}>
          {r.summary.map((s) => (
            <div key={s.label} className="rounded-lg border border-rose-soft px-3 py-2">
              <p className="text-[9.5px] text-ink-soft">{s.label}</p>
              <p className="num font-display text-[20px] font-bold leading-tight text-brand">{s.value}</p>
              {s.note && <p className="truncate text-[9px] text-ink-soft">{s.note}</p>}
            </div>
          ))}
        </div>

        {/* table */}
        <table className={`rpt-table mt-4 w-full border-collapse ${dense ? "text-[8.5px]" : "text-[10px]"}`}>
          <thead>
            <tr className="bg-brand-deep text-white">
              <th className="w-6 px-1.5 py-1.5 text-center font-semibold">#</th>
              {r.cols.map((c) => <th key={c.key} className="px-1.5 py-1.5 text-start font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {r.rows.length === 0 && <tr><td colSpan={r.cols.length + 1} className="py-6 text-center text-ink-soft">{t("لا توجد بيانات ضمن الفترة والتصفية المحددة", "No data for the selected period and filters")}</td></tr>}
            {r.rows.map((row, i) => (
              <tr key={i} className="border-b border-rose-soft/70 even:bg-[#fbf7f4]">
                <td className="num px-1.5 py-1 text-center text-ink-soft">{i + 1}</td>
                {row.map((v, j) => {
                  const k = r.cols[j].kind;
                  const numeric = typeof v === "number" || k === "num" || k === "hours";
                  return <td key={j} className={`px-1.5 py-1 align-top text-ink ${numeric ? "num text-center" : v instanceof Date ? "num whitespace-nowrap" : ""} ${id === "kpi" && j === 1 ? "font-bold text-brand" : ""}`}>{fmt(v, k)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* closing & sign-off */}
        <p className="mt-3 text-[9.5px] text-ink-soft">
          {t(`عدد السجلات: ${r.rows.length}. جميع الأرقام محسوبة مباشرة من سجلات النظام دون إدخال يدوي، وسجل العمليات محمي بسلسلة تجزئة. لا تُدرج أرقام الهوية، وتظهر أرقام الجوال مخفية جزئيًا.`,
            `Records: ${r.rows.length}. All figures are computed directly from system records; the audit log is hash-chained. ID numbers are excluded and phones partially masked.`)}
        </p>
        {/* automatic system seal (no hand signatures) */}
        <div className="rpt-sign mt-6 flex items-center gap-6 rounded-xl border border-rose-soft bg-cream/40 p-4">
          <SystemSeal date={new Date(r.generatedAt.getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} code={ref} size={132} lang={lang} />
          <div className="min-w-0 flex-1 text-[10.5px] leading-relaxed">
            <p className="text-[12px] font-bold text-brand">{t("اعتماد آلي من النظام", "Automatic system certification")}</p>
            <p className="mt-1 text-ink">{t("صدر هذا التقرير آليًا من سجلات منصة تصاريح دخول الميدان مباشرة دون أي تدخل يدوي في الأرقام، ولا يحتاج إلى توقيع.", "This report was generated automatically from the platform's records with no manual input, and needs no signature.")}</p>
            <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1">
              <div><dt className="text-ink-soft">{t("رقم التقرير", "Report no.")}</dt><dd className="num font-bold text-ink">{ref}</dd></div>
              <div><dt className="text-ink-soft">{t("بصمة المحتوى (SHA-256)", "Content fingerprint (SHA-256)")}</dt><dd className="num font-bold text-ink">{fp}</dd></div>
              <div><dt className="text-ink-soft">{t("طُلب بواسطة", "Requested by")}</dt><dd className="font-bold text-ink">{u.name}</dd></div>
            </dl>
            <p className="mt-2 text-[9.5px] text-ink-soft">{t("للتحقق من صحة التقرير: طابق رقم التقرير والبصمة مع قيد «تصدير تقرير» في سجل العمليات المحمي بسلسلة تجزئة.", "To verify: match the report number and fingerprint with the export entry in the hash-chained audit log.")}</p>
          </div>
        </div>
      </article>
    </div>
  );
}
