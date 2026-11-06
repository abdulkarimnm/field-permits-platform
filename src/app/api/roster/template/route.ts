import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getLang } from "@/lib/i18n";

/** Ready-to-fill Excel template for the people / vehicles lists (no data, safe to serve publicly). */
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") === "vehicles" ? "vehicles" : "people";
  const lang = await getLang();
  const ar = lang === "ar";
  const wb = new ExcelJS.Workbook();
  wb.creator = ar ? "منصة تصاريح دخول الميدان" : "Field Entry Permits Platform";
  const ws = wb.addWorksheet(kind === "people" ? (ar ? "الأفراد" : "People") : ar ? "المركبات" : "Vehicles", {
    views: [{ rightToLeft: ar, state: "frozen", ySplit: 1 }],
  });
  const head =
    kind === "people"
      ? [ar ? "الاسم" : "Name", ar ? "رقم الهوية / الإقامة" : "ID / Iqama number"]
      : [ar ? "رقم اللوحة" : "Plate number", ar ? "نوع المركبة" : "Vehicle type"];
  const sample =
    kind === "people"
      ? [[ar ? "خالد عبدالله" : "Khalid Abdullah", "1012345678"], [ar ? "سعد محمد" : "Saad Mohammed", "2098765432"]]
      : [["1234 ا ب ح", ar ? "ونيت" : "Pickup"], ["567 ر س ص", ar ? "شاحنة صغيرة" : "Small truck"]];
  ws.columns = [{ width: 30 }, { width: 26 }];
  const h = ws.addRow(head);
  h.height = 24;
  h.eachCell((c) => {
    c.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF763B30" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  // IDs and plates are text, so leading digits are kept exactly as typed
  ws.getColumn(kind === "people" ? 2 : 1).numFmt = "@";
  // examples live on their own sheet so they can never be imported by mistake
  const ex = wb.addWorksheet(ar ? "مثال" : "Example", { views: [{ rightToLeft: ar }] });
  ex.columns = [{ width: 30 }, { width: 26 }];
  ex.addRow(head).eachCell((c) => (c.font = { name: "Arial", bold: true }));
  for (const r of sample) ex.addRow(r);
  ex.addRow([]);
  ex.addRow([ar ? "اكتب بياناتك في الورقة الأولى، سطر لكل " + (kind === "people" ? "فرد" : "مركبة") + ". الحد الأقصى " + (kind === "people" ? "100" : "50") + "." : "Fill the first sheet, one row each."]).getCell(1).font = { name: "Arial", size: 10, color: { argb: "FF9A6400" } };
  const buf = await wb.xlsx.writeBuffer();
  const file = kind === "people" ? "people-template.xlsx" : "vehicles-template.xlsx";
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
