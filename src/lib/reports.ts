import "server-only";
import { q, q1 } from "./db";
import { sha256 } from "./crypto";
import { listGates, listZones } from "./settings";
import { LIVE_LABEL, liveStatus, maskId, STATUS_LABEL, type LiveStatus, type RequestStatus } from "./permits";

/* ─────────────────────────────────────────────────────────────
   Reports — one definition feeds three outputs (screen preview,
   Excel workbook, official A4 print/PDF), so they always match.
   Every number comes straight from system records (no manual entry),
   following the client's "success metrics" section.
   Personal data is minimised: no ID numbers, phones masked.
   ───────────────────────────────────────────────────────────── */

export type Lang = "ar" | "en";
export type ColKind = "text" | "num" | "date" | "datetime" | "pct" | "hours";
export type Col = { key: string; ar: string; en: string; kind?: ColKind; width?: number };
export type Cell = string | number | Date | null;
export type Filters = { from: string; to: string; zone: number | null; gate: number | null };
export type ReportResult = {
  id: ReportId;
  title: string;
  subtitle: string;
  cols: { key: string; label: string; kind: ColKind; width: number }[];
  rows: Cell[][];
  summary: { label: string; value: string; note?: string }[];
  filtersText: string;
  generatedAt: Date;
};

export const REPORTS = [
  { id: "kpi", ar: "مؤشرات قياس النجاح", en: "Success metrics", icon: "pulse", dar: "متوسط زمن المعالجة لكل مرحلة، ونسب الإعادة والرفض، ونتائج التحقق الميداني ورمز الممثل — كما وردت في وثيقة الحل.", den: "Processing time per stage, return and rejection rates, field-check and rep-code outcomes — as defined in the solution document." },
  { id: "requests", ar: "سجل الطلبات", en: "Requests register", icon: "inbox", dar: "كل طلب بحالته ومرحلته وزمن معالجته ومسار الفرز.", den: "Every request with status, stage, processing time and triage lane." },
  { id: "permits", ar: "التصاريح الصادرة", en: "Issued permits", icon: "doc", dar: "التصاريح بحالتها الحالية والإصدار والمناطق والأعداد.", den: "Permits with current status, version, zones and counts." },
  { id: "checks", ar: "عمليات التحقق الميداني", en: "Field checks", icon: "scan", dar: "كل عملية دخول وخروج ومنع عند البوابات مع نتيجة رمز الممثل.", den: "Every entry, exit and denial at the gates with the rep-code result." },
  { id: "gates", ar: "الحركة اليومية حسب البوابة", en: "Daily movement by gate", icon: "grid", dar: "الدخول والخروج والرفض لكل بوابة في كل يوم — يكشف أوقات الذروة والمداخل الأكثر ضغطًا.", den: "Entries, exits and rejections per gate per day — reveals peaks and busiest gates." },
  { id: "tamper", ar: "محاولات التلاعب", en: "Tampering attempts", icon: "shield", dar: "رموز مزيفة أو قديمة، وتحققات لتصاريح منتهية أو موقوفة أو ملغاة.", den: "Fake or stale codes, and checks of expired, suspended or revoked permits." },
  { id: "decisions", ar: "الطلبات المرفوضة والمعادة وأسبابها", en: "Rejections & returns with reasons", icon: "log", dar: "يكشف الشروط التي تحتاج إعلانًا مسبقًا للجهات ووضوح النموذج.", den: "Reveals conditions to announce up front and form clarity." },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];
export const isReportId = (x: string): x is ReportId => REPORTS.some((r) => r.id === x);

const riyadhToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(sp: Record<string, string | undefined>): Filters {
  const today = riyadhToday();
  const monthAgo = new Date(Date.now() + 3 * 3600_000 - 29 * 86400_000).toISOString().slice(0, 10);
  let from = DATE_RE.test(sp.from ?? "") ? sp.from! : monthAgo;
  let to = DATE_RE.test(sp.to ?? "") ? sp.to! : today;
  if (from > to) [from, to] = [to, from];
  const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return { from, to, zone: n(sp.zone), gate: n(sp.gate) };
}
const range = (f: Filters) => [new Date(`${f.from}T00:00:00+03:00`), new Date(`${f.to}T23:59:59.999+03:00`)] as const;

/** Content fingerprint printed on the seal and stored in the audit log — proves the document wasn't altered. */
export function fingerprint(r: ReportResult, f: Filters) {
  const body = JSON.stringify({ id: r.id, f, cols: r.cols.map((c) => c.key), rows: r.rows.map((row) => row.map((v) => (v instanceof Date ? v.toISOString() : v))) });
  return sha256(body).slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
}

export async function runReport(id: ReportId, f: Filters, lang: Lang): Promise<ReportResult> {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [zones, gates] = await Promise.all([listZones(true), listGates()]);
  const zName = (zid: number) => { const z = zones.find((x) => x.id === zid); return z ? t(z.name_ar, z.name_en) : String(zid); };
  const gName = (gid: number | null) => { const g = gates.find((x) => x.id === gid); return g ? t(g.name_ar, g.name_en) : "—"; };
  const [start, end] = range(f);
  const meta = REPORTS.find((r) => r.id === id)!;
  const filtersText = [
    t(`الفترة: ${f.from} إلى ${f.to}`, `Period: ${f.from} to ${f.to}`),
    f.zone ? t(`المنطقة: ${zName(f.zone)}`, `Zone: ${zName(f.zone)}`) : null,
    f.gate && ["checks", "gates", "tamper"].includes(id) ? t(`البوابة: ${gName(f.gate)}`, `Gate: ${gName(f.gate)}`) : null,
  ].filter(Boolean).join(" · ");
  const base = { id, title: t(meta.ar, meta.en), subtitle: t(meta.dar, meta.den), filtersText, generatedAt: new Date() };
  const cols = (c: Col[]) => c.map((x) => ({ key: x.key, label: t(x.ar, x.en), kind: x.kind ?? "text", width: x.width ?? (x.kind === "num" || x.kind === "pct" || x.kind === "hours" ? 12 : x.kind === "datetime" ? 19 : x.kind === "date" ? 13 : 22) }));
  const zoneSql = (alias: string, idx: number) => (f.zone ? ` AND $${idx} = ANY(${alias}.zones)` : "");
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const hrs = (v: number | null) => (v == null ? "—" : v < 1 ? t(`${Math.round(v * 60)} دقيقة`, `${Math.round(v * 60)} min`) : t(`${v.toFixed(1)} ساعة`, `${v.toFixed(1)} h`));
  const zp = f.zone ? [f.zone] : [];
  const checksWhere = (alias = "c", next = 3) => {
    const parts: string[] = [];
    const params: unknown[] = [];
    if (f.gate) { parts.push(`${alias}.gate_id = $${next + params.length}`); params.push(f.gate); }
    if (f.zone) { parts.push(`$${next + params.length} = ANY(p.zones)`); params.push(f.zone); }
    return { sql: parts.length ? " AND " + parts.join(" AND ") : "", params };
  };
  const TAMPER = `(c.code_type IN ('invalid','rotating_expired') OR c.status_at_check IN ('not_found','replay','expired','suspended','revoked','not_started'))`;

  switch (id) {
    case "kpi": {
      const k = (await q1<{ s1: number | null; s2: number | null; tot: number | null; submitted: number; rejected: number; amendments: number; approved: number }>(
        `SELECT avg(extract(epoch FROM r.stage1_at - r.submitted_at))/3600 s1,
                avg(extract(epoch FROM r.stage2_at - r.stage1_at))/3600 s2,
                avg(extract(epoch FROM r.stage2_at - r.submitted_at))/3600 tot,
                count(*)::int submitted,
                count(*) FILTER (WHERE r.status='rejected')::int rejected,
                count(*) FILTER (WHERE r.kind='amendment')::int amendments,
                count(*) FILTER (WHERE r.status='approved')::int approved
         FROM requests r WHERE r.submitted_at BETWEEN $1 AND $2${zoneSql("r", 3)}`,
        [start, end, ...zp],
      ))!;
      const returned = (await q1<{ n: number }>(
        `SELECT count(DISTINCT e.request_id)::int n FROM request_events e JOIN requests r ON r.id=e.request_id
         WHERE e.action='returned' AND r.submitted_at BETWEEN $1 AND $2${zoneSql("r", 3)}`,
        [start, end, ...zp],
      ))!.n;
      const reasons = await q<{ reason: string; n: number }>(
        `SELECT r.reason, count(*)::int n FROM requests r WHERE r.status='rejected' AND r.reason IS NOT NULL AND r.submitted_at BETWEEN $1 AND $2${zoneSql("r", 3)} GROUP BY 1 ORDER BY 2 DESC LIMIT 3`,
        [start, end, ...zp],
      );
      const cw = checksWhere();
      const ch = (await q1<{ total: number; inn: number; out: number; denied: number; fake: number; stale: number; badstatus: number; otp_ok: number; otp_fail: number }>(
        `SELECT count(*)::int total,
                count(*) FILTER (WHERE c.decision='allowed' AND c.direction='in')::int inn,
                count(*) FILTER (WHERE c.decision='allowed' AND c.direction='out')::int out,
                count(*) FILTER (WHERE c.decision='denied')::int denied,
                count(*) FILTER (WHERE c.code_type='invalid' OR c.status_at_check='not_found')::int fake,
                count(*) FILTER (WHERE c.code_type='rotating_expired' OR c.status_at_check='replay')::int stale,
                count(*) FILTER (WHERE c.status_at_check IN ('expired','suspended','revoked','not_started'))::int badstatus,
                count(*) FILTER (WHERE c.rep_otp='verified')::int otp_ok,
                count(*) FILTER (WHERE c.rep_otp LIKE 'failed%')::int otp_fail
         FROM checks c LEFT JOIN permits p ON p.id=c.permit_id WHERE c.at BETWEEN $1 AND $2${cw.sql}`,
        [start, end, ...cw.params],
      ))!;
      const otpSent = (await q1<{ n: number }>(`SELECT count(*)::int n FROM otps WHERE purpose='rep_entry' AND created_at BETWEEN $1 AND $2`, [start, end]).catch(() => ({ n: 0 })))?.n ?? 0;
      const issued = (await q1<{ n: number }>(`SELECT count(*)::int n FROM permits p WHERE p.issued_at BETWEEN $1 AND $2${zoneSql("p", 3)}`, [start, end, ...zp]))!.n;
      const peak = await q1<{ h: number; n: number }>(
        `SELECT extract(hour FROM ((c.at AT TIME ZONE 'UTC') + interval '3 hours'))::int h, count(*)::int n FROM checks c LEFT JOIN permits p ON p.id=c.permit_id
         WHERE c.at BETWEEN $1 AND $2${cw.sql} GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
        [start, end, ...cw.params],
      );
      const decided = ch.inn + ch.denied;
      const rows: Cell[][] = [
        [t("متوسط زمن معالجة الطلب", "Avg request processing time"), hrs(k.tot), t(`مراجعة أولية ${hrs(k.s1)} · اعتماد نهائي ${hrs(k.s2)}`, `Stage 1 ${hrs(k.s1)} · Stage 2 ${hrs(k.s2)}`), t("المرحلة التي تتأخر فيها الطلبات", "The stage where requests stall")],
        [t("نسبة الطلبات المعادة للاستكمال", "Returned for completion"), `${pct(returned, k.submitted)}%`, t(`${returned} من ${k.submitted} طلب`, `${returned} of ${k.submitted}`), t("وضوح النموذج والمستندات المطلوبة", "Form and document clarity")],
        [t("نسبة الرفض", "Rejection rate"), `${pct(k.rejected, k.submitted)}%`, reasons.length ? reasons.map((x) => `${x.reason} (${x.n})`).join(" · ") : t("لا يوجد", "None"), t("شروط تحتاج إعلانًا مسبقًا للجهات", "Conditions to announce up front")],
        [t("الطلبات المقدّمة / المعتمدة", "Submitted / approved"), `${k.submitted} / ${k.approved}`, t(`تصاريح صادرة في الفترة: ${issued}`, `Permits issued in period: ${issued}`), t("حجم العمل", "Workload")],
        [t("عمليات التحقق الميداني", "Field checks"), String(ch.total), t(`دخول ${ch.inn} · خروج ${ch.out} · منع ${ch.denied} · نسبة المنع ${pct(ch.denied, decided)}%`, `In ${ch.inn} · Out ${ch.out} · Denied ${ch.denied} · ${pct(ch.denied, decided)}%`), peak ? t(`ساعة الذروة ${String(peak.h).padStart(2, "0")}:00 (${peak.n} عملية)`, `Peak hour ${String(peak.h).padStart(2, "0")}:00 (${peak.n})`) : t("أوقات الذروة والمداخل الأكثر ضغطًا", "Peaks and busiest gates")],
        [t("محاولات بتصاريح غير صالحة", "Invalid-permit attempts"), String(ch.fake + ch.stale + ch.badstatus), t(`غير موجود ${ch.fake} · رمز قديم ${ch.stale} · منتهٍ/موقوف/ملغى ${ch.badstatus}`, `Not found ${ch.fake} · stale ${ch.stale} · expired/suspended/revoked ${ch.badstatus}`), t("محاولات التلاعب أو استخدام تصاريح قديمة", "Tampering or use of old permits")],
        [t("نتائج رمز الممثل", "Representative code results"), t(`${otpSent} إرسال`, `${otpSent} sent`), t(`ناجح ${ch.otp_ok} · فاشل ${ch.otp_fail} · نسبة الفشل ${pct(ch.otp_fail, ch.otp_ok + ch.otp_fail)}%`, `OK ${ch.otp_ok} · failed ${ch.otp_fail} · ${pct(ch.otp_fail, ch.otp_ok + ch.otp_fail)}%`), t("احتمال استخدام التصريح من غير الممثل", "Use of the permit by someone else")],
        [t("التعديلات الجوهرية بعد الإصدار", "Material amendments after issue"), `${pct(k.amendments, issued)}%`, t(`${k.amendments} طلب تعديل ÷ ${issued} تصريح`, `${k.amendments} amendments ÷ ${issued} permits`), t("دقة التخطيط لدى الجهات وحاجتها لمرونة أكبر", "Planning accuracy and need for flexibility")],
      ];
      return {
        ...base,
        cols: cols([{ key: "k", ar: "المؤشر", en: "Indicator", width: 30 }, { key: "v", ar: "القيمة", en: "Value", width: 16 }, { key: "d", ar: "التفصيل", en: "Detail", width: 48 }, { key: "r", ar: "ما يكشفه", en: "What it reveals", width: 36 }]),
        rows,
        summary: [
          { label: t("متوسط زمن المعالجة", "Avg processing"), value: hrs(k.tot) },
          { label: t("نسبة الإعادة", "Return rate"), value: `${pct(returned, k.submitted)}%` },
          { label: t("نسبة الرفض", "Rejection rate"), value: `${pct(k.rejected, k.submitted)}%` },
          { label: t("نسبة منع الدخول", "Denial rate"), value: `${pct(ch.denied, decided)}%` },
        ],
      };
    }

    case "requests": {
      const rows = await q<{ ref: string; kind: string; status: RequestStatus; org_name: string; rep_name: string; rep_phone: string; zones: number[]; valid_from: Date; valid_to: Date; p: number; v: number; e: number; lane: string; risk_score: number; submitted_at: Date; stage1_at: Date | null; stage2_at: Date | null; reason: string | null }>(
        `SELECT r.ref, r.kind, r.status, r.org_name, r.rep_name, r.rep_phone, r.zones, r.valid_from, r.valid_to,
                jsonb_array_length(r.people)::int p, jsonb_array_length(r.vehicles)::int v, jsonb_array_length(r.equipment)::int e,
                r.lane, r.risk_score, r.submitted_at, r.stage1_at, r.stage2_at, r.reason
         FROM requests r WHERE r.submitted_at BETWEEN $1 AND $2${zoneSql("r", 3)} ORDER BY r.submitted_at DESC LIMIT 5000`,
        [start, end, ...zp],
      );
      const lane = (l: string) => (l === "fast" ? t("سريع", "Fast") : l === "strict" ? t("مشدد", "Strict") : t("عادي", "Normal"));
      const by = (s: RequestStatus) => rows.filter((r) => r.status === s).length;
      return {
        ...base,
        cols: cols([
          { key: "ref", ar: "الرقم المرجعي", en: "Reference", width: 17 }, { key: "kind", ar: "النوع", en: "Type", width: 9 }, { key: "status", ar: "الحالة", en: "Status", width: 20 },
          { key: "org", ar: "الجهة", en: "Organization", width: 28 }, { key: "rep", ar: "الممثل", en: "Representative", width: 20 }, { key: "phone", ar: "الجوال", en: "Mobile", width: 13 },
          { key: "zones", ar: "المناطق", en: "Zones", width: 24 }, { key: "from", ar: "من", en: "From", kind: "datetime" }, { key: "to", ar: "إلى", en: "To", kind: "datetime" },
          { key: "p", ar: "الأفراد", en: "People", kind: "num", width: 8 }, { key: "v", ar: "المركبات", en: "Vehicles", kind: "num", width: 9 }, { key: "e", ar: "المعدات", en: "Equip.", kind: "num", width: 8 },
          { key: "lane", ar: "مسار الفرز", en: "Lane", width: 10 }, { key: "risk", ar: "المخاطر", en: "Risk", kind: "num", width: 8 },
          { key: "sub", ar: "تاريخ التقديم", en: "Submitted", kind: "datetime" }, { key: "hours", ar: "زمن المعالجة (ساعة)", en: "Processing (h)", kind: "hours", width: 12 }, { key: "reason", ar: "السبب", en: "Reason", width: 30 },
        ]),
        rows: rows.map((r) => [
          r.ref, r.kind === "amendment" ? t("تعديل", "Amendment") : t("جديد", "New"), t(...STATUS_LABEL[r.status]), r.org_name, r.rep_name, maskId(r.rep_phone),
          r.zones.map(zName).join("، "), r.valid_from, r.valid_to, r.p, r.v, r.e, lane(r.lane), r.risk_score, r.submitted_at,
          r.stage2_at ? Math.round(((+new Date(r.stage2_at) - +new Date(r.submitted_at)) / 3600_000) * 10) / 10 : null, r.reason,
        ]),
        summary: [
          { label: t("إجمالي الطلبات", "Total"), value: String(rows.length) },
          { label: t("معتمدة", "Approved"), value: String(by("approved")) },
          { label: t("قيد المراجعة", "In review"), value: String(by("pending_review") + by("pending_approval")) },
          { label: t("معادة / مرفوضة", "Returned / rejected"), value: `${by("returned")} / ${by("rejected")}` },
        ],
      };
    }

    case "permits": {
      const rows = await q<{ number: string; org_name: string; status: string; status_reason: string | null; version: number; zones: number[]; valid_from: Date; valid_to: Date; issued_at: Date; p: number; v: number; e: number }>(
        `SELECT p.number, p.org_name, p.status, p.status_reason, p.version, p.zones, p.valid_from, p.valid_to, p.issued_at,
                jsonb_array_length(coalesce(p.data->'people','[]'))::int p, jsonb_array_length(coalesce(p.data->'vehicles','[]'))::int v, jsonb_array_length(coalesce(p.data->'equipment','[]'))::int e
         FROM permits p WHERE p.issued_at BETWEEN $1 AND $2${zoneSql("p", 3)} ORDER BY p.issued_at DESC LIMIT 5000`,
        [start, end, ...zp],
      );
      const live = rows.map((r) => liveStatus({ status: r.status as never, valid_from: r.valid_from, valid_to: r.valid_to }));
      const cnt = (s: LiveStatus) => live.filter((x) => x === s).length;
      return {
        ...base,
        cols: cols([
          { key: "n", ar: "رقم التصريح", en: "Permit no.", width: 17 }, { key: "org", ar: "الجهة", en: "Organization", width: 28 }, { key: "st", ar: "الحالة الحالية", en: "Current status", width: 14 },
          { key: "ver", ar: "الإصدار", en: "Version", kind: "num", width: 8 }, { key: "zones", ar: "المناطق", en: "Zones", width: 24 },
          { key: "from", ar: "من", en: "From", kind: "datetime" }, { key: "to", ar: "إلى", en: "To", kind: "datetime" },
          { key: "p", ar: "الأفراد", en: "People", kind: "num", width: 8 }, { key: "v", ar: "المركبات", en: "Vehicles", kind: "num", width: 9 }, { key: "e", ar: "المعدات", en: "Equip.", kind: "num", width: 8 },
          { key: "iss", ar: "تاريخ الإصدار", en: "Issued", kind: "datetime" }, { key: "why", ar: "سبب الإيقاف/الإلغاء", en: "Suspension/revocation reason", width: 30 },
        ]),
        rows: rows.map((r, i) => [r.number, r.org_name, t(...LIVE_LABEL[live[i]]), r.version, r.zones.map(zName).join("، "), r.valid_from, r.valid_to, r.p, r.v, r.e, r.issued_at, r.status_reason]),
        summary: [
          { label: t("إجمالي الصادرة", "Issued"), value: String(rows.length) },
          { label: t("سارية", "Valid"), value: String(cnt("valid")) },
          { label: t("موقوفة / ملغاة", "Suspended / revoked"), value: `${cnt("suspended")} / ${cnt("revoked")}` },
          { label: t("منتهية", "Expired"), value: String(cnt("expired")) },
        ],
      };
    }

    case "checks": {
      const cw = checksWhere();
      const rows = await q<{ at: Date; gate_id: number; direction: string; decision: string | null; number: string | null; org: string | null; status_at_check: string; code_type: string; rep_otp: string | null; offline: boolean; agency: string | null; deny_reason: string | null; mp: number; mv: number }>(
        `SELECT c.at, c.gate_id, c.direction, c.decision, p.number, p.org_name org, c.status_at_check, c.code_type, c.rep_otp, c.offline, c.agency, c.deny_reason,
                jsonb_array_length(coalesce(c.matched->'people','[]'::jsonb))::int mp, jsonb_array_length(coalesce(c.matched->'vehicles','[]'::jsonb))::int mv
         FROM checks c LEFT JOIN permits p ON p.id=c.permit_id WHERE c.at BETWEEN $1 AND $2${cw.sql} ORDER BY c.at DESC LIMIT 10000`,
        [start, end, ...cw.params],
      );
      const op = (r: (typeof rows)[number]) =>
        r.decision === "allowed" ? (r.direction === "out" ? t("خروج", "Exit") : t("سماح بالدخول", "Entry allowed")) : r.decision === "denied" ? t("منع الدخول", "Entry denied") : r.decision === "voided" ? t("خروج ملغى", "Exit voided") : t("استعلام", "Lookup");
      const status = (s: string) => (s in LIVE_LABEL ? t(...LIVE_LABEL[s as LiveStatus]) : s === "not_found" ? t("غير موجود", "Not found") : s === "replay" ? t("رمز قديم", "Stale code") : s);
      const code = (c: string) => ({ static: t("مطبوع", "Printed"), rotating: t("متغير حي", "Rotating"), invalid: t("غير معروف", "Unknown"), rotating_expired: t("متغير منتهٍ", "Stale rotating") })[c] ?? c;
      const otp = (o: string | null) => (o === "verified" ? t("ناجح", "Verified") : o?.startsWith("failed") ? t("فاشل", "Failed") : "—");
      const inn = rows.filter((r) => r.decision === "allowed" && r.direction === "in");
      const out = rows.filter((r) => r.decision === "allowed" && r.direction === "out");
      return {
        ...base,
        cols: cols([
          { key: "at", ar: "الوقت", en: "Time", kind: "datetime" }, { key: "gate", ar: "البوابة", en: "Gate", width: 16 }, { key: "op", ar: "العملية", en: "Operation", width: 15 },
          { key: "n", ar: "رقم التصريح", en: "Permit no.", width: 17 }, { key: "org", ar: "الجهة", en: "Organization", width: 26 }, { key: "st", ar: "الحالة لحظة التحقق", en: "Status at check", width: 15 },
          { key: "p", ar: "الأفراد", en: "People", kind: "num", width: 8 }, { key: "v", ar: "المركبات", en: "Vehicles", kind: "num", width: 9 },
          { key: "code", ar: "نوع الرمز", en: "Code", width: 12 }, { key: "otp", ar: "رمز الممثل", en: "Rep code", width: 10 }, { key: "off", ar: "دون اتصال", en: "Offline", width: 9 },
          { key: "ag", ar: "الجهة المتحققة", en: "Verifying agency", width: 20 }, { key: "why", ar: "سبب المنع", en: "Denial reason", width: 26 },
        ]),
        rows: rows.map((r) => [r.at, gName(r.gate_id), op(r), r.number ?? "—", r.org ?? "—", status(r.status_at_check), r.mp, r.mv, code(r.code_type), otp(r.rep_otp), r.offline ? t("نعم", "Yes") : t("لا", "No"), r.agency, r.deny_reason]),
        summary: [
          { label: t("إجمالي العمليات", "Total operations"), value: String(rows.length) },
          { label: t("دخول (أفراد)", "Entries (people)"), value: `${inn.length} (${inn.reduce((s, r) => s + r.mp, 0)})` },
          { label: t("خروج (أفراد)", "Exits (people)"), value: `${out.length} (${out.reduce((s, r) => s + r.mp, 0)})` },
          { label: t("منع الدخول", "Denied"), value: String(rows.filter((r) => r.decision === "denied").length) },
        ],
      };
    }

    case "gates": {
      const cw = checksWhere();
      const rows = await q<{ d: string; gate_id: number; inn: number; out: number; pin: number; pout: number; denied: number; bad: number; peak: number | null }>(
        `SELECT to_char(((c.at AT TIME ZONE 'UTC') + interval '3 hours'),'YYYY-MM-DD') d, c.gate_id,
                count(*) FILTER (WHERE c.decision='allowed' AND c.direction='in')::int inn,
                count(*) FILTER (WHERE c.decision='allowed' AND c.direction='out')::int out,
                coalesce(sum(jsonb_array_length(coalesce(c.matched->'people','[]'::jsonb))) FILTER (WHERE c.decision='allowed' AND c.direction='in'),0)::int pin,
                coalesce(sum(jsonb_array_length(coalesce(c.matched->'people','[]'::jsonb))) FILTER (WHERE c.decision='allowed' AND c.direction='out'),0)::int pout,
                count(*) FILTER (WHERE c.decision='denied')::int denied,
                count(*) FILTER (WHERE ${TAMPER})::int bad,
                mode() WITHIN GROUP (ORDER BY extract(hour FROM ((c.at AT TIME ZONE 'UTC') + interval '3 hours'))::int) peak
         FROM checks c LEFT JOIN permits p ON p.id=c.permit_id WHERE c.at BETWEEN $1 AND $2${cw.sql} GROUP BY 1,2 ORDER BY 1 DESC, 2`,
        [start, end, ...cw.params],
      );
      const sum = (k: "inn" | "out" | "pin" | "pout" | "denied" | "bad") => rows.reduce((s, r) => s + r[k], 0);
      return {
        ...base,
        cols: cols([
          { key: "d", ar: "اليوم", en: "Day", kind: "date" }, { key: "g", ar: "البوابة", en: "Gate", width: 18 },
          { key: "in", ar: "عمليات الدخول", en: "Entries", kind: "num" }, { key: "pin", ar: "أفراد دخلوا", en: "People in", kind: "num" },
          { key: "out", ar: "عمليات الخروج", en: "Exits", kind: "num" }, { key: "pout", ar: "أفراد خرجوا", en: "People out", kind: "num" },
          { key: "den", ar: "منع", en: "Denied", kind: "num" }, { key: "bad", ar: "محاولات غير صالحة", en: "Invalid attempts", kind: "num", width: 14 },
          { key: "peak", ar: "ساعة الذروة", en: "Peak hour", width: 11 },
        ]),
        rows: rows.map((r) => [r.d, gName(r.gate_id), r.inn, r.pin, r.out, r.pout, r.denied, r.bad, r.peak == null ? "—" : `${String(r.peak).padStart(2, "0")}:00`]),
        summary: [
          { label: t("أفراد دخلوا", "People in"), value: String(sum("pin")) },
          { label: t("أفراد خرجوا", "People out"), value: String(sum("pout")) },
          { label: t("منع الدخول", "Denied"), value: String(sum("denied")) },
          { label: t("محاولات غير صالحة", "Invalid attempts"), value: String(sum("bad")) },
        ],
      };
    }

    case "tamper": {
      const cw = checksWhere();
      const rows = await q<{ at: Date; gate_id: number; code_type: string; status_at_check: string; number: string | null; org: string | null; direction: string; agency: string | null }>(
        `SELECT c.at, c.gate_id, c.code_type, c.status_at_check, p.number, p.org_name org, c.direction, c.agency
         FROM checks c LEFT JOIN permits p ON p.id=c.permit_id WHERE c.at BETWEEN $1 AND $2 AND ${TAMPER}${cw.sql} ORDER BY c.at DESC LIMIT 5000`,
        [start, end, ...cw.params],
      );
      const kind = (r: (typeof rows)[number]) =>
        r.code_type === "invalid" ? t("رمز غير معروف", "Unknown code") : r.status_at_check === "not_found" ? t("تصريح غير موجود (رمز مزيف)", "No such permit (fake)") : r.code_type === "rotating_expired" || r.status_at_check === "replay" ? t("رمز قديم أو صورة شاشة", "Stale code / screenshot") : t(`تصريح ${LIVE_LABEL[r.status_at_check as LiveStatus]?.[0] ?? r.status_at_check}`, `${LIVE_LABEL[r.status_at_check as LiveStatus]?.[1] ?? r.status_at_check} permit`);
      const fake = rows.filter((r) => r.code_type === "invalid" || r.status_at_check === "not_found").length;
      const stale = rows.filter((r) => r.code_type === "rotating_expired" || r.status_at_check === "replay").length;
      return {
        ...base,
        cols: cols([
          { key: "at", ar: "الوقت", en: "Time", kind: "datetime" }, { key: "g", ar: "البوابة", en: "Gate", width: 16 }, { key: "k", ar: "نوع المحاولة", en: "Attempt type", width: 28 },
          { key: "dir", ar: "عند", en: "At", width: 9 }, { key: "n", ar: "رقم التصريح", en: "Permit no.", width: 17 }, { key: "org", ar: "الجهة", en: "Organization", width: 26 }, { key: "ag", ar: "الجهة المتحققة", en: "Verifying agency", width: 20 },
        ]),
        rows: rows.map((r) => [r.at, gName(r.gate_id), kind(r), r.direction === "out" ? t("الخروج", "Exit") : t("الدخول", "Entry"), r.number ?? "—", r.org ?? "—", r.agency]),
        summary: [
          { label: t("إجمالي المحاولات", "Total"), value: String(rows.length) },
          { label: t("رموز مزيفة", "Fake codes"), value: String(fake) },
          { label: t("رموز قديمة", "Stale codes"), value: String(stale) },
          { label: t("تصاريح غير سارية", "Invalid permits"), value: String(rows.length - fake - stale) },
        ],
      };
    }

    case "decisions": {
      const rows = await q<{ at: Date; ref: string; org_name: string; action: string; note: string | null; actor: string; zones: number[] }>(
        `SELECT e.at, r.ref, r.org_name, e.action, e.note, e.actor, r.zones FROM request_events e JOIN requests r ON r.id=e.request_id
         WHERE e.action IN ('returned','rejected') AND e.at BETWEEN $1 AND $2${zoneSql("r", 3)} ORDER BY e.at DESC LIMIT 5000`,
        [start, end, ...zp],
      );
      const reasons = new Map<string, number>();
      rows.forEach((r) => r.note && reasons.set(r.note, (reasons.get(r.note) ?? 0) + 1));
      const top = [...reasons].sort((a, b) => b[1] - a[1])[0];
      return {
        ...base,
        cols: cols([
          { key: "at", ar: "التاريخ", en: "Date", kind: "datetime" }, { key: "ref", ar: "الرقم المرجعي", en: "Reference", width: 17 }, { key: "org", ar: "الجهة", en: "Organization", width: 28 },
          { key: "zones", ar: "المناطق", en: "Zones", width: 22 }, { key: "d", ar: "القرار", en: "Decision", width: 14 }, { key: "why", ar: "السبب المسجل", en: "Recorded reason", width: 46 }, { key: "by", ar: "بواسطة", en: "By", width: 18 },
        ]),
        rows: rows.map((r) => [r.at, r.ref, r.org_name, r.zones.map(zName).join("، "), r.action === "rejected" ? t("رفض", "Rejected") : t("إعادة للاستكمال", "Returned"), r.note, r.actor]),
        summary: [
          { label: t("إعادات", "Returns"), value: String(rows.filter((r) => r.action === "returned").length) },
          { label: t("رفض", "Rejections"), value: String(rows.filter((r) => r.action === "rejected").length) },
          { label: t("أكثر سبب تكرارًا", "Most common reason"), value: top ? `${top[1]}×` : "—", note: top?.[0] },
        ],
      };
    }
  }
}
