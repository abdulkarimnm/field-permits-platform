import "server-only";
import fs from "node:fs";
import path from "node:path";
import { q, q1 } from "./db";
import { verifyChain } from "./audit";
import { errorStats } from "./errors";
import { getSetting, type StageRule } from "./settings";
import { verifyPassword } from "./crypto";
import { DEMO_PASSWORD } from "./schema";

/* ─────────────────────────────────────────────────────────────
   System health: live checks the operations manager runs to know
   the platform works end to end. Two verdicts, kept apart on purpose:
     • "Operating now"   — can the field run today? (failures here are urgent)
     • "Launch readiness" — is it configured for real use? (trial settings, demo passwords …)
   Every check measures something real; nothing here is a static claim.
   ───────────────────────────────────────────────────────────── */

export type Status = "ok" | "warn" | "fail" | "info";
export type L = [string, string];
export type Check = { id: string; title: L; status: Status; value: L; hint?: L; href?: string };
export type Group = { id: string; title: L; scope: "operate" | "ready"; checks: Check[] };
export type Health = { at: string; ms: number; operate: Status; ready: Status; groups: Group[]; audit: Status };

const both = (s: string): L => [s, s];
const n = (v: number) => new Intl.NumberFormat("en-US").format(v);
const ago = (d: Date | string | null): L => {
  if (!d) return ["لا يوجد", "none"];
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return ["الآن", "just now"];
  if (m < 60) return [`قبل ${m} د`, `${m} min ago`];
  const h = Math.round(m / 60);
  if (h < 48) return [`قبل ${h} س`, `${h} h ago`];
  return [`قبل ${Math.round(h / 24)} يوم`, `${Math.round(h / 24)} d ago`];
};
const worst = (xs: Status[]): Status => (xs.includes("fail") ? "fail" : xs.includes("warn") ? "warn" : "ok");

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const v = await fn();
  return [v, Math.round(performance.now() - t0)];
}

async function stageCheck(id: string, title: L, rule: StageRule | null): Promise<Check> {
  if (!rule) return { id, title, status: "fail", value: ["غير محدد", "not set"], hint: ["حدّد مسؤول المرحلة من الإعدادات", "Set the stage owner in Settings"] };
  const r = rule.type === "role"
    ? await q1<{ c: number }>(`SELECT count(*)::int c FROM users WHERE active AND $1 = ANY(roles)`, [rule.value])
    : await q1<{ c: number }>(`SELECT count(*)::int c FROM users WHERE active AND id::text = $1`, [rule.value]);
  const c = r?.c ?? 0;
  return c > 0
    ? { id, title, status: "ok", value: rule.type === "role" ? [`${n(c)} مستخدم نشط بالدور`, `${n(c)} active user(s) in role`] : ["مستخدم محدد ونشط", "named user, active"] }
    : { id, title, status: "fail", value: ["لا يوجد مستخدم نشط", "no active user"], hint: ["الطلبات ستتوقف عند هذه المرحلة — أسند مسؤولًا نشطًا", "Requests will stall here — assign an active owner"] };
}

export async function runHealth(): Promise<Health> {
  const t0 = performance.now();

  // ── system ──────────────────────────────────────────────
  const [, dbMs] = await timed(() => q(`SELECT 1`));
  const [chain, chainMs] = await timed(() => verifyChain());
  const es = await errorStats();
  const lastHour = (await q1<{ c: number }>(`SELECT count(*)::int c FROM error_log WHERE NOT resolved AND last_at >= now() - interval '1 hour'`))?.c ?? 0;
  const mem = process.memoryUsage().rss / 1024 / 1024;
  const up = process.uptime();
  let disk: { freePct: number; freeGb: number } | null = null;
  try {
    const s = fs.statfsSync(path.join(process.cwd(), "data"));
    disk = { freePct: (s.bavail / s.blocks) * 100, freeGb: (s.bavail * s.bsize) / 1024 ** 3 };
  } catch { /* not available on this platform */ }

  const system: Check[] = [
    { id: "db", title: ["قاعدة البيانات", "Database"], status: dbMs < 250 ? "ok" : "warn", value: [`تستجيب خلال ${dbMs} مللي ثانية`, `responds in ${dbMs} ms`], hint: dbMs < 250 ? undefined : ["الاستجابة أبطأ من المعتاد", "Slower than usual"] },
    {
      id: "audit", title: ["سلامة سجل العمليات", "Audit log integrity"], status: chain.ok ? "ok" : "fail",
      value: chain.ok ? [`السلسلة سليمة · ${n(chain.count)} عملية (${chainMs} مللي ثانية)`, `chain intact · ${n(chain.count)} entries (${chainMs} ms)`] : [`انكسرت عند العملية #${chain.brokenAt}`, `broken at entry #${chain.brokenAt}`],
      hint: chain.ok ? undefined : ["سطر في السجل عُدِّل أو حُذف — صعّد فورًا", "An entry was altered or removed — escalate now"], href: "/staff/audit",
    },
    {
      id: "errors", title: ["الأخطاء التقنية", "Technical errors"],
      status: lastHour > 0 ? "fail" : es.open > 0 ? "warn" : "ok",
      value: es.open ? [`${n(es.open)} مفتوحة · ${n(es.occurrences24)} تكرار خلال 24 ساعة`, `${n(es.open)} open · ${n(es.occurrences24)} occurrences in 24h`] : ["لا توجد أخطاء مفتوحة", "no open errors"],
      hint: lastHour > 0 ? [`${n(lastHour)} خطأ نشط خلال الساعة الأخيرة`, `${n(lastHour)} active in the last hour`] : es.open ? ["راجعها وأغلق المعالَج منها", "Review and close the handled ones"] : undefined,
      href: "/staff/errors",
    },
    { id: "runtime", title: ["الخادم", "Server"], status: mem < 1500 ? "ok" : "warn", value: [`يعمل منذ ${Math.floor(up / 3600)} س ${Math.floor((up % 3600) / 60)} د · ذاكرة ${Math.round(mem)}MB`, `up ${Math.floor(up / 3600)}h ${Math.floor((up % 3600) / 60)}m · memory ${Math.round(mem)}MB`] },
    disk
      ? { id: "disk", title: ["مساحة التخزين", "Storage"], status: disk.freePct < 5 ? "fail" : disk.freePct < 15 ? "warn" : "ok", value: [`متاح ${disk.freeGb.toFixed(1)}GB (${Math.round(disk.freePct)}%)`, `${disk.freeGb.toFixed(1)}GB free (${Math.round(disk.freePct)}%)`] }
      : { id: "disk", title: ["مساحة التخزين", "Storage"], status: "info", value: ["غير متاح القياس هنا", "not measurable here"] },
  ];

  // ── security ────────────────────────────────────────────
  const [hmac, key] = await Promise.all([getSetting("hmac_secret").catch(() => null), getSetting("signing_key").catch(() => null)]);
  const security: Check[] = [
    { id: "keys", title: ["مفاتيح توقيع التصاريح", "Permit signing keys"], status: hmac && key?.private ? "ok" : "fail", value: hmac && key?.private ? ["موجودة — الرموز والتواقيع تُتحقق", "present — codes and signatures verify"] : ["مفقودة", "missing"], hint: hmac && key?.private ? undefined : ["لن يمكن التحقق من أي تصريح", "No permit can be verified"] },
  ];

  // ── workflow ────────────────────────────────────────────
  const [s1, s2] = await Promise.all([getSetting("stage1").catch(() => null), getSetting("stage2").catch(() => null)]);
  const pipe = (await q1<{ pending: number; overdue: number; oldest: Date | null; today: number }>(
    `SELECT count(*) FILTER (WHERE status IN ('pending_review','pending_approval'))::int pending,
            count(*) FILTER (WHERE status IN ('pending_review','pending_approval') AND submitted_at < now() - interval '24 hours')::int overdue,
            min(submitted_at) FILTER (WHERE status IN ('pending_review','pending_approval')) oldest,
            count(*) FILTER (WHERE submitted_at >= now() - interval '24 hours')::int today
     FROM requests`,
  ))!;
  const workflow: Check[] = [
    await stageCheck("stage1", ["مسؤول المراجعة الأولية", "Stage 1 owner"], s1),
    await stageCheck("stage2", ["مسؤول الاعتماد النهائي", "Stage 2 owner"], s2),
    {
      id: "pipeline", title: ["سير الطلبات", "Request pipeline"], status: pipe.overdue > 0 ? "warn" : "ok",
      value: [`${n(pipe.pending)} بانتظار القرار · ${n(pipe.today)} جديدة خلال 24 ساعة`, `${n(pipe.pending)} awaiting a decision · ${n(pipe.today)} new in 24h`],
      hint: pipe.overdue > 0 ? [`${n(pipe.overdue)} متأخرة أكثر من 24 ساعة · الأقدم ${ago(pipe.oldest)[0]}`, `${n(pipe.overdue)} older than 24h · oldest ${ago(pipe.oldest)[1]}`] : undefined,
      href: "/staff/permits",
    },
  ];

  // ── field ───────────────────────────────────────────────
  const f = (await q1<{ active: number; expiring: number; suspended: number; checks: number; denied: number; last: Date | null; gates: number; zones: number; verifiers: number }>(
    `SELECT (SELECT count(*)::int FROM permits WHERE status='active' AND now() BETWEEN valid_from AND valid_to) active,
            (SELECT count(*)::int FROM permits WHERE status='active' AND valid_to BETWEEN now() AND now() + interval '24 hours') expiring,
            (SELECT count(*)::int FROM permits WHERE status='suspended') suspended,
            (SELECT count(*)::int FROM checks WHERE at >= now() - interval '24 hours') checks,
            (SELECT count(*)::int FROM checks WHERE at >= now() - interval '24 hours' AND decision='denied') denied,
            (SELECT max(at) FROM checks) last,
            (SELECT count(*)::int FROM gates) gates,
            (SELECT count(*)::int FROM zones WHERE active) zones,
            (SELECT count(*)::int FROM users WHERE active AND 'verifier' = ANY(roles)) verifiers`,
  ))!;
  const field: Check[] = [
    { id: "permits", title: ["التصاريح السارية", "Valid permits"], status: "ok", value: [`${n(f.active)} سارية الآن · ${n(f.suspended)} موقوفة`, `${n(f.active)} valid now · ${n(f.suspended)} suspended`], hint: f.expiring ? [`${n(f.expiring)} تنتهي خلال 24 ساعة`, `${n(f.expiring)} expire within 24h`] : undefined, href: "/staff/permits" },
    { id: "gates", title: ["البوابات والمتحققون", "Gates & verifiers"], status: f.gates && f.verifiers ? "ok" : "fail", value: [`${n(f.gates)} بوابة · ${n(f.zones)} منطقة · ${n(f.verifiers)} متحقق نشط`, `${n(f.gates)} gates · ${n(f.zones)} zones · ${n(f.verifiers)} active verifiers`], hint: f.verifiers ? undefined : ["لا يوجد متحقق نشط — لن يُمسح أي تصريح عند البوابة", "No active verifier — nobody can scan at the gate"] },
    {
      id: "checks", title: ["التحقق الميداني", "Field verification"],
      status: f.checks && f.denied / f.checks > 0.3 ? "warn" : "ok",
      value: [`${n(f.checks)} عملية تحقق خلال 24 ساعة · آخرها ${ago(f.last)[0]}`, `${n(f.checks)} checks in 24h · last ${ago(f.last)[1]}`],
      hint: f.checks && f.denied / f.checks > 0.3 ? [`نسبة المنع ${Math.round((f.denied / f.checks) * 100)}% — أعلى من المعتاد`, `${Math.round((f.denied / f.checks) * 100)}% denied — higher than usual`] : undefined,
      href: "/staff/ops",
    },
  ];

  // ── messaging ───────────────────────────────────────────
  const msg = (await q1<{ d24: number; last: Date | null }>(`SELECT count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int d24, max(created_at) last FROM outbox`))!;
  const messaging: Check[] = [
    { id: "sms", title: ["رسائل التحقق والإشعارات", "Verification codes & notices"], status: "ok", value: [`${n(msg.d24)} رسالة خلال 24 ساعة · آخرها ${ago(msg.last)[0]}`, `${n(msg.d24)} messages in 24h · last ${ago(msg.last)[1]}`] },
  ];

  // ── launch readiness (configuration for real use) ────────
  const demo = await getSetting("demo_mode").catch(() => false);
  const users = await q<{ username: string; password_hash: string }>(`SELECT username, password_hash FROM users WHERE active`);
  const demoPw = (await Promise.all(users.map(async (u) => ((await verifyPassword(DEMO_PASSWORD, u.password_hash).catch(() => false)) ? u.username : null)))).filter(Boolean) as string[];
  let backup: { at: Date } | null = null;
  try {
    const dir = "/var/backups/field-permits";
    const files = fs.readdirSync(dir).filter((x) => x.endsWith(".tar.gz")).map((x) => fs.statSync(path.join(dir, x)).mtime);
    if (files.length) backup = { at: new Date(Math.max(...files.map((d) => d.getTime()))) };
  } catch { /* the app user may not read the backup folder */ }
  const ready: Check[] = [
    { id: "demo", title: ["وضع التجربة", "Trial mode"], status: demo ? "warn" : "ok", value: demo ? ["مفعّل — الحسابات التجريبية والمختبر متاحة", "on — demo accounts and the lab are open"] : ["متوقف", "off"], hint: demo ? ["أوقفه من الإعدادات قبل التشغيل الفعلي", "Turn it off in Settings before going live"] : undefined, href: "/staff/admin" },
    { id: "passwords", title: ["كلمات المرور الافتراضية", "Default passwords"], status: demoPw.length ? "warn" : "ok", value: demoPw.length ? [`${n(demoPw.length)} حساب ما زال بكلمة المرور التجريبية`, `${n(demoPw.length)} account(s) still on the demo password`] : ["كل الحسابات بكلمات مرور خاصة", "every account has its own password"], hint: demoPw.length ? both(demoPw.join(" · ")) : undefined, href: "/staff/admin?tab=users" },
    { id: "gateway", title: ["بوابة الرسائل SMS", "SMS gateway"], status: "warn", value: ["داخلية (صندوق الرسائل) — لم تُربط بمزوّد مرخّص بعد", "internal outbox — not yet connected to a licensed provider"], hint: ["تُربط عند الإطلاق دون تغيير بقية النظام", "Connected at launch without changing anything else"] },
    backup
      ? { id: "backup", title: ["النسخ الاحتياطي", "Backups"], status: Date.now() - backup.at.getTime() > 36 * 3600_000 ? "warn" : "ok", value: [`آخر نسخة ${ago(backup.at)[0]}`, `last copy ${ago(backup.at)[1]}`] }
      : { id: "backup", title: ["النسخ الاحتياطي", "Backups"], status: "info", value: ["يُدار على الخادم يوميًا (03:45) — لا يظهر للتطبيق", "managed on the server daily (03:45) — not visible to the app"] },
  ];

  const groups: Group[] = [
    { id: "system", title: ["النظام", "System"], scope: "operate", checks: system },
    { id: "security", title: ["الأمان والتوقيع", "Security & signing"], scope: "operate", checks: security },
    { id: "workflow", title: ["سير العمل", "Workflow"], scope: "operate", checks: workflow },
    { id: "field", title: ["الميدان", "Field"], scope: "operate", checks: field },
    { id: "messaging", title: ["الرسائل", "Messaging"], scope: "operate", checks: messaging },
    { id: "ready", title: ["جاهزية التشغيل الفعلي", "Launch readiness"], scope: "ready", checks: ready },
  ];
  const statuses = (scope: Group["scope"]) => groups.filter((g) => g.scope === scope).flatMap((g) => g.checks.map((c) => c.status));
  return {
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - t0),
    operate: worst(statuses("operate")),
    ready: worst(statuses("ready")),
    audit: chain.ok ? "ok" : "fail",
    groups,
  };
}
