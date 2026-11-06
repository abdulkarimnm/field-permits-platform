import "server-only";
import { q } from "./db";
import { listGates, listZones } from "./settings";

/* ─────────────────────────────────────────────────────────────
   Command-center data: a 15-hour timeline (−8h … +6h, Riyadh time).
   Past hours = what actually happened (allowed entries at the gates).
   Future hours = what is already booked (entry slots on requests) → a forecast.
   ───────────────────────────────────────────────────────────── */

export type Slot = { i: number; date: string; hour: number; past: boolean; now: boolean; startIso: string };
export type ZoneSeries = {
  id: number; code: string; name_ar: string; name_en: string; sensitive: boolean; cap: number;
  booked: number[]; entered: number[]; people: number[];
  presence: number; permits: number; topOrgs: { org: string; people: number }[];
};
export type GateSeries = { id: number; name_ar: string; name_en: string; zone_ids: number[]; checks: number[]; denied: number[]; bad: number[]; today: number; lastAt: string | null };
export type OpsEvent = { id: number; at: string; gate_id: number; kind: "allowed" | "exit" | "denied" | "suspicious" | "lookup"; number: string | null; org: string | null; zone: number | null };
export type OpsAlert = { id: string; level: "critical" | "warning" | "info"; ar: [string, string]; en: [string, string]; href?: string; cta?: [string, string]; slot?: number; zone?: number; gate?: number };
export type CommandData = { slots: Slot[]; nowIndex: number; zones: ZoneSeries[]; gates: GateSeries[]; events: OpsEvent[]; alerts: OpsAlert[]; generatedAt: string };

const BACK = 8;
const AHEAD = 6;
const ACTIVE = `('pending_review','pending_approval','approved','returned')`;


/* ───────── Who is inside right now ─────────
   Same rule as the gate (entries minus exits per permit, in time order), so the
   ops room, the wall screen and the exit scan always agree. Each permit's party is
   placed in the zone it entered through (gate zones ∩ permit zones). */
export type InsideParty = { permit: number; number: string; org: string; zone: number | null; people: number; vehicles: number; since: string | null; expired: boolean };

export async function presenceNow() {
  const rows = await q<{ permit_id: number; number: string; org: string; zones: number[]; valid_to: Date; status: string; direction: string; matched: Record<string, number[]> | null; at: Date; gate_zones: number[] }>(
    `SELECT c.permit_id, p.number, p.org_name org, p.zones, p.valid_to, p.status, c.direction, c.matched, c.at, g.zone_ids gate_zones
     FROM checks c JOIN permits p ON p.id=c.permit_id LEFT JOIN gates g ON g.id=c.gate_id
     WHERE c.decision='allowed' AND c.at >= now() - interval '36 hours' ORDER BY c.at, c.id`,
  );
  const map = new Map<number, { r: (typeof rows)[number]; ppl: Set<number>; veh: Set<number>; zone: number | null; since: Date | null }>();
  for (const r of rows) {
    let m = map.get(r.permit_id);
    if (!m) map.set(r.permit_id, (m = { r, ppl: new Set(), veh: new Set(), zone: null, since: null }));
    const wasEmpty = !m.ppl.size && !m.veh.size;
    const out = r.direction === "out";
    for (const i of r.matched?.people ?? []) (out ? m.ppl.delete(i) : m.ppl.add(i));
    for (const i of r.matched?.vehicles ?? []) (out ? m.veh.delete(i) : m.veh.add(i));
    if (!out) {
      m.zone = r.zones.find((z) => (r.gate_zones ?? []).includes(z)) ?? r.zones[0] ?? null;
      if (wasEmpty) m.since = new Date(r.at);
    }
    if (!m.ppl.size && !m.veh.size) m.since = null;
  }
  const parties: InsideParty[] = [...map.values()]
    .filter((m) => m.ppl.size || m.veh.size)
    .map((m) => ({
      permit: m.r.permit_id, number: m.r.number, org: m.r.org, zone: m.zone, people: m.ppl.size, vehicles: m.veh.size,
      since: m.since ? m.since.toISOString() : null,
      expired: m.r.status !== "active" || new Date(m.r.valid_to).getTime() < Date.now(),
    }));
  const zoneAgg = new Map<number, number>();
  const orgAgg = new Map<string, { zone: number; org: string; p: number }>();
  for (const x of parties) {
    if (x.zone == null) continue;
    zoneAgg.set(x.zone, (zoneAgg.get(x.zone) ?? 0) + x.people);
    const k = `${x.zone}|${x.org}`;
    const o = orgAgg.get(k) ?? { zone: x.zone, org: x.org, p: 0 };
    o.p += x.people;
    orgAgg.set(k, o);
  }
  return {
    parties,
    byZone: [...zoneAgg].map(([zone, p]) => ({ zone, p })),
    byOrg: [...orgAgg.values()].sort((a, b) => b.p - a.p),
  };
}

export async function commandData(): Promise<CommandData> {
  const nowMs = Date.now();
  const riyadh = new Date(nowMs + 3 * 3600_000);
  const hourStartUtc = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate(), riyadh.getUTCHours()) - 3 * 3600_000;
  const slots: Slot[] = Array.from({ length: BACK + AHEAD + 1 }, (_, i) => {
    const start = hourStartUtc + (i - BACK) * 3600_000;
    const r = new Date(start + 3 * 3600_000);
    return { i, date: r.toISOString().slice(0, 10), hour: r.getUTCHours(), past: i < BACK, now: i === BACK, startIso: new Date(start).toISOString() };
  });
  const winStart = new Date(hourStartUtc - BACK * 3600_000);
  const winEnd = new Date(hourStartUtc + (AHEAD + 1) * 3600_000);
  const dayStart = new Date(Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate()) - 3 * 3600_000);
  const dates = [...new Set(slots.map((s) => s.date))];
  const idx = (date: string, hour: number) => slots.findIndex((s) => s.date === date && s.hour === hour);

  const [zonesAll, gatesAll, booked, entered, gateHours, gateToday, presenceRows, , permits, events, pendingSoon] = await Promise.all([
    listZones(true),
    listGates(),
    q<{ zone: number; slot_date: string; slot_hour: number; v: number }>(
      `SELECT z zone, slot_date, slot_hour, sum(jsonb_array_length(vehicles))::int v
       FROM requests, unnest(zones) z WHERE status IN ${ACTIVE} AND slot_date = ANY($1) GROUP BY 1,2,3`,
      [dates],
    ),
    q<{ zone: number; h: number; v: number; p: number }>(
      `SELECT z zone, floor(extract(epoch FROM (c.at - $1::timestamptz))/3600)::int h,
              coalesce(sum(jsonb_array_length(coalesce(c.matched->'vehicles','[]'::jsonb))),0)::int v,
              coalesce(sum(jsonb_array_length(coalesce(c.matched->'people','[]'::jsonb))),0)::int p
       FROM checks c JOIN permits pm ON pm.id=c.permit_id JOIN gates g ON g.id=c.gate_id, unnest(pm.zones) z
       WHERE c.decision='allowed' AND c.direction='in' AND c.at >= $1 AND c.at < $2 AND z = ANY(g.zone_ids) GROUP BY 1,2`,
      [winStart, winEnd],
    ),
    q<{ gate_id: number; h: number; n: number; denied: number; bad: number }>(
      `SELECT gate_id, floor(extract(epoch FROM (at - $1::timestamptz))/3600)::int h, count(*)::int n,
              count(*) FILTER (WHERE decision='denied')::int denied,
              count(*) FILTER (WHERE status_at_check <> 'valid')::int bad
       FROM checks WHERE at >= $1 AND at < $2 GROUP BY 1,2`,
      [winStart, winEnd],
    ),
    q<{ gate_id: number; n: number; last: Date | null }>(`SELECT gate_id, count(*)::int n, max(at) last FROM checks WHERE at >= $1 GROUP BY 1`, [dayStart]),
    presenceNow(),
    Promise.resolve(null),
    q<{ zone: number; n: number }>(`SELECT z zone, count(*)::int n FROM permits, unnest(zones) z WHERE status='active' AND now() BETWEEN valid_from AND valid_to GROUP BY 1`),
    q<{ id: number; at: Date; gate_id: number; decision: string | null; direction: string; status_at_check: string; code_type: string; number: string | null; org: string | null; zone: number | null }>(
      `SELECT c.id, c.at, c.gate_id, c.decision, c.direction, c.status_at_check, c.code_type, p.number, p.org_name org, p.zones[1] zone
       FROM checks c LEFT JOIN permits p ON p.id=c.permit_id ORDER BY c.id DESC LIMIT 25`,
    ),
    q<{ n: number; v: number }>(
      `SELECT count(*)::int n, coalesce(sum(jsonb_array_length(vehicles)),0)::int v FROM requests
       WHERE status IN ('pending_review','pending_approval') AND slot_date = ANY($1)
         AND (slot_date || ' ' || lpad(slot_hour::text,2,'0') || ':00')::timestamp BETWEEN $2::timestamp AND $3::timestamp`,
      [dates, riyadh.toISOString().slice(0, 16).replace("T", " "), new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ")],
    ),
  ]);

  const N = slots.length;
  const presence = presenceRows.byZone;
  const orgs = presenceRows.byOrg;
  const zones: ZoneSeries[] = zonesAll
    .filter((z) => z.active)
    .map((z) => {
      const b = Array(N).fill(0);
      const e = Array(N).fill(0);
      const p = Array(N).fill(0);
      booked.filter((x) => x.zone === z.id).forEach((x) => {
        const i = idx(x.slot_date, x.slot_hour);
        if (i >= 0) b[i] += x.v;
      });
      entered.filter((x) => x.zone === z.id).forEach((x) => {
        if (x.h >= 0 && x.h < N) {
          e[x.h] += x.v;
          p[x.h] += x.p;
        }
      });
      return {
        id: z.id, code: z.code, name_ar: z.name_ar, name_en: z.name_en, sensitive: z.sensitive, cap: z.capacity_per_hour,
        booked: b, entered: e, people: p,
        presence: presence.find((x) => x.zone === z.id)?.p ?? 0,
        permits: permits.find((x) => x.zone === z.id)?.n ?? 0,
        topOrgs: orgs.filter((x) => x.zone === z.id).slice(0, 3).map((x) => ({ org: x.org, people: x.p })),
      };
    });

  const gates: GateSeries[] = gatesAll.map((g) => {
    const c = Array(N).fill(0), d = Array(N).fill(0), bad = Array(N).fill(0);
    gateHours.filter((x) => x.gate_id === g.id).forEach((x) => {
      if (x.h >= 0 && x.h < N) {
        c[x.h] += x.n;
        d[x.h] += x.denied;
        bad[x.h] += x.bad;
      }
    });
    const td = gateToday.find((x) => x.gate_id === g.id);
    return { id: g.id, name_ar: g.name_ar, name_en: g.name_en, zone_ids: g.zone_ids, checks: c, denied: d, bad, today: td?.n ?? 0, lastAt: td?.last ? new Date(td.last).toISOString() : null };
  });

  const evs: OpsEvent[] = events.map((x) => ({
    id: x.id,
    at: new Date(x.at).toISOString(),
    gate_id: x.gate_id,
    kind: x.decision === "allowed" ? (x.direction === "out" ? "exit" : "allowed") : x.decision === "denied" ? "denied" : x.status_at_check !== "valid" || x.code_type === "invalid" || x.code_type === "rotating_expired" ? "suspicious" : "lookup",
    number: x.number,
    org: x.org,
    zone: x.zone,
  }));

  /* ── actionable alerts ── */
  const alerts: OpsAlert[] = [];
  const hh = (s: Slot) => `${String(s.hour).padStart(2, "0")}:00`;
  for (const z of zones) {
    if (!z.cap) continue;
    for (let i = BACK; i < N; i++) {
      const load = Math.max(z.booked[i], i === BACK ? z.entered[i] : 0) / z.cap;
      if (load >= 0.85) {
        const alt = gates.filter((g) => g.zone_ids.includes(z.id)).sort((a, b) => a.checks[BACK] - b.checks[BACK])[0];
        alerts.push({
          id: `cap-${z.id}-${i}`, level: "critical", slot: i, zone: z.id, href: `/staff/capacity?zone=${z.id}`, cta: ["إدارة السعة", "Manage capacity"],
          ar: [i === BACK ? `${z.name_ar} عند ${Math.round(load * 100)}% الآن` : `${z.name_ar} ستبلغ ${Math.round(load * 100)}% الساعة ${hh(slots[i])}`, `${z.booked[i]} مركبة محجوزة من سعة ${z.cap}. ${alt ? `وجّه المركبات إلى ${alt.name_ar} الأقل ضغطًا، أو أوقف الحجز لهذه الساعة.` : "أوقف الحجز لهذه الساعة."}`],
          en: [i === BACK ? `${z.name_en} at ${Math.round(load * 100)}% now` : `${z.name_en} will hit ${Math.round(load * 100)}% at ${hh(slots[i])}`, `${z.booked[i]} vehicles booked of ${z.cap}. ${alt ? `Route vehicles via ${alt.name_en}, or pause bookings for that hour.` : "Pause bookings for that hour."}`],
        });
        break;
      }
      if (load >= 0.6 && !alerts.some((a) => a.zone === z.id)) {
        alerts.push({
          id: `busy-${z.id}-${i}`, level: "warning", slot: i, zone: z.id, href: `/staff/capacity?zone=${z.id}`, cta: ["عرض السعة", "View capacity"],
          ar: [`${z.name_ar} مزدحمة الساعة ${hh(slots[i])}`, `الإشغال المتوقع ${Math.round(load * 100)}% — راقب المدخل.`],
          en: [`${z.name_en} busy at ${hh(slots[i])}`, `Expected occupancy ${Math.round(load * 100)}% — watch the gate.`],
        });
      }
    }
  }
  for (const g of gates) {
    const recentBad = g.bad.slice(Math.max(0, BACK - 1), BACK + 1).reduce((s, x) => s + x, 0);
    if (recentBad > 0)
      alerts.push({
        id: `bad-${g.id}`, level: "critical", gate: g.id, href: "/staff/audit?q=verify.lookup", cta: ["فتح السجل", "Open log"],
        ar: [`${recentBad} محاولة مشبوهة عند ${g.name_ar}`, "رموز مزيفة أو قديمة أو تصاريح غير سارية خلال الساعة الأخيرة."],
        en: [`${recentBad} suspicious attempt(s) at ${g.name_en}`, "Fake/stale codes or invalid permits in the last hour."],
      });
  }
  const ps = pendingSoon[0];
  if (ps && ps.n > 0)
    alerts.push({
      id: "pending-soon", level: "warning", href: "/staff", cta: ["صندوق المهام", "Open inbox"],
      ar: [`${ps.n} طلب بموعد دخول خلال 6 ساعات لم يُعتمد بعد`, `${ps.v} مركبة قد تصل إلى البوابات دون تصريح سارٍ.`],
      en: [`${ps.n} request(s) due within 6h not approved yet`, `${ps.v} vehicle(s) may reach the gates without a valid permit.`],
    });
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level] || (a.slot ?? 99) - (b.slot ?? 99));
  if (!alerts.length)
    alerts.push({ id: "calm", level: "info", ar: ["الوضع مستقر", "لا ازدحام متوقع خلال 6 ساعات ولا محاولات مشبوهة."], en: ["All clear", "No congestion expected in 6 hours and no suspicious attempts."] });

  return { slots, nowIndex: BACK, zones, gates, events: evs, alerts, generatedAt: new Date(nowMs).toISOString() };
}
