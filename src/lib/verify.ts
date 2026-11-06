import "server-only";
import { createPrivateKey, sign } from "node:crypto";
import { q, q1, tx } from "./db";
import { audit } from "./audit";
import { ROT_WINDOW, rotatingCode, safeEqual, sha256 } from "./crypto";
import { getSetting, listGates, listZones } from "./settings";
import { LIVE_LABEL, liveStatus, maskId, pendingAmendment, type LiveStatus, type PermitRow } from "./permits";
import { checkOtp, sendOtp, type StaffUser } from "./auth";

export type Parsed =
  | { type: "static"; token: string; printedVersion: number | null }
  | { type: "rotating"; number: string; window: number; code: string }
  | { type: "manual"; number: string }
  | { type: "invalid" };

/** Arabic-Indic and Persian digits → ASCII, so a number typed on an Arabic keyboard still matches. */
function asciiDigits(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** A permit number typed by hand at the gate: PRM-2026-000002, prm 2026 2, 2026-000002, ٢٠٢٦-٢ … → PRM-2026-000002. */
export function parsePermitNumber(raw: string): string | null {
  const s = asciiDigits(raw).toUpperCase().replace(/[\s_./\\‐-―-]+/g, "");
  const m = s.match(/^(?:PRM)?(20\d{2})(\d{1,6})$/);
  if (!m || Number(m[2]) === 0) return null;
  return `PRM-${m[1]}-${m[2].padStart(6, "0")}`;
}

/** The scanner never follows the URL inside a QR – it only extracts an identifier and looks it up here. */
export function parsePayload(raw: string): Parsed {
  const s = raw.trim();
  const rot = s.match(/^SSH1:R:(PRM-\d{4}-\d{6}):(\d+):([0-9a-f]{12})$/);
  if (rot) return { type: "rotating", number: rot[1], window: Number(rot[2]), code: rot[3] };
  const st = s.match(/\/v\/([A-Za-z0-9_-]{43})(?:\.(\d+))?$/) || s.match(/^([A-Za-z0-9_-]{43})(?:\.(\d+))?$/);
  if (st) return { type: "static", token: st[1], printedVersion: st[2] ? Number(st[2]) : null };
  // A typed permit number is guessable (sequential), so it never stands alone: the representative code becomes mandatory.
  const n = parsePermitNumber(s);
  if (n) return { type: "manual", number: n };
  return { type: "invalid" };
}

export type LookupResult =
  | { found: false; checkId: number; reason: "not_found" | "rotating_expired" | "invalid" }
  | {
      found: true;
      checkId: number;
      codeType: "static" | "rotating" | "manual";
      status: LiveStatus;
      statusLabel: [string, string];
      statusReason: string | null;
      number: string;
      version: number;
      printedVersion: number | null;
      pendingAmendment: string | null;
      org: string;
      purpose: string;
      validFrom: string;
      validTo: string;
      zones: { id: number; name_ar: string; name_en: string; atGate: boolean }[];
      inScope: boolean;
      people: { name: string; id: string }[];
      vehicles: { plate: string; type: string }[];
      equipment: { name: string; qty: number }[];
      repName: string;
      repPhoneMasked: string;
      repOtpMode: "off" | "optional" | "required";
      canAllow: boolean;
      insidePeople: number[];
    };

async function logCheck(u: StaffUser, gateId: number, permitId: number | null, codeType: string, status: string, version: number | null, direction: "in" | "out" = "in") {
  const r = await q1<{ id: number }>(
    `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,status_at_check,version,direction) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [permitId, codeType, u.id, u.agency, gateId, status, version, direction],
  );
  await audit(`user:${u.id}`, direction === "out" ? "verify.exit_lookup" : "verify.lookup", "check", r!.id, { permitId, codeType, status, gateId });
  return r!.id;
}

export async function lookup(u: StaffUser, raw: string, gateId: number): Promise<LookupResult> {
  const parsed = parsePayload(raw);
  if (parsed.type === "invalid") return { found: false, checkId: await logCheck(u, gateId, null, "invalid", "not_found", null), reason: "invalid" };

  let p: PermitRow | undefined;
  if (parsed.type === "static") {
    p = await q1<PermitRow>(`SELECT * FROM permits WHERE token=$1`, [parsed.token]);
  } else if (parsed.type === "manual") {
    p = await q1<PermitRow>(`SELECT * FROM permits WHERE number=$1`, [parsed.number]);
  } else {
    p = await q1<PermitRow>(`SELECT * FROM permits WHERE number=$1`, [parsed.number]);
    if (p) {
      const now = Math.floor(Date.now() / 1000 / ROT_WINDOW);
      const fresh = Math.abs(now - parsed.window) <= 1 && safeEqual(rotatingCode(p.rot_secret, p.number, parsed.window), parsed.code);
      if (!fresh) return { found: false, checkId: await logCheck(u, gateId, p.id, "rotating_expired", "replay", p.version), reason: "rotating_expired" };
    }
  }
  if (!p) return { found: false, checkId: await logCheck(u, gateId, null, parsed.type, "not_found", null), reason: "not_found" };

  const status = liveStatus(p);
  const checkId = await logCheck(u, gateId, p.id, parsed.type, status, p.version);
  const [zones, gates, amend, mode] = await Promise.all([listZones(true), listGates(), pendingAmendment(p.id), getSetting("rep_otp_mode")]);
  const gate = gates.find((g) => g.id === gateId);
  const pz = zones.filter((z) => p!.zones.includes(z.id)).map((z) => ({ id: z.id, name_ar: z.name_ar, name_en: z.name_en, atGate: !!gate?.zone_ids.includes(z.id) }));
  const inScope = pz.some((z) => z.atGate);
  return {
    found: true,
    checkId,
    codeType: parsed.type,
    status,
    statusLabel: LIVE_LABEL[status],
    statusReason: p.status_reason,
    number: p.number,
    version: p.version,
    printedVersion: parsed.type === "static" ? parsed.printedVersion : null,
    pendingAmendment: amend?.ref ?? null,
    org: p.org_name,
    purpose: p.data.purpose,
    validFrom: new Date(p.valid_from).toISOString(),
    validTo: new Date(p.valid_to).toISOString(),
    zones: pz,
    inScope,
    people: p.data.people.map((x) => ({ name: x.name, id: maskId(x.id_number) })),
    vehicles: p.data.vehicles,
    equipment: p.data.equipment,
    repName: p.data.rep_name,
    repPhoneMasked: maskId(p.rep_phone),
    // a typed number proves nothing on its own: the representative code is required for it
    repOtpMode: parsed.type === "manual" ? "required" : mode,
    canAllow: status === "valid" && inScope,
    insidePeople: (await insideOf(p.id)).people,
  };
}

async function checkWithPermit(u: StaffUser, checkId: number) {
  const c = await q1<{ id: number; permit_id: number | null; verifier_id: number; decision: string | null; rep_otp: string | null; gate_id: number }>(
    `SELECT * FROM checks WHERE id=$1`,
    [checkId],
  );
  if (!c || c.verifier_id !== u.id || !c.permit_id) throw new Error("not_found");
  const p = (await q1<PermitRow>(`SELECT * FROM permits WHERE id=$1`, [c.permit_id]))!;
  return { c, p };
}

export async function revealId(u: StaffUser, checkId: number, index: number) {
  const { p } = await checkWithPermit(u, checkId);
  const person = p.data.people[index];
  if (!person) throw new Error("not_found");
  await audit(`user:${u.id}`, "verify.reveal_id", "permit", p.id, { checkId, index });
  return person.id_number;
}

export async function repOtpSend(u: StaffUser, checkId: number) {
  const { p } = await checkWithPermit(u, checkId);
  const r = await sendOtp("rep_entry", p.rep_phone, {
    ttlMin: 5,
    meta: { checkId },
    text: (code) => `رمز التحقق للدخول بالتصريح ${p.number}: ${code} — صالح 5 دقائق. لا تشاركه إلا مع المتحقق عند البوابة.`,
  });
  await audit(`user:${u.id}`, "verify.rep_otp_sent", "check", checkId, { ok: r.ok });
  return r;
}

export async function repOtpVerify(u: StaffUser, checkId: number, code: string) {
  const { p } = await checkWithPermit(u, checkId);
  const r = await checkOtp("rep_entry", p.rep_phone, code);
  const result = r.ok ? "verified" : `failed:${r.error}`;
  await q(`UPDATE checks SET rep_otp=$2 WHERE id=$1`, [checkId, result]);
  await audit(`user:${u.id}`, "verify.rep_otp", "check", checkId, { result });
  return r;
}

export async function recordDecision(
  u: StaffUser,
  checkId: number,
  input: { decision: "allowed" | "denied"; matched: { people: number[]; vehicles: number[]; equipment: number[] }; denyReason?: string },
) {
  return tx(async (e) => {
    const c = (await e.query<{ id: number; permit_id: number | null; verifier_id: number; decision: string | null; rep_otp: string | null; gate_id: number; code_type: string }>(`SELECT * FROM checks WHERE id=$1 FOR UPDATE`, [checkId]))[0];
    if (!c || c.verifier_id !== u.id) throw new Error("not_found");
    if (c.decision) throw new Error("already_decided");
    if (input.decision === "allowed") {
      if (!c.permit_id) throw new Error("not_allowed");
      const p = (await e.query<PermitRow>(`SELECT * FROM permits WHERE id=$1`, [c.permit_id]))[0];
      const gate = (await e.query<{ zone_ids: number[] }>(`SELECT zone_ids FROM gates WHERE id=$1`, [c.gate_id]))[0];
      if (liveStatus(p) !== "valid") throw new Error("permit_not_valid");
      if (!p.zones.some((z) => gate?.zone_ids.includes(z))) throw new Error("out_of_scope");
      if ((c.code_type === "manual" || (await getSetting("rep_otp_mode")) === "required") && c.rep_otp !== "verified") throw new Error("rep_otp_required");
      if (!input.matched.people.length) throw new Error("no_people_matched");
    } else if (!input.denyReason?.trim()) throw new Error("reason_required");
    await e.query(`UPDATE checks SET decision=$2, matched=$3, deny_reason=$4 WHERE id=$1`, [checkId, input.decision, JSON.stringify(input.matched), input.denyReason || null]);
    await audit(`user:${u.id}`, `verify.${input.decision}`, "check", checkId, { matched: input.matched, reason: input.denyReason ?? null }, e);
  });
}

/* ───────── Exit: one scan, no name picking ─────────
   Who is still inside under a permit is derived from the gate log itself
   (entries minus exits, in time order), and they all exit in a single record.
   Exit is never blocked by permit status — people must always be able to leave. */

type Inside = { people: number[]; vehicles: number[]; equipment: number[]; since: string | null };
type Q = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

export async function insideOf(permitId: number, run: Q = q): Promise<Inside> {
  const rows = await run<{ direction: string; matched: Record<string, number[]> | null; at: Date }>(
    `SELECT direction, matched, at FROM checks WHERE permit_id=$1 AND decision='allowed' ORDER BY at, id`,
    [permitId],
  );
  const sets = { people: new Set<number>(), vehicles: new Set<number>(), equipment: new Set<number>() };
  let since: Date | null = null;
  for (const r of rows) {
    const wasEmpty = !sets.people.size && !sets.vehicles.size;
    for (const k of ["people", "vehicles", "equipment"] as const) {
      for (const i of r.matched?.[k] ?? []) {
        if (r.direction === "out") sets[k].delete(i);
        else sets[k].add(i);
      }
    }
    const isEmpty = !sets.people.size && !sets.vehicles.size;
    if (isEmpty) since = null;
    else if (wasEmpty) since = new Date(r.at);
  }
  const arr = (x: Set<number>) => [...x].sort((a, b) => a - b);
  return { people: arr(sets.people), vehicles: arr(sets.vehicles), equipment: arr(sets.equipment), since: since ? since.toISOString() : null };
}

export type ExitResult =
  | { found: false; reason: "not_found" | "rotating_expired" | "invalid" }
  | { found: true; exited: false; reason: "none_inside"; number: string; org: string }
  | {
      found: true; exited: true; checkId: number; number: string; org: string; status: LiveStatus; statusLabel: [string, string];
      people: { name: string; id: string }[]; vehicles: { plate: string; type: string }[]; equipment: { name: string; qty: number }[];
      since: string | null; overstay: boolean;
    };

export async function recordExit(u: StaffUser, raw: string, gateId: number): Promise<ExitResult> {
  const parsed = parsePayload(raw);
  if (parsed.type === "invalid") {
    await logCheck(u, gateId, null, "invalid", "not_found", null, "out");
    return { found: false, reason: "invalid" };
  }
  let p: PermitRow | undefined;
  if (parsed.type === "static") p = await q1<PermitRow>(`SELECT * FROM permits WHERE token=$1`, [parsed.token]);
  // exit is never blocked, so a typed number is enough to record people leaving
  else if (parsed.type === "manual") p = await q1<PermitRow>(`SELECT * FROM permits WHERE number=$1`, [parsed.number]);
  else {
    p = await q1<PermitRow>(`SELECT * FROM permits WHERE number=$1`, [parsed.number]);
    if (p) {
      const now = Math.floor(Date.now() / 1000 / ROT_WINDOW);
      const fresh = Math.abs(now - parsed.window) <= 1 && safeEqual(rotatingCode(p.rot_secret, p.number, parsed.window), parsed.code);
      if (!fresh) {
        await logCheck(u, gateId, p.id, "rotating_expired", "replay", p.version, "out");
        return { found: false, reason: "rotating_expired" };
      }
    }
  }
  if (!p) {
    await logCheck(u, gateId, null, parsed.type, "not_found", null, "out");
    return { found: false, reason: "not_found" };
  }
  const permit = p;
  const status = liveStatus(permit);

  return tx(async (e) => {
    await e.query(`SELECT id FROM permits WHERE id=$1 FOR UPDATE`, [permit.id]); // serialize concurrent exits of one permit
    const inside = await insideOf(permit.id, e.query.bind(e) as Q);
    if (!inside.people.length && !inside.vehicles.length) {
      const r = await e.query<{ id: number }>(
        `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,status_at_check,version,direction) VALUES ($1,$2,$3,$4,$5,$6,$7,'out') RETURNING id`,
        [permit.id, parsed.type, u.id, u.agency, gateId, status, permit.version],
      );
      await audit(`user:${u.id}`, "verify.exit_none_inside", "check", r[0].id, { permitId: permit.id, gateId }, e);
      return { found: true, exited: false, reason: "none_inside", number: permit.number, org: permit.org_name } as const;
    }
    const matched = { people: inside.people, vehicles: inside.vehicles, equipment: inside.equipment };
    const r = await e.query<{ id: number }>(
      `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,status_at_check,version,direction,decision,matched)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'out','allowed',$8) RETURNING id`,
      [permit.id, parsed.type, u.id, u.agency, gateId, status, permit.version, JSON.stringify(matched)],
    );
    const overstay = status === "expired" || status === "revoked" || status === "suspended";
    await audit(`user:${u.id}`, "verify.exit", "check", r[0].id, { permitId: permit.id, gateId, matched, status, overstay }, e);
    const d = permit.data;
    return {
      found: true, exited: true, checkId: r[0].id, number: permit.number, org: permit.org_name, status, statusLabel: LIVE_LABEL[status],
      people: inside.people.map((i) => d.people[i]).filter(Boolean).map((x) => ({ name: x.name, id: maskId(x.id_number) })),
      vehicles: inside.vehicles.map((i) => d.vehicles[i]).filter(Boolean),
      equipment: inside.equipment.map((i) => d.equipment[i]).filter(Boolean),
      since: inside.since, overstay,
    } as const;
  });
}

/** Undo a mistaken exit within 2 minutes — kept in the log as voided, never deleted. */
export async function undoExit(u: StaffUser, checkId: number) {
  return tx(async (e) => {
    const c = (await e.query<{ id: number; verifier_id: number; direction: string; decision: string | null; at: Date }>(
      `SELECT id,verifier_id,direction,decision,at FROM checks WHERE id=$1 FOR UPDATE`,
      [checkId],
    ))[0];
    if (!c || c.verifier_id !== u.id || c.direction !== "out" || c.decision !== "allowed") throw new Error("not_found");
    if (Date.now() - new Date(c.at).getTime() > 120_000) throw new Error("too_late");
    await e.query(`UPDATE checks SET decision='voided' WHERE id=$1`, [checkId]);
    await audit(`user:${u.id}`, "verify.exit_undone", "check", checkId, {}, e);
  });
}

/* ───────── Offline snapshot (signed) ───────── */

export async function buildSnapshot(u: StaffUser) {
  const permits = await q<PermitRow>(`SELECT * FROM permits WHERE status <> 'revoked' AND valid_to > now() - interval '1 day'`);
  const [zones, gates, key] = await Promise.all([listZones(true), listGates(), getSetting("signing_key")]);
  const body = JSON.stringify({
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
    issuedTo: u.id,
    zones: zones.map((z) => ({ id: z.id, name_ar: z.name_ar, name_en: z.name_en })),
    gates,
    permits: permits.map((p) => ({
      n: p.number,
      th: sha256(p.token), // static token is never shipped – only its hash
      rs: p.rot_secret,
      s: p.status,
      v: p.version,
      f: new Date(p.valid_from).toISOString(),
      t: new Date(p.valid_to).toISOString(),
      z: p.zones,
      o: p.org_name,
      pp: p.data.people.map((x) => [x.name, maskId(x.id_number)]),
      vh: p.data.vehicles.map((x) => [x.plate, x.type]),
      eq: p.data.equipment.map((x) => [x.name, x.qty]),
      rn: p.data.rep_name,
    })),
  });
  const sig = sign(null, Buffer.from(body), createPrivateKey(key.private)).toString("base64");
  await audit(`user:${u.id}`, "verify.snapshot_downloaded", null, null, { count: permits.length });
  return { body, sig, publicKey: key.public };
}

export async function syncOffline(
  u: StaffUser,
  items: { clientId: string; number: string | null; codeType: string; status: string; gateId: number; at: string; decision: "allowed" | "denied" | null; denyReason?: string; matched?: unknown }[],
) {
  let n = 0;
  for (const it of items.slice(0, 500)) {
    const p = it.number ? await q1<{ id: number; version: number }>(`SELECT id,version FROM permits WHERE number=$1`, [it.number]) : undefined;
    const r = await q(
      `INSERT INTO checks(permit_id,code_type,verifier_id,agency,gate_id,at,status_at_check,version,decision,deny_reason,matched,offline,client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12) ON CONFLICT (client_id) DO NOTHING RETURNING id`,
      [p?.id ?? null, it.codeType, u.id, u.agency, it.gateId, it.at, it.status, p?.version ?? null, it.decision, it.denyReason ?? null, JSON.stringify(it.matched ?? null), `${u.id}:${it.clientId}`],
    );
    if (r.length) n++;
  }
  await audit(`user:${u.id}`, "verify.offline_sync", null, null, { received: items.length, stored: n });
  return n;
}

export { LIVE_LABEL };
