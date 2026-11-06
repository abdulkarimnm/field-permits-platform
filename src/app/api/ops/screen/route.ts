import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth";
import { screenData } from "@/lib/screen";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Live feed for the operations wall screen (polled every few seconds). Read-only. */
export async function GET() {
  const u = await getStaff();
  if (!u || !can(u, "ops.view")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await screenData(), { headers: { "Cache-Control": "no-store" } });
}
