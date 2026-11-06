import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Alert, Badge, btn, Card, liveTone, PageTitle, requestTone } from "@/components/ui";
import { RequestDetails } from "@/components/RequestDetails";
import { StageBar, Timeline } from "@/components/Timeline";
import { requireApplicant } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { LIVE_LABEL, liveStatus, pendingAmendment, STATUS_LABEL, type PermitRow, type RequestRow } from "@/lib/permits";
import { APP_NAV } from "../../nav";
import { withdrawAction } from "./actions";
import { Confetti } from "@/components/magic";

export default async function ApplicantRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; files?: string }> }) {
  const contact = await requireApplicant();
  const { id } = await params;
  const sp = await searchParams;
  const { t } = await i18n();
  const r = await q1<RequestRow>(`SELECT * FROM requests WHERE id=$1 AND contact=$2`, [Number(id), contact]);
  if (!r) notFound();
  const events = await q<{ at: Date; actor: string; action: string; note: string | null }>(`SELECT * FROM request_events WHERE request_id=$1 ORDER BY id`, [r.id]);
  const permit = r.permit_id ? await q1<PermitRow>(`SELECT * FROM permits WHERE id=$1`, [r.permit_id]) : undefined;
  const live = permit ? liveStatus(permit) : null;
  const amendPending = permit ? await pendingAmendment(permit.id) : undefined;
  const canWithdraw = ["pending_review", "pending_approval", "returned"].includes(r.status);

  return (
    <Shell nav={APP_NAV} active="/apply" user={contact} kind="applicant">
      <PageTitle
        title={<span className="num">{r.ref}</span>}
        sub={r.kind === "amendment" && permit ? t(`طلب تعديل على التصريح ${permit.number}`, `Amendment of permit ${permit.number}`) : r.org_name}
        action={<Badge tone={requestTone[r.status]}>{t(...STATUS_LABEL[r.status])}</Badge>}
      />
      {sp.ok && <div className="mb-4"><Alert tone="ok">{t(`تم استلام طلبك برقم ${r.ref}، وأُرسل إشعار بالرقم المرجعي.`, `Request ${r.ref} received; a confirmation was sent.`)}</Alert></div>}
      {sp.files && <div className="mb-4"><Alert tone="hold">{t("تم حفظ الطلب، لكن بعض المرفقات رُفضت (النوع أو الحجم غير مسموح).", "Request saved, but some files were rejected (type or size).")}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card><StageBar status={r.status} /></Card>
          {r.status === "returned" && (
            <Alert tone="hold">
              <p className="font-semibold">{t("أعيد الطلب للاستكمال", "Returned for completion")}</p>
              <p className="mt-1">{r.reason}</p>
              <Link href={`/apply/new?resubmit=${r.id}`} className={`${btn.primary} mt-3`}>{t("استكمال البيانات وإعادة التقديم", "Complete & resubmit")}</Link>
            </Alert>
          )}
          {r.status === "rejected" && (
            <Alert tone="bad">
              <p className="font-semibold">{t("سبب الرفض", "Rejection reason")}</p>
              <p className="mt-1">{r.reason}</p>
            </Alert>
          )}
          {r.status === "approved" && permit && <Confetti once={`app-approved-${r.id}-${permit.version}`} />}
          {permit && live && (
            <Card title={t("التصريح", "Permit")} action={<Badge tone={liveTone[live]}>{t(...LIVE_LABEL[live])}</Badge>}>
              <p className="text-sm">
                <span className="num font-bold">{permit.number}</span> · {t("الإصدار", "Version")} <span className="num">{permit.version}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/permit/${permit.id}`} className={btn.secondary}>{t("تنزيل وطباعة التصريح", "Download / print")}</Link>
                {live !== "revoked" && live !== "expired" && (
                  <>
                    <Link href={`/pass/${permit.id}`} className={btn.primary}>{t("بطاقة الجوال (رمز متغير)", "Mobile pass (rotating code)")}</Link>
                    {amendPending ? <span className="self-center text-xs text-wait">{t(`تعديل قيد المراجعة: ${amendPending.ref}`, `Amendment under review: ${amendPending.ref}`)}</span> : <Link href={`/apply/new?amend=${permit.id}`} className={btn.ghost}>{t("طلب تعديل", "Request amendment")}</Link>}
                  </>
                )}
              </div>
            </Card>
          )}
          <RequestDetails r={r} />
        </div>
        <aside className="space-y-5">
          <Card title={t("سجل الطلب", "Request history")}><Timeline events={events} /></Card>
          <Card title={t("إجراءات", "Actions")}>
            <div className="flex flex-col gap-2">
              <Link href={`/apply/new?from=${r.id}`} className={btn.secondary}>{t("طلب مماثل", "Similar request")}</Link>
              {canWithdraw && (
                <form action={withdrawAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className={`${btn.secondary} w-full text-bad`}>{t("سحب الطلب", "Withdraw request")}</button>
                </form>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </Shell>
  );
}
