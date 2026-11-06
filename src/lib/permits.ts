import "server-only";
import { q, q1, tx, type Exec } from "./db";
import { audit } from "./audit";
import { randomToken } from "./crypto";
import { getSetting, listZones, type Zone } from "./settings";
import { sendMessage } from "./notify";
import type { StaffUser } from "./auth";
import { mergeIntoRoster } from "./org";
import { normPlate, type Equipment, type Person, type RequestInput, type Vehicle } from "./validate";
export * from "./validate";

export type RequestStatus = "pending_review" | "pending_approval" | "returned" | "rejected" | "approved" | "withdrawn";

export type RequestRow = RequestInput & {
  id: number;
  ref: string;
  kind: "new" | "amendment";
  permit_id: number | null;
  contact: string;
  status: RequestStatus;
  stage1_by: number | null;
  stage1_at: Date | null;
  stage1_note: string | null;
  stage2_by: number | null;
  stage2_at: Date | null;
  reason: string | null;
  risk_score: number;
  risk_flags: RiskFlag[];
  lane: Lane;
  submitted_at: Date;
  updated_at: Date;
  valid_from: Date;
  valid_to: Date;
  slot_date: string | null;
};

export type PermitRow = {
  id: number;
  number: string;
  request_id: number;
  token: string;
  rot_secret: string;
  version: number;
  status: "active" | "suspended" | "revoked";
  status_reason: string | null;
  contact: string;
  org_name: string;
  rep_phone: string;
  valid_from: Date;
  valid_to: Date;
  zones: number[];
  data: RequestInput & { ref: string };
  issued_at: Date;
  updated_at: Date;
};

export const STATUS_LABEL: Record<RequestStatus, [string, string]> = {
  pending_review: ["بانتظار المراجعة الأولية", "Awaiting initial review"],
  pending_approval: ["بانتظار الاعتماد النهائي", "Awaiting final approval"],
  returned: ["معاد للاستكمال", "Returned for completion"],
  rejected: ["مرفوض", "Rejected"],
  approved: ["معتمد", "Approved"],
  withdrawn: ["مسحوب", "Withdrawn"],
};

export type LiveStatus = "valid" | "not_started" | "expired" | "suspended" | "revoked";
export const LIVE_LABEL: Record<LiveStatus, [string, string]> = {
  valid: ["ساري", "Valid"],
  not_started: ["لم تبدأ صلاحيته", "Not yet valid"],
  expired: ["منتهي", "Expired"],
  suspended: ["موقوف", "Suspended"],
  revoked: ["ملغي", "Revoked"],
};

export function liveStatus(p: Pick<PermitRow, "status" | "valid_from" | "valid_to">, now = new Date()): LiveStatus {
  if (p.status === "revoked") return "revoked";
  if (p.status === "suspended") return "suspended";
  if (now < new Date(p.valid_from)) return "not_started";
  if (now > new Date(p.valid_to)) return "expired";
  return "valid";
}

export const maskId = (id: string) => (id ? "•".repeat(Math.max(0, id.length - 4)) + id.slice(-4) : "");

/* ───────── Smart triage (risk scoring) ───────── */

export type Lane = "fast" | "normal" | "strict";
export type RiskFlag = { code: string; points: number; ar: string; en: string };

export async function computeRisk(e: Exec, r: RequestInput, contact: string, excludeId?: number) {
  const flags: RiskFlag[] = [];
  const add = (code: string, points: number, ar: string, en: string) => flags.push({ code, points, ar, en });

  const hist = (
    await e.query<{ approved: number; rejected: number; revoked: number }>(
      `SELECT
        (SELECT count(*)::int FROM requests WHERE contact=$1 AND status='approved') approved,
        (SELECT count(*)::int FROM requests WHERE contact=$1 AND status='rejected') rejected,
        (SELECT count(*)::int FROM permits WHERE contact=$1 AND status='revoked') revoked`,
      [contact],
    )
  )[0];
  if (hist.approved >= 3 && hist.revoked === 0) add("trusted", -20, "جهة موثوقة: 3 تصاريح معتمدة أو أكثر دون إلغاء", "Trusted: 3+ approved permits, none revoked");
  else if (hist.approved === 0) add("new_org", 15, "جهة جديدة بلا تصاريح سابقة", "New organization, no prior permits");
  if (hist.rejected >= 2) add("prior_rejections", 15, `${hist.rejected} طلبات مرفوضة سابقًا`, `${hist.rejected} previously rejected requests`);
  if (hist.revoked > 0) add("prior_revoked", 25, "سبق إلغاء تصريح لهذه الجهة", "A permit of this organization was revoked before");

  const zones = await e.query<Zone>(`SELECT * FROM zones WHERE id = ANY($1)`, [r.zones]);
  const sens = zones.filter((z) => z.sensitive);
  if (sens.length) add("sensitive_zone", 20, `منطقة حساسة: ${sens.map((z) => z.name_ar).join("، ")}`, `Sensitive zone: ${sens.map((z) => z.name_en).join(", ")}`);

  const lead = (new Date(r.valid_from).getTime() - Date.now()) / 3600_000;
  if (lead < 24) add("short_notice", 15, "طلب عاجل: يبدأ خلال أقل من 24 ساعة", "Short notice: starts within 24h");
  if (r.people.length > 50) add("large_group", 10, `عدد أفراد كبير (${r.people.length})`, `Large group (${r.people.length})`);
  if (r.vehicles.length > 25) add("large_fleet", 10, `عدد مركبات كبير (${r.vehicles.length})`, `Large fleet (${r.vehicles.length})`);

  // Same person / plate appearing in another overlapping request or permit (possible permit sharing)
  const ids = r.people.map((p) => p.id_number);
  const plates = r.vehicles.map((v) => normPlate(v.plate));
  const overl = await e.query<{ ref: string; people: Person[]; vehicles: Vehicle[] }>(
    `SELECT ref, people, vehicles FROM requests
     WHERE status IN ('pending_review','pending_approval','approved') AND contact <> $1
       AND valid_from < $3 AND valid_to > $2 AND ($4::int IS NULL OR id <> $4)`,
    [contact, r.valid_from, r.valid_to, excludeId ?? null],
  );
  const dupIds = new Set<string>();
  const dupPlates = new Set<string>();
  for (const o of overl) {
    o.people.forEach((p) => ids.includes(p.id_number) && dupIds.add(p.id_number));
    o.vehicles.forEach((v) => plates.includes(normPlate(v.plate)) && dupPlates.add(normPlate(v.plate)));
  }
  if (dupIds.size) add("dup_person", 25, `${dupIds.size} فرد مسجل في طلب متزامن لجهة أخرى`, `${dupIds.size} person(s) listed by another org in the same period`);
  if (dupPlates.size) add("dup_vehicle", 25, `${dupPlates.size} مركبة مسجلة لجهة أخرى في نفس الفترة`, `${dupPlates.size} vehicle(s) listed by another org in the same period`);

  if (r.slot_date && r.slot_hour != null && r.vehicles.length) {
    for (const z of zones) {
      const used = await slotUsage(e, z.id, r.slot_date, r.slot_hour, excludeId);
      if (used + r.vehicles.length > z.capacity_per_hour)
        add("capacity", 20, `تجاوز سعة ${z.name_ar} في الموعد المختار`, `Exceeds ${z.name_en} capacity at chosen slot`);
    }
  }

  const score = Math.max(0, Math.min(100, flags.reduce((s, f) => s + f.points, 0)));
  const lane: Lane = score < 20 ? "fast" : score < 50 ? "normal" : "strict";
  return { score, flags, lane };
}

export const LANE_LABEL: Record<Lane, [string, string]> = {
  fast: ["مسار سريع", "Fast lane"],
  normal: ["مسار عادي", "Normal"],
  strict: ["مراجعة مشددة", "Strict review"],
};

/* ───────── Capacity booking ───────── */

export async function slotUsage(e: Exec, zoneId: number, date: string, hour: number, excludeId?: number) {
  const r = await e.query<{ used: number }>(
    `SELECT coalesce(sum(jsonb_array_length(vehicles)),0)::int used FROM requests
     WHERE $1 = ANY(zones) AND slot_date=$2 AND slot_hour=$3
       AND status IN ('pending_review','pending_approval','approved','returned')
       AND ($4::int IS NULL OR id <> $4)`,
    [zoneId, date, hour, excludeId ?? null],
  );
  return r[0].used;
}

export const SLOT_HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 → 21:00

export async function capacityGrid(zoneIds: number[], from: string, days: number, excludeId?: number) {
  const zones = (await listZones()).filter((z) => zoneIds.includes(z.id));
  const rows = await q<{ zone: number; slot_date: string; slot_hour: number; used: number }>(
    `SELECT z AS zone, slot_date, slot_hour, sum(jsonb_array_length(vehicles))::int used
     FROM requests, unnest(zones) z
     WHERE z = ANY($1) AND slot_date >= $2 AND slot_date < to_char($2::date + $3::int, 'YYYY-MM-DD')
       AND status IN ('pending_review','pending_approval','approved','returned')
       AND ($4::int IS NULL OR id <> $4)
     GROUP BY 1,2,3`,
    [zoneIds, from, days, excludeId ?? null],
  );
  const used = new Map(rows.map((r) => [`${r.zone}|${r.slot_date}|${r.slot_hour}`, r.used]));
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  // remaining = min across selected zones (a vehicle entering occupies each selected zone's slot)
  return {
    dates,
    hours: SLOT_HOURS,
    zones: zones.map((z) => ({ id: z.id, name_ar: z.name_ar, name_en: z.name_en, cap: z.capacity_per_hour })),
    cells: Object.fromEntries(
      dates.flatMap((d) =>
        SLOT_HOURS.map((h) => {
          const rem = zones.length ? Math.min(...zones.map((z) => z.capacity_per_hour - (used.get(`${z.id}|${d}|${h}`) ?? 0))) : 0;
          const cap = zones.length ? Math.min(...zones.map((z) => z.capacity_per_hour)) : 0;
          return [`${d}|${h}`, { rem, cap }];
        }),
      ),
    ) as Record<string, { rem: number; cap: number }>,
  };
}

/* ───────── Numbering ───────── */

async function nextNumber(e: Exec, prefix: "REQ" | "PRM") {
  const year = new Date().getFullYear();
  const table = prefix === "REQ" ? "requests" : "permits";
  const col = prefix === "REQ" ? "ref" : "number";
  await e.query(`SELECT pg_advisory_xact_lock(${prefix === "REQ" ? 1001 : 1002})`);
  const r = await e.query<{ n: number }>(`SELECT count(*)::int + 1 n FROM ${table} WHERE ${col} LIKE $1`, [`${prefix}-${year}-%`]);
  return `${prefix}-${year}-${String(r[0].n).padStart(6, "0")}`;
}

/* ───────── Request lifecycle ───────── */

const event = (e: Exec, id: number, actor: string, action: string, note?: string | null) =>
  e.query(`INSERT INTO request_events(request_id,actor,action,note) VALUES ($1,$2,$3,$4)`, [id, actor, action, note ?? null]);

const cols = (r: RequestInput) => [
  r.org_name.trim(), r.cr_number || null, r.rep_name.trim(), r.rep_phone, r.rep_id, r.purpose.trim(),
  r.valid_from, r.valid_to, r.zones, r.slot_date || null, r.slot_hour ?? null,
  JSON.stringify(r.people), JSON.stringify(r.vehicles), JSON.stringify(r.equipment), r.declaration,
];

export async function submitRequest(contact: string, r: RequestInput, amendOf?: number) {
  return tx(async (e) => {
    const ref = await nextNumber(e, "REQ");
    const risk = await computeRisk(e, r, contact);
    const row = await e.query<{ id: number }>(
      `INSERT INTO requests(ref,kind,permit_id,contact,org_name,cr_number,rep_name,rep_phone,rep_id,purpose,valid_from,valid_to,zones,slot_date,slot_hour,people,vehicles,equipment,declaration,status,risk_score,risk_flags,lane)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending_review',$20,$21,$22) RETURNING id`,
      [ref, amendOf ? "amendment" : "new", amendOf ?? null, contact, ...cols(r), risk.score, JSON.stringify(risk.flags), risk.lane],
    );
    const id = row[0].id;
    await event(e, id, `applicant`, amendOf ? "amendment_submitted" : "submitted");
    await audit(`applicant:${contact}`, amendOf ? "request.amendment_submitted" : "request.submitted", "request", id, { ref, risk: risk.score, lane: risk.lane }, e);
    // keep the org profile current: new people / vehicles / equipment join the roster (teams untouched)
    await mergeIntoRoster(e as never, contact, r);
    await sendMessage(contact, `تم استلام طلبك رقم ${ref}. يمكنك متابعة حالته من بوابة الطلبات.`);
    return { id, ref };
  });
}

export async function resubmitRequest(contact: string, id: number, r: RequestInput) {
  return tx(async (e) => {
    const cur = (await e.query<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND contact=$2 FOR UPDATE`, [id, contact]))[0];
    if (!cur || cur.status !== "returned") throw new Error("not_returned");
    const risk = await computeRisk(e, r, contact, id);
    await e.query(
      `UPDATE requests SET org_name=$2,cr_number=$3,rep_name=$4,rep_phone=$5,rep_id=$6,purpose=$7,valid_from=$8,valid_to=$9,zones=$10,slot_date=$11,slot_hour=$12,people=$13,vehicles=$14,equipment=$15,declaration=$16,
        status='pending_review', stage1_by=NULL, stage1_at=NULL, stage1_note=NULL, reason=NULL, risk_score=$17, risk_flags=$18, lane=$19, updated_at=now()
       WHERE id=$1`,
      [id, ...cols(r), risk.score, JSON.stringify(risk.flags), risk.lane],
    );
    await event(e, id, "applicant", "resubmitted");
    await audit(`applicant:${contact}`, "request.resubmitted", "request", id, null, e);
  });
}

export async function withdrawRequest(contact: string, id: number) {
  return tx(async (e) => {
    const r = await e.query(`UPDATE requests SET status='withdrawn', updated_at=now() WHERE id=$1 AND contact=$2 AND status IN ('pending_review','pending_approval','returned') RETURNING id`, [id, contact]);
    if (!r.length) throw new Error("cannot_withdraw");
    await event(e, id, "applicant", "withdrawn");
    await audit(`applicant:${contact}`, "request.withdrawn", "request", id, null, e);
  });
}

/* ───────── Two-stage review ───────── */

export async function canAct(u: StaffUser, stage: 1 | 2, r: Pick<RequestRow, "stage1_by">) {
  const rule = await getSetting(stage === 1 ? "stage1" : "stage2");
  // only the stage owner set by the admin (a role or a named person) — no implicit admin bypass
  const ok = rule.type === "role" ? u.roles.includes(rule.value as never) : String(u.id) === rule.value;
  if (!ok) return { ok: false as const, why: "not_assigned" as const };
  if (stage === 2 && (await getSetting("separation_of_duties")) && r.stage1_by === u.id)
    return { ok: false as const, why: "same_person" as const };
  return { ok: true as const };
}

export type Decision = "approve" | "reject" | "return";

export async function decide(u: StaffUser, id: number, decision: Decision, reason?: string) {
  if ((decision === "reject" || decision === "return") && !reason?.trim()) throw new Error("reason_required");
  return tx(async (e) => {
    const r = (await e.query<RequestRow>(`SELECT * FROM requests WHERE id=$1 FOR UPDATE`, [id]))[0];
    if (!r) throw new Error("not_found");
    const stage = r.status === "pending_review" ? 1 : r.status === "pending_approval" ? 2 : 0;
    if (!stage) throw new Error("not_actionable");
    const can = await canAct(u, stage as 1 | 2, r);
    if (!can.ok) throw new Error(can.why);
    const actor = `user:${u.id}`;

    if (decision === "approve" && stage === 1) {
      await e.query(`UPDATE requests SET status='pending_approval', stage1_by=$2, stage1_at=now(), stage1_note=$3, updated_at=now() WHERE id=$1`, [id, u.id, reason || null]);
      await event(e, id, u.name, "stage1_approved", reason);
      await audit(actor, "request.stage1_approved", "request", id, { ref: r.ref }, e);
      await sendMessage(r.contact, `طلبك ${r.ref} اجتاز المراجعة الأولية وهو الآن بانتظار الاعتماد النهائي.`);
      return { status: "pending_approval" as const };
    }
    if (decision === "approve" && stage === 2) {
      await e.query(`UPDATE requests SET status='approved', stage2_by=$2, stage2_at=now(), updated_at=now() WHERE id=$1`, [id, u.id]);
      const permit = await issue(e, r);
      await event(e, id, u.name, "approved", null);
      await audit(actor, r.kind === "amendment" ? "permit.amended" : "permit.issued", "permit", permit.id, { ref: r.ref, number: permit.number, version: permit.version }, e);
      await sendMessage(
        r.contact,
        r.kind === "amendment"
          ? `تم اعتماد تعديل التصريح ${permit.number} (الإصدار ${permit.version}). يمكنك تنزيل النسخة المحدثة.`
          : `تم اعتماد طلبك ${r.ref} وإصدار التصريح ${permit.number}. يمكنك تنزيله من بوابة الطلبات.`,
      );
      return { status: "approved" as const, permit };
    }
    const status = decision === "reject" ? "rejected" : "returned";
    await e.query(`UPDATE requests SET status=$2, reason=$3, updated_at=now() WHERE id=$1`, [id, status, reason]);
    await event(e, id, u.name, status, reason);
    await audit(actor, `request.${status}`, "request", id, { ref: r.ref, stage, reason }, e);
    await sendMessage(
      r.contact,
      decision === "reject" ? `نعتذر، تم رفض طلبك ${r.ref}. السبب: ${reason}` : `طلبك ${r.ref} أعيد للاستكمال. المطلوب: ${reason}`,
    );
    return { status };
  });
}

async function issue(e: Exec, r: RequestRow) {
  const data = JSON.stringify({
    ref: r.ref, org_name: r.org_name, cr_number: r.cr_number, rep_name: r.rep_name, rep_phone: r.rep_phone, rep_id: r.rep_id,
    purpose: r.purpose, valid_from: r.valid_from, valid_to: r.valid_to, zones: r.zones, people: r.people, vehicles: r.vehicles, equipment: r.equipment,
    slot_date: r.slot_date, slot_hour: r.slot_hour,
  });
  if (r.kind === "amendment" && r.permit_id) {
    const p = await e.query<PermitRow>(
      `UPDATE permits SET version=version+1, request_id=$2, org_name=$3, rep_phone=$4, valid_from=$5, valid_to=$6, zones=$7, data=$8, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [r.permit_id, r.id, r.org_name, r.rep_phone, r.valid_from, r.valid_to, r.zones, data],
    );
    return p[0];
  }
  const number = await nextNumber(e, "PRM");
  const p = await e.query<PermitRow>(
    `INSERT INTO permits(number,request_id,token,rot_secret,contact,org_name,rep_phone,valid_from,valid_to,zones,data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [number, r.id, randomToken(32), randomToken(32), r.contact, r.org_name, r.rep_phone, r.valid_from, r.valid_to, r.zones, data],
  );
  await e.query(`UPDATE requests SET permit_id=$2 WHERE id=$1`, [r.id, p[0].id]);
  return p[0];
}

/* ───────── Permit administration ───────── */

export async function setPermitStatus(u: StaffUser, id: number, action: "suspend" | "reactivate" | "revoke", reason: string) {
  if (!reason?.trim()) throw new Error("reason_required");
  return tx(async (e) => {
    const p = (await e.query<PermitRow>(`SELECT * FROM permits WHERE id=$1 FOR UPDATE`, [id]))[0];
    if (!p) throw new Error("not_found");
    if (p.status === "revoked") throw new Error("already_revoked");
    const next = action === "suspend" ? "suspended" : action === "revoke" ? "revoked" : "active";
    if (action === "reactivate" && p.status !== "suspended") throw new Error("not_suspended");
    await e.query(`UPDATE permits SET status=$2, status_reason=$3, updated_at=now() WHERE id=$1`, [id, next, reason]);
    await audit(`user:${u.id}`, `permit.${action}`, "permit", id, { number: p.number, reason }, e);
    const msg = { suspend: `تم إيقاف التصريح ${p.number} مؤقتًا. السبب: ${reason}`, revoke: `تم إلغاء التصريح ${p.number} نهائيًا. السبب: ${reason}`, reactivate: `تمت إعادة تفعيل التصريح ${p.number}.` }[action];
    await sendMessage(p.contact, msg);
  });
}

export const getPermit = (id: number) => q1<PermitRow>(`SELECT * FROM permits WHERE id=$1`, [id]);
export const getRequest = (id: number) => q1<RequestRow>(`SELECT * FROM requests WHERE id=$1`, [id]);
export const pendingAmendment = (permitId: number) =>
  q1<{ ref: string }>(`SELECT ref FROM requests WHERE permit_id=$1 AND kind='amendment' AND status IN ('pending_review','pending_approval','returned') LIMIT 1`, [permitId]);

/** Payload encoded in the printed QR. The scanner never opens it; it only extracts the token. */
export function staticQrPayload(base: string, p: Pick<PermitRow, "token" | "version">) {
  return `${base}/v/${p.token}.${p.version}`;
}
