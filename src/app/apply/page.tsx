import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Badge, btn, Card, Empty, liveTone, PageTitle, requestTone } from "@/components/ui";
import { requireApplicant } from "@/lib/auth";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { LIVE_LABEL, liveStatus, STATUS_LABEL, type PermitRow, type RequestRow } from "@/lib/permits";
import { APP_NAV } from "./nav";

export default async function ApplicantHome() {
  const contact = await requireApplicant();
  const { t, fmtDate } = await i18n();
  const [reqs, permits] = await Promise.all([
    q<RequestRow & { permit_number: string | null }>(
      `SELECT r.*, p.number permit_number FROM requests r LEFT JOIN permits p ON p.id=r.permit_id WHERE r.contact=$1 ORDER BY r.id DESC LIMIT 100`,
      [contact],
    ),
    q<PermitRow>(`SELECT * FROM permits WHERE contact=$1 ORDER BY id DESC`, [contact]),
  ]);
  const needs = reqs.filter((r) => r.status === "returned");

  return (
    <Shell nav={APP_NAV} active="/apply" user={contact} kind="applicant">
      <PageTitle
        title={t("طلباتي وتصاريحي", "My requests & permits")}
        sub={t("مرتبطة بوسيلة التواصل التي تحققت منها فقط.", "Linked only to the contact you verified.")}
        action={
          <div className="flex flex-wrap gap-2">
            {reqs[0] && (
              <Link href={`/apply/new?from=${reqs[0].id}`} className={btn.secondary} title={t("ينسخ الجهة والممثل والأفراد والمركبات والمعدات من آخر طلب", "Copies org, rep, people, vehicles & equipment from your last request")}>
                {t("طلب مماثل لآخر طلب", "Repeat last request")}
              </Link>
            )}
            <Link href="/apply/new" className={btn.primary}>+ {t("طلب جديد", "New request")}</Link>
          </div>
        }
      />

      {needs.length > 0 && (
        <div className="mb-5 rounded-2xl border border-hold/30 bg-hold-soft p-4">
          <p className="text-sm font-semibold text-hold">{t("طلبات تحتاج استكمالك", "Requests waiting for you")}</p>
          <ul className="mt-2 space-y-1">
            {needs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className="num font-semibold">{r.ref}</span> — {r.reason}</span>
                <Link className={btn.ghost} href={`/apply/new?resubmit=${r.id}`}>{t("استكمال", "Complete")}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card title={t("الطلبات", "Requests")}>
          {reqs.length === 0 ? (
            <Empty>{t("لا توجد طلبات بعد. ابدأ بتقديم طلبك الأول.", "No requests yet. Submit your first one.")}</Empty>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {reqs.map((r) => (
                <li key={r.id}>
                  <Link href={`/apply/r/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-paper/60">
                    <span className="num text-sm font-semibold text-brand">{r.ref}</span>
                    {r.kind === "amendment" && <Badge tone="brand">{t("تعديل", "Amendment")}</Badge>}
                    <Badge tone={requestTone[r.status]}>{t(...STATUS_LABEL[r.status])}</Badge>
                    <span className="w-full truncate text-sm text-ink-soft sm:w-auto sm:flex-1">{r.purpose}</span>
                    <span className="text-xs text-ink-soft">{fmtDate(r.submitted_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("التصاريح الصادرة", "Issued permits")}>
          {permits.length === 0 ? (
            <Empty>{t("تظهر هنا بعد الاعتماد النهائي.", "Appear here after final approval.")}</Empty>
          ) : (
            <ul className="space-y-3">
              {permits.map((p) => {
                const s = liveStatus(p);
                return (
                  <li key={p.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="num text-sm font-bold">{p.number}</span>
                      <Badge tone={liveTone[s]}>{t(...LIVE_LABEL[s])}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      {fmtDate(p.valid_from)} ← {fmtDate(p.valid_to)} · {t("الإصدار", "v")} <span className="num">{p.version}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/permit/${p.id}`} className={`${btn.secondary} min-h-9 px-3 py-1.5`}>{t("التصريح PDF", "Permit PDF")}</Link>
                      {s !== "revoked" && s !== "expired" && (
                        <Link href={`/pass/${p.id}`} className={`${btn.primary} min-h-9 px-3 py-1.5`}>{t("بطاقة الجوال", "Mobile pass")}</Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
