import "server-only";
import path from "node:path";
import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Database adapter.
 * - No DATABASE_URL → embedded PostgreSQL (PGlite) stored in ./data/pglite (development / internal trial).
 * - DATABASE_URL set → real PostgreSQL through `pg` (production).
 * Both expose the same tiny interface: query(sql, params) → rows, and tx(fn).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export interface Exec {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Driver extends Exec {
  tx<T>(fn: (e: Exec) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

type G = typeof globalThis & { __vpDb?: Promise<Driver> };
const g = globalThis as G;

async function makeDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool, types } = await import("pg");
    // numeric/bigint arrive as strings by default; this app only uses them as counts and averages
    types.setTypeParser(1700, (v) => Number(v)); // numeric
    types.setTypeParser(20, (v) => Number(v)); // int8
    const pool = new Pool({ connectionString: url, max: 10 });
    return {
      async exec(sql) {
        await pool.query(sql);
      },
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return r.rows;
      },
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const out = await fn({
            async query(sql, params) {
              return (await c.query(sql, params as unknown[])).rows;
            },
          });
          await c.query("COMMIT");
          return out;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  // numeric (e.g. avg()) arrives as a string by default: parse it, so number methods never crash a page
  const db = new PGlite(dir, { parsers: { 1700: (v: string) => Number(v) } });
  await db.waitReady;
  // PGlite is single-connection: serialize everything through one queue.
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };
  return {
    exec(sql) {
      return run(async () => {
        await db.exec(sql);
      });
    },
    query(sql, params) {
      return run(async () => (await db.query(sql, params as unknown[])).rows as never);
    },
    tx(fn) {
      return run(() =>
        db.transaction(async (t) =>
          fn({
            async query(sql, params) {
              return (await t.query(sql, params as unknown[])).rows as never;
            },
          }),
        ),
      );
    },
  };
}

async function init(): Promise<Driver> {
  const d = await makeDriver();
  const { migrate } = await import("./schema");
  await migrate(d);
  return d;
}

function driver(): Promise<Driver> {
  if (!g.__vpDb) g.__vpDb = init().catch((e) => {
    g.__vpDb = undefined;
    throw e;
  });
  return g.__vpDb;
}

// Inside tx(), every q()/q1()/tx() call reuses the transaction's connection
// (prevents PGlite queue deadlocks and keeps helpers transactional).
const als = new AsyncLocalStorage<Exec>();

export async function q<T = Row>(sql: string, params?: unknown[]): Promise<T[]> {
  const inTx = als.getStore();
  if (inTx) return inTx.query<T>(sql, params);
  return (await driver()).query<T>(sql, params);
}
export async function q1<T = Row>(sql: string, params?: unknown[]): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}
export async function tx<T>(fn: (e: Exec) => Promise<T>): Promise<T> {
  const inTx = als.getStore();
  if (inTx) return fn(inTx);
  return (await driver()).tx((e) => als.run(e, () => fn(e)));
}
