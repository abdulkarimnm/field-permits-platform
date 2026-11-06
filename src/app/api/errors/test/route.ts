import { NextResponse } from "next/server";
import { getStaff } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Demo only: throws on purpose so the admin can watch the error pipeline record it. */
export async function GET() {
  const u = await getStaff();
  if (!u || !can(u, "errors.view") || !(await getSetting("demo_mode"))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  throw new Error("Test error: intentional failure to verify the technical error log (demo)");
}
