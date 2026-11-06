import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q, q1 } from "./db";
import { hmac, otpCode, randomToken, safeEqual, sha256, verifyPassword } from "./crypto";
import { getSetting } from "./settings";
import { audit } from "./audit";
import { sendMessage } from "./notify";

import { can, type Cap, type Role } from "./rbac";
export type { Role };
export type StaffUser = { id: number; username: string; name: string; roles: Role[]; agency: string | null };

const STAFF_COOKIE = "vp_staff";
const APP_COOKIE = "vp_app";
const STAFF_IDLE_MIN = 60;
const APP_SESSION_HOURS = 2;

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/* ───────── Staff ───────── */

export async function staffLogin(username: string, password: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "locked" }> {
  const u = await q1<{ id: number; password_hash: string; active: boolean; failed_attempts: number; locked_until: Date | null }>(
    `SELECT id,password_hash,active,failed_attempts,locked_until FROM users WHERE lower(username)=lower($1)`,
    [username.trim()],
  );
  if (!u || !u.active) {
    await audit(`anon`, "staff.login_failed", "user", null, { username });
    return { ok: false, error: "invalid" };
  }
  if (u.locked_until && new Date(u.locked_until) > new Date()) return { ok: false, error: "locked" };
  if (!(await verifyPassword(password, u.password_hash))) {
    const failed = u.failed_attempts + 1;
    const lock = failed >= 5;
    await q(`UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1`, [
      u.id,
      lock ? 0 : failed,
      lock ? new Date(Date.now() + 15 * 60_000) : null,
    ]);
    await audit(`user:${u.id}`, lock ? "staff.locked" : "staff.login_failed", "user", u.id);
    return { ok: false, error: lock ? "locked" : "invalid" };
  }
  await q(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1`, [u.id]);
  const token = randomToken();
  await q(`INSERT INTO sessions(token_hash,kind,user_id,expires_at,idle_minutes) VALUES ($1,'staff',$2,$3,$4)`, [
    sha256(token),
    u.id,
    new Date(Date.now() + 12 * 3600_000),
    STAFF_IDLE_MIN,
  ]);
  (await cookies()).set(STAFF_COOKIE, token, cookieOpts(12 * 3600));
  await audit(`user:${u.id}`, "staff.login", "user", u.id);
  return { ok: true };
}

/** Demo simulation only: open a staff session for a seeded user without a password. Refuses outside demo mode. */
export async function startDemoStaffSession(userId: number) {
  if (!(await getSetting("demo_mode"))) throw new Error("demo_disabled");
  const token = randomToken();
  await q(`INSERT INTO sessions(token_hash,kind,user_id,expires_at,idle_minutes) VALUES ($1,'staff',$2,$3,$4)`, [
    sha256(token),
    userId,
    new Date(Date.now() + 2 * 3600_000),
    STAFF_IDLE_MIN,
  ]);
  (await cookies()).set(STAFF_COOKIE, token, cookieOpts(2 * 3600));
  await audit(`user:${userId}`, "staff.demo_session");
}

export async function getStaff(): Promise<StaffUser | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const s = await q1<StaffUser & { last_seen: Date; idle_minutes: number; expires_at: Date }>(
    `SELECT u.id,u.username,u.name,u.roles,u.agency,s.last_seen,s.idle_minutes,s.expires_at
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.kind='staff' AND u.active`,
    [sha256(token)],
  );
  if (!s) return null;
  const now = Date.now();
  if (new Date(s.expires_at).getTime() < now || now - new Date(s.last_seen).getTime() > s.idle_minutes * 60_000) {
    await q(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
    return null;
  }
  await q(`UPDATE sessions SET last_seen=now() WHERE token_hash=$1`, [sha256(token)]);
  return { id: s.id, username: s.username, name: s.name, roles: s.roles, agency: s.agency };
}

export async function requireStaff(): Promise<StaffUser> {
  const u = await getStaff();
  if (!u) redirect("/staff/login");
  return u;
}

/** Page/action guard: signed-in staff holding this capability (lib/rbac.ts). Otherwise an explained "no access" page. */
export async function requireCap(cap: Cap): Promise<StaffUser> {
  const u = await requireStaff();
  if (!can(u, cap)) redirect(`/staff/denied?need=${cap}`);
  return u;
}

/** Strict role check — no implicit admin bypass (least privilege). Prefer can(u, cap). */
export const hasRole = (u: StaffUser, ...roles: Role[]) => roles.some((r) => u.roles.includes(r));

export async function logout(kind: "staff" | "applicant") {
  const c = await cookies();
  const name = kind === "staff" ? STAFF_COOKIE : APP_COOKIE;
  const token = c.get(name)?.value;
  if (token) await q(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
  c.delete(name);
}

/* ───────── Applicants (OTP, no permanent account) ───────── */

export async function getApplicant(): Promise<string | null> {
  const token = (await cookies()).get(APP_COOKIE)?.value;
  if (!token) return null;
  const s = await q1<{ contact: string; expires_at: Date }>(
    `SELECT contact,expires_at FROM sessions WHERE token_hash=$1 AND kind='applicant'`,
    [sha256(token)],
  );
  if (!s || new Date(s.expires_at) < new Date()) return null;
  return s.contact;
}

export async function requireApplicant(): Promise<string> {
  const c = await getApplicant();
  if (!c) redirect("/apply/login");
  return c;
}

export async function startApplicantSession(contact: string) {
  const token = randomToken();
  await q(`INSERT INTO sessions(token_hash,kind,contact,expires_at) VALUES ($1,'applicant',$2,$3)`, [
    sha256(token),
    contact,
    new Date(Date.now() + APP_SESSION_HOURS * 3600_000),
  ]);
  (await cookies()).set(APP_COOKIE, token, cookieOpts(APP_SESSION_HOURS * 3600));
  await audit(`applicant:${contact}`, "applicant.login");
}

/* ───────── One-time codes ───────── */

export type OtpPurpose = "login" | "rep_entry";
export type OtpError = "cooldown" | "hourly_limit";

export async function sendOtp(
  purpose: OtpPurpose,
  target: string,
  opts: { ttlMin: number; text: (code: string) => string; meta?: unknown },
): Promise<{ ok: true; id: number } | { ok: false; error: OtpError; wait?: number }> {
  const recent = await q<{ created_at: Date }>(
    `SELECT created_at FROM otps WHERE target=$1 AND created_at > now() - interval '1 hour' ORDER BY created_at DESC`,
    [target],
  );
  if (recent[0]) {
    const since = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (since < 30) return { ok: false, error: "cooldown", wait: Math.ceil(30 - since) };
  }
  if (recent.length >= 8) return { ok: false, error: "hourly_limit" };
  const code = otpCode(6);
  const secret = await getSetting("hmac_secret");
  const r = await q1<{ id: number }>(
    `INSERT INTO otps(purpose,target,code_hmac,expires_at,meta) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [purpose, target, hmac(secret, `${purpose}:${target}:${code}`), new Date(Date.now() + opts.ttlMin * 60_000), JSON.stringify(opts.meta ?? null)],
  );
  await sendMessage(target, opts.text(code));
  return { ok: true, id: r!.id };
}

export async function checkOtp(
  purpose: OtpPurpose,
  target: string,
  code: string,
): Promise<{ ok: true; meta: unknown } | { ok: false; error: "expired" | "wrong" | "too_many" }> {
  const o = await q1<{ id: number; code_hmac: string; expires_at: Date; attempts: number; meta: unknown }>(
    `SELECT id,code_hmac,expires_at,attempts,meta FROM otps WHERE target=$1 AND purpose=$2 AND NOT consumed ORDER BY id DESC LIMIT 1`,
    [target, purpose],
  );
  if (!o || new Date(o.expires_at) < new Date()) return { ok: false, error: "expired" };
  if (o.attempts >= 5) return { ok: false, error: "too_many" };
  const secret = await getSetting("hmac_secret");
  if (!safeEqual(o.code_hmac, hmac(secret, `${purpose}:${target}:${code.trim()}`))) {
    await q(`UPDATE otps SET attempts=attempts+1 WHERE id=$1`, [o.id]);
    return { ok: false, error: o.attempts + 1 >= 5 ? "too_many" : "wrong" };
  }
  await q(`UPDATE otps SET consumed=true WHERE id=$1`, [o.id]);
  return { ok: true, meta: o.meta };
}

export function normalizeContact(raw: string): { kind: "phone" | "email"; value: string } | null {
  const s = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { kind: "email", value: s };
  const digits = s.replace(/[\s-]/g, "").replace(/^\+?966/, "0").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (/^05\d{8}$/.test(digits)) return { kind: "phone", value: digits };
  return null;
}
