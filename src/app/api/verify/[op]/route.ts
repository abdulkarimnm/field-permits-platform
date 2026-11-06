import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { sameOrigin } from "@/lib/access";
import { buildSnapshot, lookup, recordDecision, recordExit, repOtpSend, repOtpVerify, revealId, syncOffline, undoExit } from "@/lib/verify";
import { can } from "@/lib/rbac";

const ERR = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(_: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  const u = await getStaff();
  if (!u || !can(u, "verify.scan")) return ERR("unauthorized", 401);
  const { op } = await params;
  if (op === "snapshot") return NextResponse.json(await buildSnapshot(u), { headers: { "Cache-Control": "no-store" } });
  return ERR("not_found", 404);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  if (!(await sameOrigin())) return ERR("bad_origin", 403);
  const u = await getStaff();
  if (!u || !can(u, "verify.scan")) return ERR("unauthorized", 401);
  const { op } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    switch (op) {
      case "lookup":
        return NextResponse.json(await lookup(u, String(body.payload ?? "").slice(0, 600), Number(body.gateId)));
      case "decision":
        await recordDecision(u, Number(body.checkId), {
          decision: body.decision === "allowed" ? "allowed" : "denied",
          matched: {
            people: Array.isArray(body.matched?.people) ? body.matched.people.map(Number) : [],
            vehicles: Array.isArray(body.matched?.vehicles) ? body.matched.vehicles.map(Number) : [],
            equipment: Array.isArray(body.matched?.equipment) ? body.matched.equipment.map(Number) : [],
          },
          denyReason: body.denyReason ? String(body.denyReason).slice(0, 300) : undefined,
        });
        return NextResponse.json({ ok: true });
      case "exit":
        return NextResponse.json(await recordExit(u, String(body.payload ?? "").slice(0, 600), Number(body.gateId)));
      case "exit-undo":
        await undoExit(u, Number(body.checkId));
        return NextResponse.json({ ok: true });
      case "reveal":
        return NextResponse.json({ id: await revealId(u, Number(body.checkId), Number(body.index)) });
      case "otp-send":
        return NextResponse.json(await repOtpSend(u, Number(body.checkId)));
      case "otp-check":
        return NextResponse.json(await repOtpVerify(u, Number(body.checkId), String(body.code ?? "")));
      case "sync":
        return NextResponse.json({ stored: await syncOffline(u, Array.isArray(body.items) ? body.items : []) });
    }
  } catch (e) {
    return ERR(e instanceof Error ? e.message : "failed");
  }
  return ERR("not_found", 404);
}
