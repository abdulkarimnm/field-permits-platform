import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { Badge } from "@/components/ui";
import { Ticker } from "@/components/fx";
import type { ReactNode } from "react";
import CommandCenter from "./CommandCenter";
import { commandData } from "@/lib/ops";
import AutoRefresh from "@/components/AutoRefresh";
import { requireCap } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { listGates, listZones } from "@/lib/settings";
import { verifyChain } from "@/lib/audit";

const riyadhDayStart = () => {
  const now = new Date(Date.now() + 3 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3600_000);
};

export default async function Ops() {
  const u = await requireCap("ops.view");
  const { t, fmtDate, lang } = await i18n();
  const day = riyadhDayStart();
  const nowH = new Date(Date.now() + 3 * 3600_000);
  const todayStr = nowH.toISOString().slice(0, 10);
  const hour = nowH.getUTCHours();

  const [zones, gates, chain] = await Promise.all([listZones(true), listGates(), verifyChain()]);
  const permits = (await q1<{ valid: number; upcoming: number; suspended: number; revoked: number }>(
    `SELECT count(*) FILTER (WHERE status='active' AND now() BETWEEN valid_from AND valid_to)::int valid,
            count(*) FILTER (WHERE status='active' AND now() < valid_from)::int upcoming,
            count(*) FILTER (WHERE status='suspended')::int suspended,
            count(*) FILTER (WHERE status='revoked')::int revoked FROM permits`,
  ))!;
  const today = (await q1<{ total: number; allowed: number; denied: number; tamper: number; invalid_status: number }>(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE decision='allowed' AND direction='in')::int allowed,
            count(*) FILTER (WHERE decision='denied')::int denied,
            count(*) FILTER (WHERE code_type IN ('invalid','rotating_expired') OR status_at_check IN ('not_found','replay'))::int tamper,
            count(*) FILTER (WHERE status_at_check IN ('expired','suspended','revoked','not_started'))::int invalid_status
     FROM checks WHERE at >= $1`,
    [day],
  ))!;
  const hourly = await q<{ h: number; n: number; denied: number }>(
    `SELECT floor(extract(epoch FROM (at - $1::timestamptz)) / 3600)::int h, count(*)::int n, count(*) FILTER (WHERE decision='denied')::int denied
     FROM checks WHERE at >= $1 GROUP BY 1 ORDER BY 1`,
    [day],
  );
  const byGate = await q<{ gate_id: number; n: number }>(`SELECT gate_id, count(*)::int n FROM checks WHERE at >= $1 GROUP BY 1`, [day]);
  const zoneLoad = await q<{ zone: number; permits: number }>(
    `SELECT z zone, count(*)::int permits FROM permits, unnest(zones) z WHERE status='active' AND now() BETWEEN valid_from AND valid_to GROUP BY 1`,
  );
  const slotLoad = await q<{ zone: number; used: number }>(
    `SELECT z zone, sum(jsonb_array_length(vehicles))::int used FROM requests, unnest(zones) z
     WHERE slot_date=$1 AND slot_hour=$2 AND status IN ('pending_review','pending_approval','approved','returned') GROUP BY 1`,
    [todayStr, hour],
  );
  const kpi = (await q1<{ s1_h: number | null; s2_h: number | null; total_h: number | null; submitted: number; returned: number; rejected: number; amendments: number; issued: number }>(
    `SELECT (avg(extract(epoch FROM stage1_at - submitted_at))/3600)::float8 s1_h,
            (avg(extract(epoch FROM stage2_at - stage1_at))/3600)::float8 s2_h,
            (avg(extract(epoch FROM stage2_at - submitted_at))/3600)::float8 total_h,
            count(*)::int submitted,
            (SELECT count(DISTINCT request_id)::int FROM request_events WHERE action='returned') returned,
            count(*) FILTER (WHERE status='rejected')::int rejected,
            count(*) FILTER (WHERE kind='amendment')::int amendments,
            (SELECT count(*)::int FROM permits) issued
     FROM requests`,
  ))!;
  const reasons = await q<{ reason: string; n: number }>(`SELECT reason, count(*)::int n FROM requests WHERE status='rejected' AND reason IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 3`);
  const otp = (await q1<{ sent: number; ok: number; failed: number }>(
    `SELECT (SELECT count(*)::int FROM otps WHERE purpose='rep_entry') sent,
            count(*) FILTER (WHERE rep_otp='verified')::int ok, count(*) FILTER (WHERE rep_otp LIKE 'failed%')::int failed FROM checks`,
  ))!;
  const feed = await q<{ id: number; at: Date; gate_id: number; status_at_check: string; decision: string | null; code_type: string; number: string | null; org_name: string | null; offline: boolean }>(
    `SELECT c.id,c.at,c.gate_id,c.status_at_check,c.decision,c.code_type,c.offline,p.number,p.org_name FROM checks c LEFT JOIN permits p ON p.id=c.permit_id ORDER BY c.id DESC LIMIT 12`,
  );

  const cmd = await commandData();

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const hrs = (raw: number | string | null) => { const v = raw == null ? NaN : Number(raw); return !Number.isFinite(v) ? "—" : v < 1 ? `${Math.round(v * 60)}${t("د", "m")}` : `${v.toFixed(1)}${t("س", "h")}`; };
  const maxH = Math.max(1, ...hourly.map((h) => h.n));
  const gateName = (id: number) => {
    const g = gates.find((x) => x.id === id);
    return g ? t(g.name_ar, g.name_en) : "—";
  };

  const Stat = ({ k, v, tone, sub }: { k: string; v: ReactNode; tone?: string; sub?: ReactNode }) => (
    <div className="spot rounded-2xl border border-white/10 bg-white/[.04] p-4 backdrop-blur">
      <p className="text-xs text-cream/55">{k}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${tone ?? "text-white"}`}>{typeof v === "number" ? <Ticker value={v} /> : <span className="num">{v}</span>}</p>
      {sub && <p className="mt-1 text-xs text-cream/50">{sub}</p>}
    </div>
  );

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/ops" user={u.name} kind="staff" wide dark>
      <AutoRefresh seconds={5} />
      <OpsTitle
        title={t("غرفة العمليات", "Operations room")}
        sub={t("مباشر · تتحدث كل 5 ثوانٍ من سجلات النظام", "Live · refreshes every 5 seconds from system records")}
        action={
          <div className="flex flex-wrap items-center gap-2">
          <Link href="/staff/ops/screen" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gold-soft px-3.5 text-sm font-bold text-noir transition hover:brightness-105">
            ▣ {t("شاشة العرض للمراقبة", "Wall screen")}
          </Link>
          <Link href="/staff/audit">
            <Badge tone={chain.ok ? "ok" : "bad"}>{chain.ok ? t(`سلسلة السجل سليمة · ${chain.count}`, `Audit chain intact · ${chain.count}`) : t("تحذير: تلاعب في السجل!", "WARNING: audit tampering!")}</Badge>
          </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat k={t("تصاريح سارية الآن", "Valid now")} v={permits.valid} tone="text-[#7fd1a6]" />
        <Stat k={t("تبدأ لاحقًا", "Upcoming")} v={permits.upcoming} tone="text-gold-soft" />
        <Stat k={t("موقوفة", "Suspended")} v={permits.suspended} tone="text-[#f0a46a]" />
        <Stat k={t("تحققات اليوم", "Checks today")} v={today.total} sub={`${today.allowed} ${t("سماح", "allowed")} · ${today.denied} ${t("منع", "denied")}`} />
        <Stat k={t("نسبة منع الدخول", "Denial rate")} v={`${pct(today.denied, today.allowed + today.denied)}%`} />
        <Stat k={t("محاولات مشبوهة اليوم", "Suspicious today")} v={today.tamper + today.invalid_status} tone={today.tamper ? "text-[#f3897f]" : "text-white"} sub={`${today.tamper} ${t("رمز مزيف/قديم", "fake/stale")} · ${today.invalid_status} ${t("تصريح غير سارٍ", "invalid permit")}`} />
      </div>

      <div className="mt-5">
        <CommandCenter data={cmd} lang={lang} />
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-bold text-white">{t("مؤشرات قياس النجاح", "Success metrics")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k={t("متوسط زمن المعالجة", "Avg processing time")} v={hrs(kpi.total_h)} sub={`${t("مراجعة أولية", "Stage 1")} ${hrs(kpi.s1_h)} · ${t("اعتماد نهائي", "Stage 2")} ${hrs(kpi.s2_h)}`} />
        <Stat k={t("نسبة الطلبات المعادة للاستكمال", "Returned for completion")} v={`${pct(kpi.returned, kpi.submitted)}%`} sub={t("تكشف وضوح النموذج والمستندات", "Reveals form & document clarity")} />
        <Stat k={t("نسبة الرفض", "Rejection rate")} v={`${pct(kpi.rejected, kpi.submitted)}%`} sub={reasons.length ? reasons.map((r) => `${r.reason.slice(0, 24)} (${r.n})`).join(" · ") : t("لا رفض بعد", "No rejections yet")} />
        <Stat k={t("التعديلات بعد الإصدار", "Amendments after issue")} v={`${pct(kpi.amendments, kpi.issued)}%`} sub={t("دقة التخطيط لدى الجهات", "Org planning accuracy")} />
        <Stat k={t("رموز الممثل المرسلة", "Rep codes sent")} v={otp.sent} sub={`${otp.ok} ${t("ناجحة", "ok")} · ${otp.failed} ${t("فاشلة", "failed")} (${pct(otp.failed, otp.ok + otp.failed)}%)`} />
        <Stat k={t("تصاريح ملغاة", "Revoked permits")} v={permits.revoked} />
      </div>
    </Shell>
  );
}

function DCard({ title, children, className = "" }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[.04] backdrop-blur ${className}`}>
      <h2 className="flex items-center gap-2 border-b border-white/10 px-5 py-3 font-sans text-sm font-semibold text-cream">
        <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-gold-soft to-brand" />
        {title}
      </h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function OpsTitle({ title, sub, action }: { title: string; sub: string; action: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-gold">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7fd1a6] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#7fd1a6]" /></span>
          {sub}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white">{title}</h1>
      </div>
      {action}
    </div>
  );
}
