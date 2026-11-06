import "server-only";
import { q, tx, type Exec } from "./db";
import { sha256 } from "./crypto";

const GENESIS = "0".repeat(64);

// jsonb reorders object keys, so hash a canonical (sorted-key) form.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v;
}

function digest(prev: string, e: { at: string; actor: string; action: string; entity: string | null; entity_id: string | null; data: unknown }) {
  return sha256(prev + JSON.stringify(canon([e.at, e.actor, e.action, e.entity, e.entity_id, e.data ?? null])));
}

/**
 * Append-only, hash-chained audit log. Each entry's hash covers the previous hash,
 * so editing or deleting any past row breaks the chain and is detected by verifyChain().
 */
export async function audit(
  actor: string,
  action: string,
  entity: string | null = null,
  entityId: string | number | null = null,
  data: unknown = null,
  e?: Exec,
) {
  const run = async (x: Exec) => {
    await x.query(`SELECT pg_advisory_xact_lock(424242)`);
    const last = await x.query<{ hash: string }>(`SELECT hash FROM audit ORDER BY id DESC LIMIT 1`);
    const prev = last[0]?.hash ?? GENESIS;
    const entry = { at: new Date().toISOString(), actor, action, entity, entity_id: entityId == null ? null : String(entityId), data: data ?? null };
    const hash = digest(prev, entry);
    await x.query(
      `INSERT INTO audit(at,actor,action,entity,entity_id,data,prev_hash,hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entry.at, actor, action, entity, entry.entity_id, JSON.stringify(entry.data), prev, hash],
    );
  };
  if (e) return run(e);
  return tx(run);
}

export async function verifyChain(): Promise<{ ok: boolean; count: number; brokenAt?: number }> {
  const rows = await q<{ id: number; at: string; actor: string; action: string; entity: string | null; entity_id: string | null; data: unknown; prev_hash: string; hash: string }>(
    `SELECT * FROM audit ORDER BY id`,
  );
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prev_hash !== prev || digest(prev, r) !== r.hash) return { ok: false, count: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
