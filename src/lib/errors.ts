import "server-only";
import { q, q1 } from "./db";
import { sha256 } from "./crypto";

/* ─────────────────────────────────────────────────────────────
   Technical error log (separate from the business audit log).
   - Server errors arrive from instrumentation.onRequestError.
   - Browser errors arrive from /api/errors (ClientErrorReporter + error boundaries).
   Repeats are grouped by fingerprint so one bug = one row with a counter.
   Messages are scrubbed: long digit runs (IDs, phones), e-mails and tokens are masked.
   Logging must never throw — a failing logger must not break the request.
   ───────────────────────────────────────────────────────────── */

export type ErrorInput = {
  level?: "error" | "warning";
  source: "server" | "client" | "api" | "action" | "render";
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  digest?: string | null;
  userAgent?: string | null;
  actor?: string | null;
};

export function scrub(s: string) {
  return s
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\b\d{8,}\b/g, (m) => "•".repeat(m.length - 3) + m.slice(-3));
}

const clip = (s: string | null | undefined, n: number) => (s ? scrub(String(s)).slice(0, n) : null);

/** Normalise a path so /apply/r/12 and /apply/r/13 group together. */
const normPath = (p: string | null | undefined) => (p ? p.split("?")[0].replace(/\/\d+(?=\/|$)/g, "/:id").slice(0, 200) : null);

export async function logError(e: ErrorInput) {
  try {
    const message = clip(e.message, 600) || "Unknown error";
    const stack = clip(e.stack, 4000);
    const path = normPath(e.path);
    const top = (stack ?? "").split("\n").find((l) => l.trim().startsWith("at ")) ?? "";
    const fp = sha256([e.source, message.replace(/\d+/g, "#"), top.trim(), path].join("|")).slice(0, 24);
    await q(
      `INSERT INTO error_log(fingerprint,level,source,message,stack,path,method,digest,user_agent,actor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (fingerprint) DO UPDATE SET count = error_log.count + 1, last_at = now(), resolved = false,
         digest = coalesce(EXCLUDED.digest, error_log.digest), stack = coalesce(EXCLUDED.stack, error_log.stack)`,
      [fp, e.level ?? "error", e.source, message, stack, path, clip(e.method, 10), clip(e.digest, 40), clip(e.userAgent, 200), clip(e.actor, 60)],
    );
  } catch (err) {
    console.error("[error-log] failed to record", err);
  }
}

export type ErrorRow = { id: number; level: string; source: string; message: string; stack: string | null; path: string | null; method: string | null; digest: string | null; user_agent: string | null; actor: string | null; count: number; first_at: Date; last_at: Date; resolved: boolean; resolved_by: string | null; resolved_at: Date | null };

export async function listErrors(f: { status?: string; source?: string; q?: string }) {
  const where: string[] = [];
  const p: unknown[] = [];
  if (f.status === "open") where.push("resolved = false");
  if (f.status === "resolved") where.push("resolved = true");
  if (f.source && ["server", "client", "api", "action", "render"].includes(f.source)) { p.push(f.source); where.push(`source = $${p.length}`); }
  if (f.q) { p.push(`%${f.q.slice(0, 80)}%`); where.push(`(message ILIKE $${p.length} OR path ILIKE $${p.length} OR digest ILIKE $${p.length})`); }
  return q<ErrorRow>(`SELECT * FROM error_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY resolved, last_at DESC LIMIT 300`, p);
}

export async function errorStats() {
  return (await q1<{ open: number; today: number; occurrences24: number; total: number; client: number; server: number }>(
    `SELECT count(*) FILTER (WHERE NOT resolved)::int open,
            count(*) FILTER (WHERE first_at >= now() - interval '24 hours')::int today,
            coalesce(sum(count) FILTER (WHERE last_at >= now() - interval '24 hours'),0)::int occurrences24,
            count(*)::int total,
            count(*) FILTER (WHERE NOT resolved AND source='client')::int client,
            count(*) FILTER (WHERE NOT resolved AND source<>'client')::int server
     FROM error_log`,
  ))!;
}

export async function setResolved(id: number, resolved: boolean, by: string) {
  await q(`UPDATE error_log SET resolved=$2, resolved_by=CASE WHEN $2 THEN $3 ELSE NULL END, resolved_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1`, [id, resolved, by]);
}
