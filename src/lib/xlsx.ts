import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Lang, ReportResult } from "./reports";

/* Official workbook: brand header + logo, report meta, summary, styled table
   (frozen header, filters, zebra rows, proper number/date formats), RTL for Arabic,
   A4 landscape print setup with header/footer. */

const BRAND = "FF763B30";
const BRAND_DEEP = "FF5A2B23";
const CREAM = "FFFFF4EA";
const ROSE = "FFEADFD8";
const INK = "FF3D2A24";
const FONT = "Arial";

const riyadh = (d: Date) => new Date(d.getTime() + 3 * 3600_000); // Excel dates carry no zone: store Riyadh wall-clock

export async function reportWorkbook(r: ReportResult, lang: Lang, meta: { by: string; ref: string; fingerprint: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const wb = new ExcelJS.Workbook();
  wb.creator = t("منصة تصاريح دخول الميدان", "Field Entry Permits Platform");
  wb.company = t("إدارة ميدان سيد الشهداء", "Sayyid Alshuhada Field Administration");
  wb.title = r.title;
  wb.subject = r.filtersText;
  wb.created = r.generatedAt;

  const n = Math.max(r.cols.length, 4);
  const ws = wb.addWorksheet(r.title.slice(0, 31), {
    views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.25, footer: 0.25 }, printTitlesRow: "7:7" },
    headerFooter: {
      oddHeader: `&L&8${t("سري — للاستخدام الرسمي", "Confidential — official use")}&R&8${meta.ref}`,
      oddFooter: `&L&8${t("صادر آليًا من سجلات النظام", "System-generated from records")}&C&8${t("صفحة", "Page")} &P / &N&R&8${r.generatedAt.toISOString().slice(0, 10)}`,
    },
  });
  ws.properties.defaultRowHeight = 20;
  r.cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  for (let i = r.cols.length + 1; i <= n; i++) ws.getColumn(i).width = 14;

  const merge = (row: number) => ws.mergeCells(row, 1, row, n);
  const align = { horizontal: lang === "ar" ? "right" : "left", vertical: "middle", wrapText: true, readingOrder: lang === "ar" ? "rtl" : "ltr" } as const;

  /* 1 — brand bar */
  merge(1);
  const h1 = ws.getCell(1, 1);
  h1.value = t("منصة تصاريح دخول الميدان — إدارة ميدان سيد الشهداء", "Field Entry Permits Platform — Sayyid Alshuhada Field Administration");
  h1.font = { name: FONT, size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  h1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  h1.alignment = { ...align, horizontal: "center" };
  ws.getRow(1).height = 40;

  /* 2 — report title */
  merge(2);
  const h2 = ws.getCell(2, 1);
  h2.value = r.title;
  h2.font = { name: FONT, size: 14, bold: true, color: { argb: BRAND_DEEP } };
  h2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
  h2.alignment = { ...align, horizontal: "center" };
  ws.getRow(2).height = 28;

  /* 3 — description · 4 — meta */
  merge(3);
  Object.assign(ws.getCell(3, 1), { value: r.subtitle, font: { name: FONT, size: 10, color: { argb: "FF6E5A53" } }, alignment: { ...align, horizontal: "center" } });
  ws.getRow(3).height = 22;
  merge(4);
  const fmtNow = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(r.generatedAt);
  Object.assign(ws.getCell(4, 1), {
    value: `${r.filtersText}   |   ${t("رقم التقرير", "Report no.")}: ${meta.ref}   |   ${t("أُعد بواسطة", "Prepared by")}: ${meta.by}   |   ${t("تاريخ الإعداد", "Generated")}: ${fmtNow}`,
    font: { name: FONT, size: 9, color: { argb: INK } }, alignment: { ...align, horizontal: "center" },
  });
  ws.getRow(4).height = 20;

  /* 5 — summary */
  merge(5);
  Object.assign(ws.getCell(5, 1), {
    value: r.summary.map((s) => `${s.label}: ${s.value}${s.note ? ` (${s.note})` : ""}`).join("     ◆     "),
    font: { name: FONT, size: 11, bold: true, color: { argb: BRAND } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } },
    alignment: { ...align, horizontal: "center" },
    border: { top: { style: "thin", color: { argb: ROSE } }, bottom: { style: "thin", color: { argb: ROSE } } },
  });
  ws.getRow(5).height = 26;
  ws.getRow(6).height = 8;

  /* logo on the brand bar */
  try {
    const logo = await readFile(path.join(process.cwd(), "public", "brand", "logo.png"));
    const id = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: "png" });
    ws.addImage(id, { tl: { col: lang === "ar" ? n - 1.6 : 0.1, row: 0.12 }, ext: { width: 128, height: 30 } });
  } catch {}

  /* 7 — table header */
  const head = ws.getRow(7);
  r.cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DEEP } };
    cell.alignment = { ...align, horizontal: "center" };
    cell.border = { left: { style: "thin", color: { argb: "FF8A5A50" } }, right: { style: "thin", color: { argb: "FF8A5A50" } } };
  });
  head.height = 30;

  /* data */
  r.rows.forEach((row, ri) => {
    const xr = ws.getRow(8 + ri);
    row.forEach((v, ci) => {
      const col = r.cols[ci];
      const cell = xr.getCell(ci + 1);
      if (v instanceof Date) {
        cell.value = riyadh(v);
        cell.numFmt = col.kind === "date" ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm";
      } else if (col.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        cell.value = new Date(`${v}T00:00:00Z`);
        cell.numFmt = "yyyy-mm-dd";
      } else cell.value = v == null ? "" : v;
      if (typeof v === "number") cell.numFmt = col.kind === "hours" ? "0.0" : "#,##0";
      const numeric = typeof v === "number" || v instanceof Date;
      cell.font = { name: FONT, size: 10, color: { argb: INK } };
      cell.alignment = { ...align, horizontal: numeric ? "center" : align.horizontal };
      cell.border = { bottom: { style: "hair", color: { argb: ROSE } } };
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF7F4" } };
    });
    xr.height = 20;
  });
  if (r.rows.length) ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + r.rows.length, column: r.cols.length } };
  else {
    ws.mergeCells(8, 1, 8, n);
    Object.assign(ws.getCell(8, 1), { value: t("لا توجد بيانات ضمن الفترة والتصفية المحددة", "No data for the selected period and filters"), font: { name: FONT, size: 10, italic: true, color: { argb: "FF6E5A53" } }, alignment: { ...align, horizontal: "center" } });
  }

  /* closing line */
  const end = 9 + Math.max(r.rows.length, 1);
  ws.mergeCells(end, 1, end, n);
  Object.assign(ws.getCell(end, 1), {
    value: t(`اعتماد آلي من النظام — صادر آليًا دون توقيع · رقم التقرير ${meta.ref} · بصمة المحتوى ${meta.fingerprint} · عدد السجلات ${r.rows.length}. الأرقام محسوبة مباشرة من سجلات النظام؛ أرقام الهوية لا تُدرج وأرقام الجوال مخفية جزئيًا.`, `Automatic system certification — issued without signature · Report ${meta.ref} · Fingerprint ${meta.fingerprint} · ${r.rows.length} records. Figures computed from system records; IDs excluded, phones masked.`),
    font: { name: FONT, size: 9, color: { argb: "FF6E5A53" } }, alignment: { ...align, horizontal: "center" },
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
