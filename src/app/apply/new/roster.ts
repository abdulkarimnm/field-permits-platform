"use server";
import ExcelJS from "exceljs";
import { requireApplicant } from "@/lib/auth";

export type RosterFileResult = { ok: true; rows: string[][]; sheet?: string } | { ok: false; ar: string; en: string };

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 300;
const MAX_COLS = 12;

/** Reads the first non-empty sheet of an .xlsx (or a .csv) into plain text rows. Nothing is stored. */
export async function readRosterFile(fd: FormData): Promise<RosterFileResult> {
  await requireApplicant();
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, ar: "اختر ملفًا أولًا", en: "Choose a file first" };
  if (f.size > MAX_BYTES) return { ok: false, ar: "حجم الملف أكبر من 2MB", en: "File is larger than 2MB" };
  const name = f.name.toLowerCase();
  const buf = Buffer.from(await f.arrayBuffer());

  if (name.endsWith(".xls") && !name.endsWith(".xlsx"))
    return { ok: false, ar: "صيغة xls القديمة غير مدعومة — احفظ الملف من Excel بصيغة xlsx", en: "Old .xls is not supported — save it as .xlsx" };

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    let text = new TextDecoder("utf-8").decode(buf);
    // Excel on Arabic Windows saves CSV as windows-1256
    if (text.includes("�")) text = new TextDecoder("windows-1256").decode(buf);
    const rows = text
      .replace(/^﻿/, "")
      .split(/\r?\n/)
      .slice(0, MAX_ROWS)
      .map((l) => l.split(/\t|,|؛|;/).slice(0, MAX_COLS).map((c) => c.replace(/^"|"$/g, "").trim()))
      .filter((r) => r.some(Boolean));
    return rows.length ? { ok: true, rows } : { ok: false, ar: "الملف فارغ", en: "The file is empty" };
  }

  // .xlsx is a zip: check the signature before handing it to the parser
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { ok: false, ar: "الملف ليس ملف Excel صالحًا (xlsx أو csv)", en: "Not a valid Excel file (xlsx or csv)" };
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    for (const ws of wb.worksheets) {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= MAX_ROWS) return;
        const out: string[] = [];
        for (let c = 1; c <= Math.min(MAX_COLS, row.cellCount || MAX_COLS); c++) {
          const cell = row.getCell(c);
          const v = cell.value;
          // ID numbers typed as numbers must not turn into 1.11E+09
          const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : (cell.text ?? "");
          out.push(String(s).trim());
        }
        if (out.some(Boolean)) rows.push(out);
      });
      if (rows.length) return { ok: true, rows, sheet: ws.name };
    }
    return { ok: false, ar: "لم أجد بيانات في الملف", en: "No data found in the file" };
  } catch {
    return { ok: false, ar: "تعذّرت قراءة الملف — تأكد أنه ملف Excel سليم وغير محمي بكلمة مرور", en: "Could not read the file — make sure it's a valid, unprotected Excel file" };
  }
}
