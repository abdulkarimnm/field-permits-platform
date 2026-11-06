import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomInt } from "node:crypto";
import { q, q1 } from "@/lib/db";
import { getSetting, listZones } from "@/lib/settings";
import { sameOrigin } from "@/lib/access";
import { startApplicantSession, startDemoStaffSession, type StaffUser } from "@/lib/auth";
import { decide, getPermit, submitRequest, type RequestInput, type RequestRow } from "@/lib/permits";
import { lookup, recordDecision, repOtpSend, repOtpVerify } from "@/lib/verify";
import { verifyChain } from "@/lib/audit";
import { ROT_WINDOW } from "@/lib/crypto";

/**
 * "Live the experience" simulation engine.
 * Every step runs the REAL backend (requests, two-stage approval, issuance, gate checks, audit chain)
 * using the seeded demo accounts. Disabled automatically when demo mode is off.
 */

const DEMO = "vp_demo";
const err = (e: string, s = 400) => NextResponse.json({ error: e }, { status: s });

async function staff(role: string): Promise<StaffUser> {
  const u = await q1<StaffUser>(`SELECT id,username,name,roles,agency FROM users WHERE $1 = ANY(roles) AND active ORDER BY id LIMIT 1`, [role]);
  if (!u) throw new Error(`no_${role}`);
  return u;
}

async function outbox(contact: string, since: number) {
  return q<{ id: number; body: string; created_at: Date }>(`SELECT id, body, created_at FROM outbox WHERE target=$1 AND id > $2 ORDER BY id`, [contact, since]);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ step: string }> }) {
  if (!(await getSetting("demo_mode"))) return err("demo_disabled", 403);
  if (!(await sameOrigin())) return err("bad_origin", 403);
  const { step } = await params;
  const body = await req.json().catch(() => ({}));
  const jar = await cookies();
  const contact = jar.get(DEMO)?.value ?? null;
  const since = Number(body.since) || 0;

  try {
    if (step === "start") {
      const c = `059${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
      jar.set(DEMO, c, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 2 * 3600, secure: process.env.NODE_ENV === "production" });
      await startApplicantSession(c);
      const last = (await q1<{ id: number }>(`SELECT coalesce(max(id),0)::int id FROM outbox`))!.id;
      const zones = await listZones();
      return NextResponse.json({ contact: c, since: last, zone: zones[0] });
    }
    if (!contact) return err("no_demo");

    if (step === "submit") {
      const now = Date.now();
      const riyadh = new Date(now + 3 * 3600_000);
      let hour = riyadh.getUTCHours() + 1;
      let date = riyadh.toISOString().slice(0, 10);
      if (hour > 21) {
        hour = 8;
        date = new Date(now + 27 * 3600_000).toISOString().slice(0, 10);
      }
      if (hour < 6) hour = 6;
      const zones = await listZones();
      const r: RequestInput = {
        org_name: "شركة النخبة لتنظيم الفعاليات",
        cr_number: "4030" + String(randomInt(100000, 999999)),
        rep_name: "فيصل عبدالرحمن العتيبي",
        rep_phone: contact,
        rep_id: "10" + String(randomInt(10000000, 99999999)),
        purpose: "تجهيز منصة الاستقبال وتركيب الإضاءة واللوحات الإرشادية لفعالية الزوار في الساحة الرئيسية",
        valid_from: new Date(now - 10 * 60_000).toISOString(),
        valid_to: new Date(now + 3 * 86400_000).toISOString(),
        zones: [zones[0].id],
        slot_date: date,
        slot_hour: hour,
        people: [
          ["فيصل عبدالرحمن العتيبي", "1"],
          ["نواف سعد القحطاني", "1"],
          ["عبدالعزيز خالد الشهري", "1"],
          ["ماجد علي الزهراني", "2"],
          ["تركي فهد الدوسري", "1"],
          ["سلطان ناصر المطيري", "2"],
        ].map(([name, p]) => ({ name, id_number: p + String(randomInt(100000000, 999999999)) })),
        vehicles: [
          { plate: `ر ك ن ${randomInt(1000, 9999)}`, type: "شاحنة نقل خفيفة" },
          { plate: `س ع د ${randomInt(1000, 9999)}`, type: "مركبة خدمات" },
        ],
        equipment: [
          { name: "رافعة مقصية", qty: 1 },
          { name: "وحدات إضاءة", qty: 12 },
        ],
        declaration: true,
      };
      const { id, ref } = await submitRequest(contact, r);
      const row = (await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1`, [id]))!;
      return NextResponse.json({ id, ref, request: r, risk: { score: row.risk_score, lane: row.lane, flags: row.risk_flags }, sms: await outbox(contact, since) });
    }

    const id = Number(body.id);
    const owned = await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND contact=$2`, [id, contact]);
    if (!owned) return err("not_owned");

    if (step === "stage1") {
      const u = await staff("reviewer");
      await decide(u, id, "approve", "البيانات مكتملة والمرفقات مطابقة");
      await startDemoStaffSession(u.id);
      return NextResponse.json({ by: u.name, sms: await outbox(contact, since) });
    }

    if (step === "stage2") {
      const reviewer = await staff("reviewer");
      const u = await staff("approver");
      // Separation of duties, shown live: the reviewer is refused at stage 2.
      let sodBlocked = false;
      try {
        await decide(reviewer, id, "approve");
      } catch (e) {
        sodBlocked = e instanceof Error && (e.message === "same_person" || e.message === "not_assigned");
      }
      const res = await decide(u, id, "approve");
      await startDemoStaffSession(u.id);
      const p = "permit" in res && res.permit ? res.permit : null;
      return NextResponse.json({
        by: u.name,
        sodBlocked,
        permit: p && { id: p.id, number: p.number, version: p.version, rotSecret: p.rot_secret, validTo: p.valid_to },
        sms: await outbox(contact, since),
      });
    }

    const permit = owned.permit_id ? await getPermit(owned.permit_id) : undefined;
    if (!permit) return err("no_permit");

    if (step === "scan") {
      const v = await staff("verifier");
      const gateId = (await q1<{ id: number }>(`SELECT id FROM gates WHERE $1 = ANY(zone_ids) ORDER BY id LIMIT 1`, [permit.zones[0]]))?.id ?? 1;
      const result = await lookup(v, String(body.payload ?? "").slice(0, 300), gateId);
      await startDemoStaffSession(v.id);
      const gate = await q1<{ name_ar: string; name_en: string }>(`SELECT name_ar,name_en FROM gates WHERE id=$1`, [gateId]);
      return NextResponse.json({ result, gate, verifier: { name: v.name, agency: v.agency } });
    }

    if (step === "stale") {
      // Replay a code from 5 minutes ago (what a screenshot would contain) and a fake QR from a look-alike site.
      const v = await staff("verifier");
      const old = Math.floor(Date.now() / 1000 / ROT_WINDOW) - 10;
      const { rotatingCode } = await import("@/lib/crypto");
      const stale = await lookup(v, `SSH1:R:${permit.number}:${old}:${rotatingCode(permit.rot_secret, permit.number, old)}`, 1);
      const fake = await lookup(v, "https://permits-ssh.example.com/v/Fq9xQ2mZr8LkP0aT7vWbN3yJc6HdS1eUoG4iK5lRtYw", 1);
      return NextResponse.json({ stale, fake });
    }

    if (step === "summary") {
      const sup = await staff("supervisor");
      await startDemoStaffSession(sup.id);
      const chain = await verifyChain();
      const trail = await q<{ id: number; at: string; action: string; hash: string }>(
        `SELECT id, at, action, hash FROM audit
         WHERE (entity='request' AND entity_id=$1) OR (entity='permit' AND entity_id=$2) OR (entity='check' AND entity_id IN (SELECT id::text FROM checks WHERE permit_id=$3))
         ORDER BY id`,
        [String(id), String(permit.id), permit.id],
      );
      const today = (await q1<{ checks: number; allowed: number; valid: number }>(
        `SELECT (SELECT count(*)::int FROM checks WHERE at > now() - interval '1 day') checks,
                (SELECT count(*)::int FROM checks WHERE decision='allowed' AND at > now() - interval '1 day') allowed,
                (SELECT count(*)::int FROM permits WHERE status='active' AND now() BETWEEN valid_from AND valid_to) valid`,
      ))!;
      return NextResponse.json({ chain, trail, today, permitId: permit.id, requestId: id });
    }
    const checkId = Number(body.checkId);
    const check = await q1<{ permit_id: number }>(`SELECT permit_id FROM checks WHERE id=$1`, [checkId]);
    if (!check || check.permit_id !== permit.id) return err("bad_check");
    const v = await staff("verifier");

    if (step === "otp") {
      const r = await repOtpSend(v, checkId);
      return NextResponse.json({ ok: r.ok, error: r.ok ? null : r.error, sms: await outbox(contact, since) });
    }
    if (step === "otpcheck") {
      const r = await repOtpVerify(v, checkId, String(body.code ?? ""));
      return NextResponse.json(r);
    }
    if (step === "allow") {
      await recordDecision(v, checkId, {
        decision: "allowed",
        matched: { people: (body.people ?? []).map(Number), vehicles: (body.vehicles ?? []).map(Number), equipment: (body.equipment ?? []).map(Number) },
      });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "failed", 500);
  }
  return err("unknown_step", 404);
}
