import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, staffNav } from "@/components/Shell";
import { Alert, Badge, Card, laneTone, PageTitle, requestTone } from "@/components/ui";
import { RequestDetails } from "@/components/RequestDetails";
import { StageBar, Timeline } from "@/components/Timeline";
import { requireCap } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { canAct, LANE_LABEL, normPlate, STATUS_LABEL, type PermitRow, type RequestRow } from "@/lib/permits";
import { listZones } from "@/lib/settings";
import DecisionPanel from "./DecisionPanel";
import { CircularProgress, Confetti } from "@/components/magic";

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; done?: string }> }) {
  const u = await requireCap("request.view");
  const { id } = await params;
  const sp = await searchParams;
  const { t, lang } = await i18n();
  const r = await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1`, [Number(id)]);
  if (!r) notFound();
  const events = await q<{ at: Date; actor: string; action: string; note: string | null }>(`SELECT * FROM request_events WHERE request_id=$1 ORDER BY id`, [r.id]);
  const stage = r.status === "pending_review" ? 1 : r.status === "pending_approval" ? 2 : 0;
  const can = stage ? await canAct(u, stage as 1 | 2, r) : null;
  const permit = r.permit_id ? await q1<PermitRow>(`SELECT * FROM permits WHERE id=$1`, [r.permit_id]) : undefined;
  const zones = await listZones(true);
  const zoneName = (ids: number[]) => zones.filter((z) => ids.includes(z.id)).map((z) => t(z.name_ar, z.name_en)).join("، ");

  // Amendment diff against the currently approved permit
  let diff: string[] = [];
  if (r.kind === "amendment" && permit) {
    const d = permit.data;
    if (+new Date(d.valid_from) !== +new Date(r.valid_from) || +new Date(d.valid_to) !== +new Date(r.valid_to)) diff.push(t("تغيرت فترة الصلاحية", "Validity period changed"));
    if (zoneName(d.zones) !== zoneName(r.zones)) diff.push(t(`المناطق: ${zoneName(d.zones)} ← ${zoneName(r.zones)}`, `Zones: ${zoneName(d.zones)} → ${zoneName(r.zones)}`));
    const oldIds = new Set(d.people.map((p) => p.id_number));
    const newIds = new Set(r.people.map((p) => p.id_number));
    const addP = r.people.filter((p) => !oldIds.has(p.id_number)).length;
    const delP = d.people.filter((p) => !newIds.has(p.id_number)).length;
    if (addP || delP) diff.push(t(`الأفراد: +${addP} / −${delP}`, `People: +${addP} / −${delP}`));
    const oldPl = new Set(d.vehicles.map((v) => normPlate(v.plate)));
    const newPl = new Set(r.vehicles.map((v) => normPlate(v.plate)));
    const addV = r.vehicles.filter((v) => !oldPl.has(normPlate(v.plate))).length;
    const delV = d.vehicles.filter((v) => !newPl.has(normPlate(v.plate))).length;
    if (addV || delV) diff.push(t(`المركبات: +${addV} / −${delV}`, `Vehicles: +${addV} / −${delV}`));
    if (JSON.stringify(d.equipment) !== JSON.stringify(r.equipment)) diff.push(t("تغيرت المعدات", "Equipment changed"));
    if (d.purpose !== r.purpose) diff.push(t("تغير الغرض", "Purpose changed"));
    if (!diff.length) diff = [t("لا توجد فروقات جوهرية", "No material changes")];
  }

  const ERR: Record<string, [string, string]> = {
    reason_required: ["السبب إلزامي للرفض والإعادة", "A reason is required to reject or return"],
    same_person: ["لا يمكن لنفس الشخص تنفيذ المرحلتين", "The same person cannot perform both stages"],
    not_assigned: ["هذه المرحلة غير مسندة إليك", "This stage is not assigned to you"],
    not_actionable: ["تغيرت حالة الطلب، حدّث الصفحة", "Request status changed; refresh"],
  };

  return (
    <Shell nav={staffNav(u.roles)} active="/staff" user={u.name} kind="staff" wide>
      <Link href="/staff" className="mb-3 inline-block text-sm text-ink-soft hover:text-brand">← {t("صندوق المهام", "Inbox")}</Link>
      <PageTitle
        title={<span className="num">{r.ref}</span>}
        sub={r.org_name}
        action={
          <div className="flex flex-wrap gap-2">
            {r.kind === "amendment" && <Badge tone="brand">{t("طلب تعديل", "Amendment")}</Badge>}
            <Badge tone={requestTone[r.status]}>{t(...STATUS_LABEL[r.status])}</Badge>
          </div>
        }
      />
      {sp.err && <div className="mb-4"><Alert tone="bad">{t(...(ERR[sp.err] ?? ["تعذر تنفيذ الإجراء", "Action failed"]))}</Alert></div>}
      {sp.done && r.status === "approved" && <Confetti once={`staff-issued-${r.id}`} />}
      {sp.done && <div className="mb-4"><Alert tone="ok">{t("تم تنفيذ الإجراء وإشعار مقدم الطلب.", "Done. The applicant was notified.")}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
          <Card><StageBar status={r.status} /></Card>
          {r.kind === "amendment" && permit && (
            <Card title={t(`التغييرات على التصريح ${permit.number} (الإصدار ${permit.version})`, `Changes to ${permit.number} (v${permit.version})`)}>
              <ul className="list-disc space-y-1 ps-5 text-sm">{diff.map((d) => <li key={d}>{d}</li>)}</ul>
              <p className="mt-3 text-xs text-ink-soft">{t("يبقى التصريح ساريًا ببياناته الحالية حتى اعتماد التعديل.", "The permit stays valid with current data until this is approved.")}</p>
            </Card>
          )}
          <RequestDetails r={r} />
        </div>
        <aside className="space-y-5">
          <Card title={t("الفرز الذكي", "Smart triage")} action={<Badge tone={laneTone[r.lane]}>{t(...LANE_LABEL[r.lane])}</Badge>}>
            <div className="flex items-center gap-4">
              <CircularProgress value={r.risk_score} color={`var(--color-${r.lane === "strict" ? "bad" : r.lane === "normal" ? "wait" : "ok"})`}>
                <span className="num text-xl font-bold">{r.risk_score}</span>
              </CircularProgress>
              <p className="text-xs leading-relaxed text-ink-soft">{t("درجة المخاطر من 100، محسوبة من سجل الجهة والمناطق والتداخل مع طلبات أخرى. لا تتخذ القرار بدلًا عنك.", "Risk score out of 100 from org history, zones and overlaps with other requests. It informs, it doesn't decide.")}</p>
            </div>
            {r.risk_flags.length > 0 && (
              <ul className="mt-4 space-y-2">
                {r.risk_flags.map((f) => (
                  <li key={f.code} className="flex items-start justify-between gap-3 text-sm">
                    <span>{lang === "ar" ? f.ar : f.en}</span>
                    <span className={`num shrink-0 text-xs font-bold ${f.points < 0 ? "text-ok" : "text-bad"}`}>{f.points > 0 ? `+${f.points}` : f.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {stage > 0 && (
            <Card title={stage === 1 ? t("قرار المراجعة الأولية", "Initial review decision") : t("قرار الاعتماد النهائي", "Final approval decision")}>
              {can?.ok ? (
                <DecisionPanel id={r.id} stage={stage as 1 | 2} lang={lang} />
              ) : (
                <Alert tone="off">{t(...(ERR[can?.why ?? "not_assigned"]))}</Alert>
              )}
            </Card>
          )}
          {permit && (
            <Card title={t("التصريح", "Permit")}>
              <Link href={`/staff/permits/${permit.id}`} className="num text-sm font-semibold text-brand underline">{permit.number}</Link>
            </Card>
          )}
          <Card title={t("سجل الطلب", "History")}><Timeline events={events} showActor /></Card>
        </aside>
      </div>
    </Shell>
  );
}
