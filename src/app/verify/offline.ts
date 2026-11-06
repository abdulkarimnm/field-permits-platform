"use client";
// Offline verification engine: a server-signed (Ed25519) snapshot of active permits
// lets a gate keep checking when the network drops. Decisions are queued and synced later.

export type Gate = { id: number; name_ar: string; name_en: string; zone_ids: number[] };
type SnapPermit = { n: string; th: string; rs: string; s: string; v: number; f: string; t: string; z: number[]; o: string; pp: [string, string][]; vh: [string, string][]; eq: [string, number][]; rn: string };
type SnapBody = { issuedAt: string; expiresAt: string; zones: { id: number; name_ar: string; name_en: string }[]; gates: Gate[]; permits: SnapPermit[] };
export type Snapshot = { body: string; sig: string; publicKey: JsonWebKey; savedAt: string; verified: boolean | null };

const SNAP = "vp_snapshot";
const QUEUE = "vp_queue";
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

async function verifySig(s: { body: string; sig: string; publicKey: JsonWebKey }): Promise<boolean | null> {
  try {
    const key = await crypto.subtle.importKey("jwk", s.publicKey, { name: "Ed25519" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(s.sig), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, enc.encode(s.body));
  } catch {
    return null; // browser without Ed25519 support
  }
}

export async function downloadSnapshot(): Promise<Snapshot> {
  const r = await fetch("/api/verify/snapshot", { cache: "no-store" });
  if (!r.ok) throw new Error("snapshot_failed");
  const s = await r.json();
  const verified = await verifySig(s);
  if (verified === false) throw new Error("bad_signature");
  const snap = { ...s, savedAt: new Date().toISOString(), verified };
  store.set(SNAP, snap);
  return snap;
}

export const loadSnapshot = () => store.get<Snapshot>(SNAP);

export async function offlineLookup(raw: string, gate: Gate | undefined, snap: Snapshot) {
  if ((await verifySig(snap)) === false) return { found: false as const, reason: "bad_snapshot" as const };
  const body = JSON.parse(snap.body) as SnapBody;
  if (new Date(body.expiresAt) < new Date()) return { found: false as const, reason: "snapshot_expired" as const };
  const s = raw.trim();
  let p: SnapPermit | undefined;
  let codeType: "static" | "rotating" = "static";
  let printedVersion: number | null = null;
  const rot = s.match(/^SSH1:R:(PRM-\d{4}-\d{6}):(\d+):([0-9a-f]{12})$/);
  if (rot) {
    codeType = "rotating";
    p = body.permits.find((x) => x.n === rot[1]);
    if (p) {
      const key = await crypto.subtle.importKey("raw", enc.encode(p.rs), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const w = Number(rot[2]);
      const now = Math.floor(Date.now() / 1000 / 30);
      const expect = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${p.n}:${w}`))).slice(0, 12);
      if (Math.abs(now - w) > 1 || expect !== rot[3]) return { found: false as const, reason: "rotating_expired" as const, number: p.n };
    }
  } else {
    const st = s.match(/\/v\/([A-Za-z0-9_-]{43})(?:\.(\d+))?$/) || s.match(/^([A-Za-z0-9_-]{43})(?:\.(\d+))?$/);
    if (!st) return { found: false as const, reason: "invalid" as const };
    printedVersion = st[2] ? Number(st[2]) : null;
    const th = hex(await crypto.subtle.digest("SHA-256", enc.encode(st[1])));
    p = body.permits.find((x) => x.th === th);
  }
  if (!p) return { found: false as const, reason: "not_found" as const };
  const now = new Date();
  const status = p.s === "suspended" ? "suspended" : p.s === "revoked" ? "revoked" : now < new Date(p.f) ? "not_started" : now > new Date(p.t) ? "expired" : "valid";
  const zones = body.zones.filter((z) => p!.z.includes(z.id)).map((z) => ({ ...z, atGate: !!gate?.zone_ids.includes(z.id) }));
  const inScope = zones.some((z) => z.atGate);
  return {
    found: true as const,
    offline: true,
    codeType,
    status,
    number: p.n,
    version: p.v,
    printedVersion,
    pendingAmendment: null,
    statusReason: null,
    org: p.o,
    purpose: "",
    validFrom: p.f,
    validTo: p.t,
    zones,
    inScope,
    people: p.pp.map(([name, id]) => ({ name, id })),
    vehicles: p.vh.map(([plate, type]) => ({ plate, type })),
    equipment: p.eq.map(([name, qty]) => ({ name, qty })),
    repName: p.rn,
    repPhoneMasked: "",
    canAllow: status === "valid" && inScope,
    snapshotAt: snap.savedAt,
  };
}

export type QueueItem = { clientId: string; number: string | null; codeType: string; status: string; gateId: number; at: string; decision: "allowed" | "denied" | null; denyReason?: string; matched?: unknown };

export function enqueue(it: QueueItem) {
  const q = store.get<QueueItem[]>(QUEUE) ?? [];
  q.push(it);
  store.set(QUEUE, q);
}
export const queued = () => store.get<QueueItem[]>(QUEUE) ?? [];

export async function flushQueue() {
  const items = queued();
  if (!items.length) return 0;
  const r = await fetch("/api/verify/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
  if (!r.ok) throw new Error("sync_failed");
  store.set(QUEUE, []);
  return items.length;
}
