import "server-only";
import { cookies } from "next/headers";
import { randomInt, randomUUID } from "node:crypto";
import { q, q1 } from "./db";
import { getSetting, listZones } from "./settings";
import { decide, setPermitStatus, submitRequest, type RequestInput } from "./permits";
import type { StaffUser } from "./auth";
import { insideOf } from "./verify";
import { getOrg, saveOrg } from "./org";
import { normPlate } from "./validate";

/* ─────────────────────────────────────────────────────────────
   Roles lab (sandbox): one visitor plays every role on the REAL system.
   Only available while demo mode is on. The visitor's own organization
   uses a generated phone number so every SMS/OTP lands in the lab's phone.
   ───────────────────────────────────────────────────────────── */

const SBX = "vp_sbx";
export type SbxRole = "applicant" | "reviewer" | "approver" | "supervisor" | "verifier" | "admin";
export const ROLE_HOME: Record<SbxRole, string> = {
  applicant: "/apply",
  reviewer: "/staff",
  approver: "/staff",
  supervisor: "/staff/ops",
  verifier: "/verify",
  admin: "/staff",
};

export type Sbx = { contact: string; start: string; since: string };

export async function getSbx(): Promise<Sbx | null> {
  const v = (await cookies()).get(SBX)?.value;
  if (!v) return null;
  const [contact, start, since] = v.split("|");
  return /^05\d{8}$/.test(contact) && start ? { contact, start, since: since || start } : null;
}

export async function ensureSbx(): Promise<Sbx> {
  const cur = await getSbx();
  if (cur) return cur;
  const now = new Date().toISOString();
  const s = { contact: `058${String(randomInt(0, 10_000_000)).padStart(7, "0")}`, start: now, since: now };
  await writeSbx(s);
  return s;
}

async function writeSbx(s: Sbx) {
  (await cookies()).set(SBX, `${s.contact}|${s.start}|${s.since}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600, secure: process.env.NODE_ENV === "production" });
}

/** Missions only count what the visitor does after the scenario was prepared. */
export async function markSeeded(s: Sbx) {
  await writeSbx({ ...s, since: new Date().toISOString() });
}

export async function demoOn() {
  return getSetting("demo_mode");
}

export async function staffByRole(role: string): Promise<StaffUser> {
  const u = await q1<StaffUser>(`SELECT id,username,name,roles,agency FROM users WHERE $1 = ANY(roles) AND active ORDER BY id LIMIT 1`, [role]);
  if (!u) throw new Error(`no_${role}`);
  return u;
}

/* ───────── realistic scenario ───────── */

const FIRST = ["عبدالله", "محمد", "فهد", "سعد", "خالد", "ناصر", "تركي", "ماجد", "سلطان", "بندر", "فيصل", "عمر", "يوسف", "إبراهيم", "صالح", "عبدالرحمن"];
const LAST = ["العتيبي", "القحطاني", "الحربي", "الشهري", "الغامدي", "الزهراني", "الدوسري", "المطيري", "العنزي", "الشمري", "السبيعي", "البلوي"];
const pick = <T,>(a: T[]) => a[randomInt(0, a.length)];
const nid = () => `${pick(["1", "2"])}${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
const phone = () => `055${String(randomInt(0, 10_000_000)).padStart(7, "0")}`;
const plate = () => `${pick(["أ", "ب", "ح", "د", "ر", "س", "ص", "ط", "ع", "ق", "ك", "ل", "م", "ن", "هـ", "و", "ي"])} ${pick(["ب", "ح", "د", "ر", "س", "ع", "ك", "ل"])} ${pick(["أ", "ب", "د", "ر", "ن"])} ${randomInt(1000, 9999)}`;

function riyadhSlot(offsetH: number) {
  const r = new Date(Date.now() + (3 + offsetH) * 3600_000);
  return { date: r.toISOString().slice(0, 10), hour: r.getUTCHours() };
}

function makeReq(o: { org: string; rep?: string; repPhone: string; purpose: string; zones: number[]; people: number; vehicles: number; startH: number; days: number; slotH: number; equipment?: { name: string; qty: number }[] }): RequestInput {
  const rep = o.rep ?? `${pick(FIRST)} ${pick(FIRST)} ${pick(LAST)}`;
  const slot = riyadhSlot(o.slotH);
  return {
    org_name: o.org,
    cr_number: `40${String(randomInt(0, 100_000_000)).padStart(8, "0")}`,
    rep_name: rep,
    rep_phone: o.repPhone,
    rep_id: nid(),
    purpose: o.purpose,
    valid_from: new Date(Date.now() + o.startH * 3600_000).toISOString(),
    valid_to: new Date(Date.now() + (o.startH + o.days * 24) * 3600_000).toISOString(),
    zones: o.zones,
    slot_date: o.vehicles ? slot.date : null,
    slot_hour: o.vehicles ? slot.hour : null,
    people: [{ name: rep, id_number: nid() }, ...Array.from({ length: o.people - 1 }, () => ({ name: `${pick(FIRST)} ${pick(FIRST)} ${pick(LAST)}`, id_number: nid() }))],
    vehicles: Array.from({ length: o.vehicles }, () => ({ plate: plate(), type: pick(["شاحنة نقل", "مركبة خدمات", "حافلة صغيرة", "مركبة دفع رباعي"]) })),
    equipment: o.equipment ?? [],
    declaration: true,
  };
}

export async function seedScenario(sbx: Sbx) {
  const zones = await listZones();
  const Z = (code: string) => zones.find((z) => z.code === code)?.id ?? zones[0].id;
  const reviewer = await staffByRole("reviewer");
  const approver = await staffByRole("approver");
  const verifier = await staffByRole("verifier");
  const made: { label: string; ref: string }[] = [];
  const sub = async (contact: string, r: RequestInput, label: string) => {
    const x = await submitRequest(contact, r);
    made.push({ label, ref: x.ref });
    return x.id;
  };
  const issue = async (id: number) => {
    await decide(reviewer, id, "approve", "البيانات مكتملة");
    return decide(approver, id, "approve");
  };

  /* the visitor's own organization */
  const mine = "مؤسسة الضيافة الراقية للفعاليات";
  const own1 = await sub(sbx.contact, makeReq({ org: mine, repPhone: sbx.contact, purpose: "تشغيل نقاط ضيافة الزوار وتوريد المياه في الساحة الرئيسية", zones: [Z("A")], people: 8, vehicles: 2, startH: -1, days: 4, slotH: 1, equipment: [{ name: "عربات ضيافة", qty: 4 }] }), "تصريح ساري لجهتك");
  const r1 = await issue(own1);
  const own2 = await sub(sbx.contact, makeReq({ org: mine, repPhone: sbx.contact, purpose: "تركيب مظلات تظليل مؤقتة في مواقف الزوار", zones: [Z("B")], people: 5, vehicles: 1, startH: 30, days: 2, slotH: 2 }), "طلب معاد لك للاستكمال");
  await decide(reviewer, own2, "return", "أرفق خطاب التكليف من الجهة المالكة وحدّث أرقام هويات الأفراد");
  await sub(sbx.contact, makeReq({ org: mine, repPhone: sbx.contact, purpose: "صيانة دورية لوحدات الضيافة في منطقة الخدمات", zones: [Z("C")], people: 3, vehicles: 1, startH: 50, days: 1, slotH: 3 }), "طلب لجهتك بانتظار المراجعة");

  /* other organizations → the reviewer's and approver's queues */
  await sub(phone(), makeReq({ org: "شركة الأفق للتنظيم", repPhone: phone(), purpose: "تنظيم مسارات الزوار وتركيب الحواجز في الساحة الرئيسية", zones: [Z("A")], people: 12, vehicles: 6, startH: 2, days: 2, slotH: 1 }), "بانتظار المراجعة · مسار عادي");
  await sub(phone(), makeReq({ org: "مؤسسة الأمانة للخدمات", repPhone: phone(), purpose: "أعمال تنظيف وتشجير على المسار التاريخي ومحيط جبل الرماة", zones: [Z("D"), Z("E")], people: 64, vehicles: 4, startH: 3, days: 1, slotH: 2 }), "بانتظار المراجعة · مراجعة مشددة");
  await sub(phone(), makeReq({ org: "مكتب الرواد الهندسي", repPhone: phone(), purpose: "معاينة هندسية لشبكة الإنارة في مواقف الزوار", zones: [Z("B")], people: 3, vehicles: 1, startH: 72, days: 1, slotH: 4 }), "بانتظار المراجعة");
  const p1 = await sub(phone(), makeReq({ org: "شركة المدار للنقل", repPhone: phone(), purpose: "نقل معدات الصوت والإضاءة لفعالية مسائية في الساحة الرئيسية", zones: [Z("A")], people: 10, vehicles: 7, startH: 1, days: 1, slotH: 1 }), "بانتظار الاعتماد النهائي");
  await decide(reviewer, p1, "approve", "البيانات مكتملة");

  /* active permits of other organizations (+ one suspended) */
  const live: number[] = [];
  for (const [org, purpose, z, ppl, veh] of [
    ["شركة البيان للصيانة", "صيانة شبكة الري في منطقة الخدمات", Z("C"), 6, 2],
    ["مؤسسة الواحة للإعاشة", "توريد وجبات فرق العمل في الساحة الرئيسية", Z("A"), 9, 3],
    ["شركة السهم للأمن والسلامة", "دعم فرق السلامة عند مواقف الزوار", Z("B"), 14, 2],
  ] as [string, string, number, number, number][]) {
    const id = await sub(phone(), makeReq({ org, repPhone: phone(), purpose, zones: [z], people: ppl, vehicles: veh, startH: -2, days: 3, slotH: 1 }), "تصريح ساري");
    const r = await issue(id);
    if ("permit" in r && r.permit) live.push(r.permit.id);
  }
  if (live[2]) await setPermitStatus(approver, live[2], "suspend", "مخالفة نطاق الدخول المعتمد في زيارة سابقة");

  /* gate activity over the past hours (history for the command center) */
  const ownPermit = "permit" in r1 && r1.permit ? r1.permit.id : null;
  const history = [ownPermit, live[0], live[1]].filter(Boolean) as number[];
  for (let h = 6; h >= 1; h--) {
    for (const pid of history) {
      if (randomInt(0, 3) === 0) continue;
      const p = await q1<{ zones: number[]; version: number; data: { people: unknown[]; vehicles: unknown[] } }>(`SELECT zones, version, data FROM permits WHERE id=$1`, [pid]);
      if (!p) continue;
      const gate = (await q1<{ id: number }>(`SELECT id FROM gates WHERE $1 = ANY(zone_ids) ORDER BY id LIMIT 1`, [p.zones[0]]))?.id ?? 1;
      const at = new Date(Date.now() - h * 3600_000 + randomInt(0, 3_000_000));
      const np = Math.max(1, randomInt(1, p.data.people.length + 1));
      await q(
        `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,at,status_at_check,version,decision,matched,rep_otp)
         VALUES ($1,'rotating',$2,$3,$4,$5,'valid',$6,'allowed',$7,'verified')`,
        [pid, verifier.id, verifier.agency, gate, at, p.version, JSON.stringify({ people: Array.from({ length: np }, (_, i) => i), vehicles: p.data.vehicles.map((_, i) => i), equipment: [] })],
      );
    }
  }
  /* one party already left (exit scan) so the wall screen shows real exits */
  for (const pid of history.slice(1, 2)) {
    const inside = await insideOf(pid);
    if (!inside.people.length) continue;
    const p = await q1<{ zones: number[]; version: number }>(`SELECT zones, version FROM permits WHERE id=$1`, [pid]);
    const gate = (await q1<{ id: number }>(`SELECT id FROM gates WHERE $1 = ANY(zone_ids) ORDER BY id LIMIT 1`, [p!.zones[0]]))?.id ?? 1;
    await q(
      `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,at,status_at_check,version,decision,matched,direction)
       VALUES ($1,'rotating',$2,$3,$4,$5,'valid',$6,'allowed',$7,'out')`,
      [pid, verifier.id, verifier.agency, gate, new Date(Date.now() - 4 * 60_000), p!.version, JSON.stringify(inside)],
    );
  }
  for (const h of [2, 1]) {
    await q(`INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,at,status_at_check) VALUES (NULL,'invalid',$1,$2,3,$3,'not_found')`, [verifier.id, verifier.agency, new Date(Date.now() - h * 3600_000 + 600_000)]);
  }
  /* two ready-made work teams in the applicant's organization profile */
  const org = await getOrg(sbx.contact);
  if (org && !org.teams.length && org.people.length >= 4) {
    const P = org.people.map((p) => p.id_number);
    await saveOrg(sbx.contact, {
      ...org,
      teams: [
        { id: randomUUID(), name: "فريق الصيانة الميدانية", people: P.slice(0, 4), vehicles: org.vehicles.slice(0, 1).map((v) => normPlate(v.plate)), equipment: org.equipment.slice(0, 1).map((x) => x.name.trim()) },
        { id: randomUUID(), name: "فريق التنظيم والضيافة", people: P.slice(2, 8), vehicles: org.vehicles.slice(1, 2).map((v) => normPlate(v.plate)), equipment: [] },
      ],
    });
  }
  return made;
}

/* ───────── what to test at the gate ───────── */

export async function gateCodes(sbx: Sbx) {
  const rows = await q<{ id: number; number: string; token: string; version: number; status: string; org_name: string; contact: string; valid_from: Date; valid_to: Date }>(
    `SELECT id, number, token, version, status, org_name, contact, valid_from, valid_to FROM permits ORDER BY (contact=$1) DESC, id DESC LIMIT 40`,
    [sbx.contact],
  );
  const now = Date.now();
  const valid = rows.find((p) => p.status === "active" && +new Date(p.valid_from) <= now && +new Date(p.valid_to) >= now);
  const suspended = rows.find((p) => p.status === "suspended");
  const upcoming = rows.find((p) => p.status === "active" && +new Date(p.valid_from) > now);
  const out: { kind: "valid" | "suspended" | "upcoming" | "fake"; label: [string, string]; code: string; number?: string; org?: string }[] = [];
  if (valid) out.push({ kind: "valid", label: ["تصريح ساري", "Valid permit"], code: `${valid.token}.${valid.version}`, number: valid.number, org: valid.org_name });
  if (suspended) out.push({ kind: "suspended", label: ["تصريح موقوف", "Suspended permit"], code: `${suspended.token}.${suspended.version}`, number: suspended.number, org: suspended.org_name });
  if (upcoming) out.push({ kind: "upcoming", label: ["لم تبدأ صلاحيته", "Not yet valid"], code: `${upcoming.token}.${upcoming.version}`, number: upcoming.number, org: upcoming.org_name });
  out.push({ kind: "fake", label: ["رمز مزيف من موقع مشابه", "Fake look-alike QR"], code: "https://permits-ssh.example.com/v/Fq9xQ2mZr8LkP0aT7vWbN3yJc6HdS1eUoG4iK5lRtYw" });
  return out;
}

/* ───────── missions, ticked from the real audit log ───────── */

type Mission = { id: string; ar: string; en: string; href: string; done: boolean };

export async function missions(sbx: Sbx): Promise<Record<SbxRole, Mission[]>> {
  const ids: Record<string, number | null> = {};
  for (const r of ["reviewer", "approver", "supervisor", "verifier", "admin"]) ids[r] = (await q1<{ id: number }>(`SELECT id FROM users WHERE $1 = ANY(roles) AND active ORDER BY id LIMIT 1`, [r]))?.id ?? null;
  const rows = await q<{ actor: string; action: string; data: { status?: string } | null }>(
    `SELECT actor, action, data FROM audit WHERE at >= $1 AND action NOT IN ('staff.demo_session')`,
    [sbx.since],
  );
  const did = (actor: string | null, action: string, pred?: (d: { status?: string } | null) => boolean) =>
    !!actor && rows.some((r) => r.actor === actor && r.action === action && (!pred || pred(r.data)));
  const A = `applicant:${sbx.contact}`;
  const U = (r: string) => (ids[r] ? `user:${ids[r]}` : null);
  const m = (id: string, ar: string, en: string, href: string, done: boolean): Mission => ({ id, ar, en, href, done });
  return {
    applicant: [
      m("submit", "قدّم طلب تصريح جديدًا", "Submit a new permit request", "/apply/new", did(A, "request.submitted")),
      m("resubmit", "استكمل الطلب المعاد لك وأعد تقديمه", "Complete and resubmit the returned request", "/apply", did(A, "request.resubmitted")),
      m("pass", "افتح بطاقة الجوال وشاهد الرمز المتغير", "Open the mobile pass and watch the rotating code", "/apply", did(A, "permit.pass_opened")),
      m("doc", "نزّل التصريح الرسمي PDF", "Download the official PDF permit", "/apply", did(A, "permit.document_viewed")),
    ],
    reviewer: [
      m("s1", "اعتمد طلبًا في المراجعة الأولية", "Approve a request at stage 1", "/staff", did(U("reviewer"), "request.stage1_approved")),
      m("ret", "أعد طلبًا للاستكمال مع ذكر السبب", "Return a request for completion with a reason", "/staff", did(U("reviewer"), "request.returned")),
      m("rej", "ارفض طلبًا مشددًا مع ذكر السبب", "Reject a strict-review request with a reason", "/staff", did(U("reviewer"), "request.rejected")),
    ],
    approver: [
      m("s2", "اعتمد نهائيًا وأصدر تصريحًا", "Give final approval and issue a permit", "/staff", did(U("approver"), "permit.issued")),
      m("sus", "أوقف تصريحًا ساريًا مؤقتًا", "Temporarily suspend a valid permit", "/staff/permits", did(U("approver"), "permit.suspend")),
    ],
    verifier: [
      m("allow", "امسح تصريحًا ساريًا واسمح بالدخول", "Scan a valid permit and allow entry", "/verify", did(U("verifier"), "verify.allowed")),
      m("deny", "تحقق من تصريح موقوف وسجّل منع الدخول", "Check a suspended permit and record a denial", "/verify", did(U("verifier"), "verify.denied")),
      m("fake", "جرّب رمزًا مزيفًا وشاهد رفضه", "Try a fake code and watch it get rejected", "/verify", did(U("verifier"), "verify.lookup", (d) => d?.status === "not_found")),
    ],
    supervisor: [
      m("react", "أعد تفعيل التصريح الموقوف", "Reactivate the suspended permit", "/staff/permits?status=suspended", did(U("supervisor"), "permit.reactivate")),
      m("csv", "صدّر تقرير التصاريح CSV", "Export the permits report as CSV", "/staff/permits", did(U("supervisor"), "export.csv")),
    ],
    admin: [
      m("mode", "اجعل رمز الممثل إلزاميًا عند البوابة", "Make the representative code mandatory", "/staff/admin", did(U("admin"), "settings.workflow_updated")),
      m("user", "أضف مستخدمًا جديدًا بدور محدد", "Add a new user with a role", "/staff/admin?tab=users", did(U("admin"), "user.created")),
    ],
  };
}
