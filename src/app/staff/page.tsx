import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell, staffNav, STAFF_NAV } from "@/components/Shell";
import { Badge, Card, Empty, laneTone } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { requireStaff } from "@/lib/auth";
import { verifyChain } from "@/lib/audit";
import { q, q1 } from "@/lib/db";
import { errorStats } from "@/lib/errors";
import { i18n } from "@/lib/i18n";
import { presenceNow } from "@/lib/ops";
import { canAct, LANE_LABEL, type RequestRow } from "@/lib/permits";
import { can, capsOf, ROLE_INFO, type Role } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/* ─────────────────────────────────────────────────────────────
   Role-based workspace ("مساحة العمل"): one home, composed of the
   blocks the signed-in user's permissions unlock — so a reviewer sees a
   queue, a supervisor sees the field, an admin sees governance.
   ───────────────────────────────────────────────────────────── */

const SLA_H = 24; // target hours per stage

export default async function Workspace() {
  const u = await requireStaff();
  const caps = capsOf(u.roles);
  if (u.roles.length === 1 && u.roles[0] === "verifier") redirect("/verify");
  const { t, fmtDate, lang } = await i18n();
  const decider = can(u, "request.review") || can(u, "request.approve");
  const field = can(u, "ops.view");
  const managesPermits = can(u, "permit.manage");
  const governs = can(u, "users.manage");

  /* ── queue ── */
  const rows = caps.has("request.view")
    ? await q<RequestRow>(`SELECT * FROM requests WHERE status IN ('pending_review','pending_approval') ORDER BY CASE lane WHEN 'fast' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, submitted_at`)
    : [];
  const mine: { r: RequestRow; stage: 1 | 2; blocked?: string }[] = [];
  let others = 0;
  if (decider) {
    for (const r of rows) {
      const stage = r.status === "pending_review" ? 1 : 2;
      const c = await canAct(u, stage, r);
      if (c.ok) mine.push({ r, stage });
      else if (c.why === "same_person") mine.push({ r, stage, blocked: "same_person" });
      else others++;
    }
  }
  const ageH = (d: Date) => Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 3600_000));
  const overdue = mine.filter((m) => !m.blocked && ageH(m.r.submitted_at) >= SLA_H).length;

  /* ── field pulse / permits / governance (only what this user may see) ── */
  const [pres, permitAttn, gov] = await Promise.all([
    field ? presenceNow() : Promise.resolve(null),
    managesPermits
      ? q1<{ suspended: number; expiring: number; valid: number }>(
          `SELECT count(*) FILTER (WHERE status='suspended')::int suspended,
                  count(*) FILTER (WHERE status='active' AND valid_to BETWEEN now() AND now() + interval '24 hours')::int expiring,
                  count(*) FILTER (WHERE status='active' AND now() BETWEEN valid_from AND valid_to)::int valid FROM permits`,
        )
      : Promise.resolve(null),
    governs
      ? Promise.all([
          q<{ roles: string[]; active: boolean; locked: boolean }>(`SELECT roles, active, (locked_until IS NOT NULL AND locked_until > now()) locked FROM users`),
          getSetting("stage1"), getSetting("stage2"), getSetting("separation_of_duties"), getSetting("demo_mode"),
          errorStats(), verifyChain(),
        ])
      : Promise.resolve(null),
  ]);
  const today = field
    ? await q1<{ checks: number; tamper: number }>(
        `SELECT count(*)::int checks, count(*) FILTER (WHERE code_type IN ('invalid','rotating_expired') OR status_at_check IN ('not_found','replay'))::int tamper
         FROM checks WHERE at >= date_trunc('day', now() + interval '3 hours') - interval '3 hours'`,
      )
    : null;
  const overstay = pres?.parties.filter((p) => p.expired) ?? [];

  const hour = new Date(Date.now() + 3 * 3600_000).getUTCHours();
  const greet = hour < 12 ? t("صباح الخير", "Good morning") : t("مساء الخير", "Good evening");
  const myRoles = u.roles.filter((r): r is Role => r in ROLE_INFO);
  const shortcuts = staffNav(u.roles).filter((n) => n.href !== "/staff");
  const DESC: Record<string, [string, string]> = {
    "/verify": ["مسح الرموز وتسجيل الدخول والخروج", "Scan codes, record entry & exit"],
    "/staff/ops": ["الخريطة الحية والتنبيهات وآلة الزمن", "Live map, alerts, time machine"],
    "/staff/permits": ["البحث والتصفية والإيقاف والإلغاء", "Search, filter, suspend, revoke"],
    "/staff/capacity": ["حجوزات المركبات لكل منطقة وساعة", "Vehicle bookings per zone & hour"],
    "/staff/reports": ["تقارير رسمية Excel و PDF", "Official Excel & PDF reports"],
    "/staff/audit": ["سجل محمي بسلسلة تجزئة", "Hash-chained activity log"],
    "/staff/errors": ["أخطاء الخادم والمتصفح", "Server & browser errors"],
    "/staff/access": ["مصفوفة الأدوار والمستخدمين", "Role matrix & users"],
    "/staff/admin": ["المستخدمون والمراحل والمناطق", "Users, stages, zones"],
  };

  const Queue = ({ stage }: { stage: 1 | 2 }) => {
    const items = mine.filter((m) => m.stage === stage);
    return items.length === 0 ? (
      <Empty>{t("لا توجد طلبات بانتظار إجرائك — أحسنت", "Nothing waiting for you — all clear")}</Empty>
    ) : (
      <ul className="-my-2 divide-y divide-line">
        {items.map(({ r, blocked }) => {
          const h = ageH(r.submitted_at);
          const late = h >= SLA_H;
          return (
            <li key={r.id}>
              <Link href={`/staff/r/${r.id}`} className="grid gap-1 py-3 hover:bg-paper/60 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3">
                <span className="num text-sm font-semibold text-brand">{r.ref}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.org_name}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {r.people.length} {t("فرد", "people")} · {r.vehicles.length} {t("مركبة", "vehicles")} · {r.equipment.length} {t("معدة", "equipment")}{r.kind === "amendment" ? ` · ${t("تعديل", "amendment")}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={laneTone[r.lane]}>{t(...LANE_LABEL[r.lane])} · <span className="num">{r.risk_score}</span></Badge>
                  {blocked && <Badge tone="off">{t("اعتمدتَه في المرحلة الأولى — فصل المهام", "You did stage 1 — separation of duties")}</Badge>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${late ? "bg-bad-soft text-bad" : h >= SLA_H / 2 ? "bg-wait-soft text-wait" : "bg-mist text-ink-soft"}`} title={fmtDate(r.submitted_at)}>
                    {late ? t(`متأخر · ${h} س`, `Overdue · ${h}h`) : t(`منذ ${h} س`, `${h}h ago`)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Shell nav={staffNav(u.roles)} active="/staff" user={u.name} kind="staff" wide>
      {/* identity: who you are here and what that lets you do */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-brand-deep via-brand to-[#8f4a3c] p-5 text-white shadow-[0_24px_60px_-34px_rgba(90,43,35,.9)] sm:p-7">
        <svg className="pointer-events-none absolute -bottom-10 -start-6 h-48 opacity-[.08]" viewBox="0 0 96 64" aria-hidden><g fill="#fff"><path d="M4 64V22a14 14 0 0 1 28 0v42z" /><path d="M34 64V22a14 14 0 0 1 28 0v42z" /><path d="M64 64V22a14 14 0 0 1 28 0v42z" /></g></svg>
        <p className="text-sm text-white/70">{greet}</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{u.name}</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {myRoles.map((r) => (
            <div key={r} className="max-w-md rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[r].tone }} />{t(ROLE_INFO[r].ar, ROLE_INFO[r].en)}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/75">{t(...ROLE_INFO[r].job)}</p>
            </div>
          ))}
        </div>
        <Link href="/staff/access" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/15 px-3.5 text-sm font-semibold backdrop-blur transition hover:bg-white/25">
          <Icon name="key" size={16} /> {t(`صلاحياتي (${caps.size})`, `My permissions (${caps.size})`)}
        </Link>
      </section>

      {/* now: the few numbers that matter for these roles */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {decider && <Stat k={t("بانتظار إجرائك", "Waiting for you")} v={mine.filter((m) => !m.blocked).length} tone="text-brand" />}
        {decider && <Stat k={t(`متأخرة عن ${SLA_H} ساعة`, `Over ${SLA_H}h`)} v={overdue} tone={overdue ? "text-bad" : "text-ok"} />}
        {field && pres && <Stat k={t("داخل الميدان الآن", "Inside now")} v={pres.parties.reduce((s, p) => s + p.people, 0)} sub={t(`${pres.parties.length} تصريح`, `${pres.parties.length} permits`)} />}
        {field && today && <Stat k={t("محاولات مشبوهة اليوم", "Suspicious today")} v={today.tamper} tone={today.tamper ? "text-bad" : "text-ok"} sub={t(`${today.checks} عملية تحقق`, `${today.checks} checks`)} />}
        {managesPermits && permitAttn && !field && <Stat k={t("تصاريح سارية", "Valid permits")} v={permitAttn.valid} />}
        {governs && gov && <Stat k={t("أخطاء تقنية مفتوحة", "Open errors")} v={gov[5].open} tone={gov[5].open ? "text-bad" : "text-ok"} />}
        {governs && gov && <Stat k={t("المستخدمون النشطون", "Active users")} v={gov[0].filter((x) => x.active).length} sub={t(`${gov[0].filter((x) => x.locked).length} مقفل مؤقتًا`, `${gov[0].filter((x) => x.locked).length} locked`)} />}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
          {can(u, "request.review") && <Card title={<>{t("المراجعة الأولية", "Initial review")} <span className="num text-ink-soft">({mine.filter((m) => m.stage === 1).length})</span></>}><Queue stage={1} /></Card>}
          {can(u, "request.approve") && <Card title={<>{t("الاعتماد النهائي", "Final approval")} <span className="num text-ink-soft">({mine.filter((m) => m.stage === 2).length})</span></>}><Queue stage={2} /></Card>}
          {decider && others > 0 && <p className="text-xs text-ink-soft">{t(`${others} طلب مسند لمسؤول مرحلة آخر.`, `${others} request(s) assigned to another stage owner.`)}</p>}

          {/* supervisor: read-only pipeline — sees everything, decides nothing */}
          {!decider && caps.has("request.view") && (
            <Card title={t("مسار الطلبات (اطلاع)", "Request pipeline (view only)")} action={<Link href="/staff/permits" className="text-xs font-semibold text-brand">{t("كل الطلبات", "All requests")}</Link>}>
              <div className="grid grid-cols-2 gap-3">
                {[[1, t("المراجعة الأولية", "Initial review")], [2, t("الاعتماد النهائي", "Final approval")]].map(([st, l]) => {
                  const list = rows.filter((r) => (st === 1 ? r.status === "pending_review" : r.status === "pending_approval"));
                  const oldest = list.reduce((m, r) => Math.max(m, ageH(r.submitted_at)), 0);
                  return (
                    <div key={String(st)} className="rounded-xl border border-line bg-paper p-3">
                      <p className="text-xs text-ink-soft">{l}</p>
                      <p className="num mt-1 font-display text-2xl font-bold text-brand">{list.length}</p>
                      <p className={`text-xs ${oldest >= SLA_H ? "font-semibold text-bad" : "text-ink-soft"}`}>{list.length ? t(`أقدم طلب منذ ${oldest} ساعة`, `Oldest ${oldest}h`) : t("لا يوجد", "None")}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-ink-soft">{t("القرار على الطلبات لمسؤولي المراحل فقط؛ دورك الاطلاع والمتابعة.", "Decisions belong to stage owners; your role is oversight.")}</p>
            </Card>
          )}

          {field && pres && (
            <Card title={t("نبض الميدان", "Field pulse")} action={<span className="flex gap-3 text-xs font-semibold"><Link href="/staff/ops" className="text-brand">{t("غرفة العمليات", "Ops room")}</Link><Link href="/staff/ops/screen" className="text-brand">{t("شاشة العرض", "Wall screen")}</Link></span>}>
              {overstay.length > 0 && (
                <div className="mb-3 rounded-xl border border-bad/30 bg-bad-soft px-3 py-2.5 text-sm text-bad">
                  <strong>▲ {t(`${overstay.reduce((s, p) => s + p.people, 0)} فرد بالداخل بتصريح منتهٍ أو موقوف`, `${overstay.reduce((s, p) => s + p.people, 0)} people inside on an expired/suspended permit`)}</strong>
                  <span className="block text-xs">{overstay.slice(0, 3).map((p) => `${p.number} · ${p.org}`).join(" — ")}</span>
                </div>
              )}
              {pres.parties.length === 0 ? <Empty>{t("لا أحد داخل الميدان الآن", "Nobody inside right now")}</Empty> : (
                <ul className="space-y-1.5">
                  {pres.parties.sort((a, b) => b.people - a.people).slice(0, 6).map((p) => (
                    <li key={p.permit} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2 text-sm">
                      <span className="num grid h-8 min-w-8 place-items-center rounded-lg bg-brand px-1.5 font-bold text-white">{p.people}</span>
                      <span className="min-w-0 flex-1 truncate">{p.org} <span className="num text-xs text-ink-soft">· {p.number}</span></span>
                      {p.expired ? <Badge tone="bad">{t("منتهٍ", "Expired")}</Badge> : p.since && <span className="text-xs text-ink-soft">{t("منذ", "since")} {fmtDate(p.since).split(" ").slice(-2).join(" ")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {governs && gov && (
            <Card title={t("حوكمة النظام", "System governance")}>
              <ul className="grid gap-3 sm:grid-cols-2">
                <Gov ok label={t("مسؤول المرحلة الأولى", "Stage 1 owner")} value={gov[1].type === "role" ? t(`دور: ${ROLE_INFO[gov[1].value as Role]?.ar ?? gov[1].value}`, `Role: ${ROLE_INFO[gov[1].value as Role]?.en ?? gov[1].value}`) : t(`مستخدم محدد #${gov[1].value}`, `User #${gov[1].value}`)} href="/staff/admin?tab=workflow" />
                <Gov ok label={t("مسؤول المرحلة النهائية", "Stage 2 owner")} value={gov[2].type === "role" ? t(`دور: ${ROLE_INFO[gov[2].value as Role]?.ar ?? gov[2].value}`, `Role: ${ROLE_INFO[gov[2].value as Role]?.en ?? gov[2].value}`) : t(`مستخدم محدد #${gov[2].value}`, `User #${gov[2].value}`)} href="/staff/admin?tab=workflow" />
                <Gov ok={!!gov[3]} label={t("فصل المهام بين المرحلتين", "Separation of duties")} value={gov[3] ? t("مفعّل — لا يعتمد الشخص نفسه المرحلتين", "On — one person can't do both stages") : t("غير مفعّل", "Off")} href="/staff/admin?tab=workflow" />
                <Gov ok={gov[6].ok} label={t("سلامة سجل العمليات", "Audit chain integrity")} value={gov[6].ok ? t(`سليم · ${gov[6].count} قيد`, `Intact · ${gov[6].count} entries`) : t("تحذير: تلاعب!", "WARNING: tampering!")} href="/staff/audit" />
                <Gov ok={!gov[4]} label={t("الوضع التجريبي", "Demo mode")} value={gov[4] ? t("مفعّل — أوقفه قبل التشغيل الفعلي", "On — disable before go-live") : t("موقوف", "Off")} href="/staff/admin?tab=workflow" />
                <Gov ok={!gov[5].open} label={t("الأخطاء التقنية", "Technical errors")} value={gov[5].open ? t(`${gov[5].open} مفتوح`, `${gov[5].open} open`) : t("لا يوجد", "None")} href="/staff/errors" />
              </ul>
              <p className="mt-3 text-xs text-ink-soft">{t("مسؤول النظام لا يملك صلاحية القرار على الطلبات أو التصاريح أو التحقق — إلا إن أُسند إليه ذلك الدور صراحة.", "The admin cannot decide on requests, permits or verification — unless explicitly given that role.")}</p>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          {managesPermits && permitAttn && (
            <Card title={t("تصاريح تحتاج انتباهك", "Permits needing attention")}>
              <ul className="space-y-2 text-sm">
                <Attn n={permitAttn.suspended} label={t("موقوفة — راجع إعادة التفعيل أو الإلغاء", "Suspended — reinstate or revoke")} href="/staff/permits?status=suspended" tone="hold" />
                <Attn n={permitAttn.expiring} label={t("تنتهي خلال 24 ساعة", "Expiring within 24h")} href="/staff/permits" tone="wait" />
                {field && <Attn n={overstay.length} label={t("بالداخل بعد انتهاء الصلاحية", "Inside after expiry")} href="/staff/ops/screen" tone="bad" />}
              </ul>
            </Card>
          )}
          <Card title={t("أقسامك", "Your sections")}>
            <ul className="grid gap-2">
              {shortcuts.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="group flex items-center gap-3 rounded-xl border border-line p-2.5 transition hover:border-gold hover:bg-cream/40">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cream text-brand"><Icon name={n.icon as IconName} size={18} /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{t(n.ar, n.en)}</span>
                      {DESC[n.href] && <span className="block truncate text-xs text-ink-soft">{t(...DESC[n.href])}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">{t(`تظهر لك ${shortcuts.length} من ${STAFF_NAV.length - 1} أقسام حسب صلاحياتك.`, `You see ${shortcuts.length} of ${STAFF_NAV.length - 1} sections based on your permissions.`)}</p>
          </Card>
        </aside>
      </div>
      <span className="sr-only">{lang}</span>
    </Shell>
  );
}

function Stat({ k, v, tone = "text-ink", sub }: { k: string; v: number; tone?: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-ink-soft">{k}</p>
      <p className={`num mt-1 font-display text-3xl font-bold ${tone}`}>{v}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}

function Gov({ ok, label, value, href }: { ok: boolean; label: string; value: string; href: string }) {
  return (
    <li>
      <Link href={href} className={`flex items-start gap-2.5 rounded-xl border p-3 transition hover:border-gold ${ok ? "border-line" : "border-hold/40 bg-hold-soft/50"}`}>
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${ok ? "bg-ok" : "bg-hold"}`} aria-hidden>{ok ? "✓" : "!"}</span>
        <span className="min-w-0"><span className="block text-xs text-ink-soft">{label}</span><span className="block text-sm font-semibold text-ink">{value}</span></span>
      </Link>
    </li>
  );
}

function Attn({ n, label, href, tone }: { n: number; label: string; href: string; tone: "hold" | "wait" | "bad" }) {
  const cls = { hold: "bg-hold-soft text-hold", wait: "bg-wait-soft text-wait", bad: "bg-bad-soft text-bad" }[tone];
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl border border-line p-2.5 hover:border-gold">
        <span className={`num grid h-9 min-w-9 place-items-center rounded-lg px-1.5 font-bold ${n ? cls : "bg-mist text-ink-soft"}`}>{n}</span>
        <span className="text-ink">{label}</span>
      </Link>
    </li>
  );
}
