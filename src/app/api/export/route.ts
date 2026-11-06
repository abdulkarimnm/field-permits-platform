import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { searchRequests } from "@/lib/search";
import { audit } from "@/lib/audit";
import { liveStatus } from "@/lib/permits";
import { can } from "@/lib/rbac";

const cell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // CSV formula injection guard
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const u = await getStaff();
  if (!u || !can(u, "request.view")) return new NextResponse("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const rows = await searchRequests(sp, 10000);
  const head = ["ref", "kind", "request_status", "permit_number", "permit_status", "version", "organization", "rep_phone", "valid_from", "valid_to", "people", "vehicles", "lane", "risk", "submitted_at"];
  const lines = rows.map((r) =>
    [r.ref, r.kind, r.status, r.permit_number, r.permit_status ? liveStatus({ status: r.permit_status as never, valid_from: r.valid_from, valid_to: r.valid_to }) : "", r.permit_version, r.org_name, r.rep_phone, r.valid_from, r.valid_to, r.people_n, r.vehicles_n, r.lane, r.risk_score, r.submitted_at]
      .map(cell)
      .join(","),
  );
  await audit(`user:${u.id}`, "export.csv", null, null, { filters: sp, rows: rows.length });
  return new NextResponse("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="permits-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
