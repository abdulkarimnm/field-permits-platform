import "server-only";
import { q, q1 } from "./db";
import { verifyChain } from "./audit";
import { commandData, presenceNow, type OpsAlert } from "./ops";

/* ─────────────────────────────────────────────────────────────
   Data for the operations wall screen (TV in the control room).
   Everything is computed from the gate log — no manual entry.
   ───────────────────────────────────────────────────────────── */

export type ScreenGate = { id: number; name_ar: string; name_en: string; in: number; out: number; denied: number; last15: number; lastAt: string | null; bad15: number };
export type ScreenZone = { id: number; code: string; name_ar: string; name_en: string; sensitive: boolean; cap: number; presence: number; bookedNow: number; enteredNow: number; permits: number };
export type ScreenEvent = { id: number; at: string; kind: "in" | "out" | "denied" | "suspicious" | "lookup"; gate_id: number; number: string | null; org: string | null; people: number; vehicles: number };
export type ScreenData = {
  generatedAt: string;
  kpi: {
    insidePeople: number; insideVehicles: number; insideParties: number;
    inPeople: number; inVehicles: number; outPeople: number; outVehicles: number;
    validPermits: number; upcomingPermits: number;
    denied: number; deniedRate: number; tamper: number;
    alerts: number; critical: number;
  };
  gates: ScreenGate[];
  zones: ScreenZone[];
  events: ScreenEvent[];
  flow: { t: string; in: number; out: number; denied: number }[];
  alerts: OpsAlert[];
  inside: { number: string; org: string; zone: number | null; people: number; vehicles: number; since: string | null; expired: boolean }[];
  chain: { ok: boolean; count: number };
};

let chainCache: { at: number; v: { ok: boolean; count: number } } | null = null;

const BUCKET_MIN = 5;
const FLOW_MIN = 120;

export async function screenData(): Promise<ScreenData> {
  const now = Date.now();
  const r = new Date(now + 3 * 3600_000);
  const dayStart = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()) - 3 * 3600_000);
  const flowStart = new Date(Math.floor((now - FLOW_MIN * 60_000) / (BUCKET_MIN * 60_000)) * BUCKET_MIN * 60_000);
  const since15 = new Date(now - 15 * 60_000);

  if (!chainCache || now - chainCache.at > 30_000) {
    const c = await verifyChain();
    chainCache = { at: now, v: { ok: c.ok, count: c.count } };
  }

  const ppl = `jsonb_array_length(coalesce(matched->'people','[]'::jsonb))`;
  const veh = `jsonb_array_length(coalesce(matched->'vehicles','[]'::jsonb))`;
  const tamper = `(code_type IN ('invalid','rotating_expired') OR status_at_check IN ('not_found','replay'))`;

  const [cmd, pres, today, permits, gateRows, flowRows, evRows] = await Promise.all([
    commandData(),
    presenceNow(),
    q1<{ in_p: number; in_v: number; out_p: number; out_v: number; denied: number; allowed_in: number; tamper: number }>(
      `SELECT coalesce(sum(${ppl}) FILTER (WHERE decision='allowed' AND direction='in'),0)::int in_p,
              coalesce(sum(${veh}) FILTER (WHERE decision='allowed' AND direction='in'),0)::int in_v,
              coalesce(sum(${ppl}) FILTER (WHERE decision='allowed' AND direction='out'),0)::int out_p,
              coalesce(sum(${veh}) FILTER (WHERE decision='allowed' AND direction='out'),0)::int out_v,
              count(*) FILTER (WHERE decision='denied')::int denied,
              count(*) FILTER (WHERE decision='allowed' AND direction='in')::int allowed_in,
              count(*) FILTER (WHERE ${tamper})::int tamper
       FROM checks WHERE at >= $1`,
      [dayStart],
    ),
    q1<{ valid: number; upcoming: number }>(
      `SELECT count(*) FILTER (WHERE status='active' AND now() BETWEEN valid_from AND valid_to)::int valid,
              count(*) FILTER (WHERE status='active' AND now() < valid_from)::int upcoming FROM permits`,
    ),
    q<{ gate_id: number; in_n: number; out_n: number; denied: number; last15: number; bad15: number; last: Date | null }>(
      `SELECT gate_id,
              count(*) FILTER (WHERE decision='allowed' AND direction='in')::int in_n,
              count(*) FILTER (WHERE decision='allowed' AND direction='out')::int out_n,
              count(*) FILTER (WHERE decision='denied' OR ${tamper})::int denied,
              count(*) FILTER (WHERE at >= $2)::int last15,
              count(*) FILTER (WHERE at >= $2 AND ${tamper})::int bad15,
              max(at) last
       FROM checks WHERE at >= $1 GROUP BY 1`,
      [dayStart, since15],
    ),
    q<{ b: number; in_p: number; out_p: number; denied: number }>(
      `SELECT floor(extract(epoch FROM (at - $1::timestamptz)) / ${BUCKET_MIN * 60})::int b,
              coalesce(sum(${ppl}) FILTER (WHERE decision='allowed' AND direction='in'),0)::int in_p,
              coalesce(sum(${ppl}) FILTER (WHERE decision='allowed' AND direction='out'),0)::int out_p,
              count(*) FILTER (WHERE decision='denied' OR ${tamper})::int denied
       FROM checks WHERE at >= $1 GROUP BY 1`,
      [flowStart],
    ),
    q<{ id: number; at: Date; gate_id: number; decision: string | null; direction: string; status_at_check: string; code_type: string; number: string | null; org: string | null; p: number; v: number }>(
      `SELECT c.id, c.at, c.gate_id, c.decision, c.direction, c.status_at_check, c.code_type, p.number, p.org_name org,
              jsonb_array_length(coalesce(c.matched->'people','[]'::jsonb))::int p, jsonb_array_length(coalesce(c.matched->'vehicles','[]'::jsonb))::int v
       FROM checks c LEFT JOIN permits p ON p.id=c.permit_id ORDER BY c.id DESC LIMIT 30`,
    ),
  ]);

  const nBuckets = Math.ceil((now - flowStart.getTime()) / (BUCKET_MIN * 60_000));
  const flow = Array.from({ length: nBuckets }, (_, b) => {
    const row = flowRows.find((x) => x.b === b);
    return { t: new Date(flowStart.getTime() + b * BUCKET_MIN * 60_000).toISOString(), in: row?.in_p ?? 0, out: row?.out_p ?? 0, denied: row?.denied ?? 0 };
  });

  const gates: ScreenGate[] = cmd.gates.map((g) => {
    const x = gateRows.find((r) => r.gate_id === g.id);
    return { id: g.id, name_ar: g.name_ar, name_en: g.name_en, in: x?.in_n ?? 0, out: x?.out_n ?? 0, denied: x?.denied ?? 0, last15: x?.last15 ?? 0, bad15: x?.bad15 ?? 0, lastAt: x?.last ? new Date(x.last).toISOString() : null };
  });

  const zones: ScreenZone[] = cmd.zones.map((z) => ({
    id: z.id, code: z.code, name_ar: z.name_ar, name_en: z.name_en, sensitive: z.sensitive, cap: z.cap,
    presence: z.presence, bookedNow: z.booked[cmd.nowIndex] ?? 0, enteredNow: z.entered[cmd.nowIndex] ?? 0, permits: z.permits,
  }));

  const tamperRow = (e: (typeof evRows)[number]) => e.code_type === "invalid" || e.code_type === "rotating_expired" || ["not_found", "replay"].includes(e.status_at_check);
  const events: ScreenEvent[] = evRows.map((e) => ({
    id: e.id, at: new Date(e.at).toISOString(), gate_id: e.gate_id, number: e.number, org: e.org, people: e.p, vehicles: e.v,
    kind: e.decision === "allowed" ? (e.direction === "out" ? "out" : "in") : e.decision === "denied" ? "denied" : tamperRow(e) || e.status_at_check !== "valid" ? "suspicious" : "lookup",
  }));

  /* alerts: the command-center ones + people still inside on an expired / suspended permit */
  const alerts: OpsAlert[] = cmd.alerts.filter((a) => a.id !== "calm");
  const over = pres.parties.filter((p) => p.expired);
  if (over.length)
    alerts.unshift({
      id: "overstay", level: "critical",
      ar: [`${over.reduce((s, p) => s + p.people, 0)} فرد داخل الميدان بتصريح منتهٍ أو موقوف`, over.slice(0, 3).map((p) => `${p.number} · ${p.org}`).join(" — ")],
      en: [`${over.reduce((s, p) => s + p.people, 0)} people inside on an expired/suspended permit`, over.slice(0, 3).map((p) => `${p.number} · ${p.org}`).join(" — ")],
    });
  for (const g of gates)
    if (g.bad15 >= 2 && !alerts.some((a) => a.gate === g.id))
      alerts.unshift({ id: `bad15-${g.id}`, level: "critical", gate: g.id, ar: [`${g.bad15} محاولة برمز مزيف أو قديم عند ${g.name_ar} خلال 15 د`, "تحقق من هوية حامل الرمز."], en: [`${g.bad15} fake/stale code attempts at ${g.name_en} in 15 min`, "Check the holder's identity."] });

  const insideP = pres.parties.reduce((s, p) => s + p.people, 0);
  const insideV = pres.parties.reduce((s, p) => s + p.vehicles, 0);
  const t = today!;
  return {
    generatedAt: new Date(now).toISOString(),
    kpi: {
      insidePeople: insideP, insideVehicles: insideV, insideParties: pres.parties.length,
      inPeople: t.in_p, inVehicles: t.in_v, outPeople: t.out_p, outVehicles: t.out_v,
      validPermits: permits!.valid, upcomingPermits: permits!.upcoming,
      denied: t.denied, deniedRate: t.allowed_in + t.denied ? Math.round((t.denied / (t.allowed_in + t.denied)) * 100) : 0, tamper: t.tamper,
      alerts: alerts.length, critical: alerts.filter((a) => a.level === "critical").length,
    },
    gates, zones, events, flow, alerts,
    inside: pres.parties.sort((a, b) => b.people - a.people).slice(0, 12).map(({ number, org, zone, people, vehicles, since, expired }) => ({ number, org, zone, people, vehicles, since, expired })),
    chain: chainCache.v,
  };
}
