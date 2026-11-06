import { NextResponse, type NextRequest } from "next/server";
import { getApplicant, getStaff } from "@/lib/auth";
import { capacityGrid } from "@/lib/permits";

export async function GET(req: NextRequest) {
  if (!(await getApplicant()) && !(await getStaff())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const zones = (sp.get("zones") ?? "").split(",").map(Number).filter((n) => n > 0);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("from") ?? "") ? sp.get("from")! : new Date().toISOString().slice(0, 10);
  const days = Math.min(14, Math.max(1, Number(sp.get("days") ?? 7)));
  const exclude = Number(sp.get("exclude")) || undefined;
  return NextResponse.json(await capacityGrid(zones, from, days, exclude));
}
