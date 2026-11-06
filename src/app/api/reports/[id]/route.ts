import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getLang } from "@/lib/i18n";
import { fingerprint, isReportId, parseFilters, runReport } from "@/lib/reports";
import { reportWorkbook } from "@/lib/xlsx";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Excel export of a report (same definition as the screen preview and the PDF). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getStaff();
  if (!u || !can(u, "reports.export")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!isReportId(id)) return new NextResponse("Not found", { status: 404 });
  const lang = await getLang();
  const f = parseFilters(Object.fromEntries(req.nextUrl.searchParams));
  const r = await runReport(id, f, lang);
  const ref = `RPT-${new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  const fp = fingerprint(r, f);
  const buf = await reportWorkbook(r, lang, { by: u.name, ref, fingerprint: fp });
  await audit(`user:${u.id}`, "report.export_xlsx", "report", id, { filters: f, rows: r.rows.length, ref, fingerprint: fp });
  const name = `${r.title} ${f.from}_${f.to}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report-${id}-${f.from}_${f.to}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
