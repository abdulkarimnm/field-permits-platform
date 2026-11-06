import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { getApplicant, getStaff } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { audit } from "@/lib/audit";
import { STORAGE_DIR } from "@/lib/files";
import { can } from "@/lib/rbac";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await q1<{ id: number; stored_name: string; original_name: string; mime: string; request_id: number; contact: string }>(
    `SELECT a.*, r.contact FROM attachments a JOIN requests r ON r.id=a.request_id WHERE a.id=$1`,
    [Number(id)],
  );
  if (!a) return new NextResponse("Not found", { status: 404 });
  const staff = await getStaff();
  const applicant = await getApplicant();
  // Field verifiers never see attachments.
  const allowed = (staff && can(staff, "request.attachments")) || applicant === a.contact;
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  await audit(staff ? `user:${staff.id}` : `applicant:${applicant}`, "attachment.viewed", "attachment", a.id, { request: a.request_id });
  const buf = await fs.readFile(path.join(STORAGE_DIR, path.basename(a.stored_name)));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.original_name)}`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
