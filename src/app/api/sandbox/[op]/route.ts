import { NextResponse, type NextRequest } from "next/server";
import { q } from "@/lib/db";
import { sameOrigin } from "@/lib/access";
import { getApplicant, getStaff, logout, startApplicantSession, startDemoStaffSession } from "@/lib/auth";
import { demoOn, ensureSbx, gateCodes, getSbx, markSeeded, missions, ROLE_HOME, seedScenario, staffByRole, type SbxRole } from "@/lib/sandbox";

/** Roles lab API — refuses everything outside demo mode. */
const err = (e: string, s = 400) => NextResponse.json({ error: e }, { status: s });
const ROLES: SbxRole[] = ["applicant", "reviewer", "approver", "supervisor", "verifier", "opsmanager", "admin"];

async function currentRole(): Promise<SbxRole | null> {
  const s = await getStaff();
  if (s) {
    const r = s.roles[0] as SbxRole;
    return ROLES.includes(r) ? r : null;
  }
  return (await getApplicant()) ? "applicant" : null;
}

async function state() {
  const sbx = await getSbx();
  if (!sbx) return { active: false as const };
  const [ms, codes, sms, seeded] = await Promise.all([
    missions(sbx),
    gateCodes(sbx),
    q<{ id: number; body: string; created_at: Date }>(`SELECT id, body, created_at FROM outbox WHERE target=$1 ORDER BY id DESC LIMIT 12`, [sbx.contact]),
    q<{ n: number }>(`SELECT count(*)::int n FROM requests WHERE contact=$1`, [sbx.contact]),
  ]);
  return { active: true as const, contact: sbx.contact, role: await currentRole(), missions: ms, codes, sms: sms.map((m) => ({ id: m.id, body: m.body, at: new Date(m.created_at).toISOString() })), seeded: seeded[0].n > 0 };
}

export async function GET() {
  if (!(await demoOn())) return err("demo_disabled", 403);
  return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  if (!(await demoOn())) return err("demo_disabled", 403);
  if (!(await sameOrigin())) return err("bad_origin", 403);
  const { op } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    if (op === "begin") {
      await ensureSbx();
      return NextResponse.json(await state());
    }
    if (op === "as") {
      const role = body.role as SbxRole;
      if (!ROLES.includes(role)) return err("bad_role");
      const sbx = await ensureSbx();
      if (role === "applicant") {
        await logout("staff"); // one active role at a time
        await startApplicantSession(sbx.contact);
      }
      else await startDemoStaffSession((await staffByRole(role)).id);
      return NextResponse.json({ href: ROLE_HOME[role] });
    }
    if (op === "seed") {
      const sbx = await ensureSbx();
      const made = await seedScenario(sbx);
      await markSeeded(sbx);
      return NextResponse.json({ made });
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "failed", 500);
  }
  return err("unknown", 404);
}
