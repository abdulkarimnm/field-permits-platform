import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell, staffNav } from "@/components/Shell";
import { Alert, Badge, btn, Card, input, KV, liveTone, PageTitle } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { q } from "@/lib/db";
import { i18n } from "@/lib/i18n";
import { getPermit, LIVE_LABEL, liveStatus, pendingAmendment } from "@/lib/permits";
import { listGates, listZones } from "@/lib/settings";
import { permitStatusAction } from "./actions";
import { can } from "@/lib/rbac";

export default async function PermitAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; done?: string }> }) {
  const u = await requireCap("permit.view");
  const { id } = await params;
  const sp = await searchParams;
  const { t, fmtDate } = await i18n();
  const p = await getPermit(Number(id));
  if (!p) notFound();
  const s = liveStatus(p);
  const [zones, gates, amend, checks, versions] = await Promise.all([
    listZones(true),
    listGates(),
    pendingAmendment(p.id),
    q<{ id: number; at: Date; code_type: string; status_at_check: string; decision: string | null; deny_reason: string | null; gate_id: number; agency: string | null; offline: boolean; version: number | null; name: string }>(
      `SELECT c.*, u.name FROM checks c LEFT JOIN users u ON u.id=c.verifier_id WHERE c.permit_id=$1 ORDER BY c.id DESC LIMIT 50`,
      [p.id],
    ),
    q<{ id: number; ref: string; kind: string; status: string; stage2_at: Date | null }>(`SELECT id,ref,kind,status,stage2_at FROM requests WHERE id=$1 OR permit_id=$2 ORDER BY id`, [p.request_id, p.id]),
  ]);
  const canManage = can(u, "permit.manage");
  const gateName = (gid: number) => {
    const g = gates.find((x) => x.id === gid);
    return g ? t(g.name_ar, g.name_en) : "—";
  };

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/permits" user={u.name} kind="staff" wide>
      <Link href="/staff/permits" className="mb-3 inline-block text-sm text-ink-soft hover:text-brand">← {t("التصاريح", "Permits")}</Link>
      <PageTitle title={<span className="num">{p.number}</span>} sub={p.org_name} action={<Badge tone={liveTone[s]}>{t(...LIVE_LABEL[s])}</Badge>} />
      {sp.err && <div className="mb-4"><Alert tone="bad">{t("تعذر تنفيذ الإجراء: ", "Action failed: ")}{sp.err}</Alert></div>}
      {sp.done && <div className="mb-4"><Alert tone="ok">{t("تم التحديث. تظهر الحالة الجديدة للمتحقق فورًا.", "Updated. Verifiers see the new status immediately.")}</Alert></div>}
      {amend && <div className="mb-4"><Alert tone="wait">{t(`طلب تعديل قيد المراجعة: ${amend.ref}`, `Amendment under review: ${amend.ref}`)}</Alert></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
          <Card title={t("بيانات التصريح المعتمدة", "Approved permit data")} action={<Link href={`/permit/${p.id}`} className={btn.ghost}>{t("عرض PDF", "View PDF")}</Link>}>
            <dl className="grid gap-4 sm:grid-cols-3">
              <KV k={t("الإصدار الحالي", "Current version")} v={<span className="num">{p.version}</span>} />
              <KV k={t("من", "From")} v={fmtDate(p.valid_from)} />
              <KV k={t("إلى", "To")} v={fmtDate(p.valid_to)} />
              <KV k={t("المناطق", "Zones")} v={zones.filter((z) => p.zones.includes(z.id)).map((z) => t(z.name_ar, z.name_en)).join("، ")} />
              <KV k={t("الأفراد / المركبات / المعدات", "People / vehicles / equipment")} v={<span className="num">{p.data.people.length} / {p.data.vehicles.length} / {p.data.equipment.length}</span>} />
              <KV k={t("تاريخ الإصدار", "Issued")} v={fmtDate(p.issued_at)} />
            </dl>
            {p.status_reason && <p className="mt-4 rounded-lg bg-panel px-3 py-2 text-sm"><b>{t("سبب آخر تغيير:", "Last change reason:")}</b> {p.status_reason}</p>}
          </Card>

          <Card title={t("سجل التحقق الميداني", "Field verification log")}>
            {checks.length === 0 ? (
              <p className="text-sm text-ink-soft">{t("لم يُتحقق منه بعد", "Not checked yet")}</p>
            ) : (
              <ul className="-my-2 divide-y divide-line text-sm">
                {checks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="text-xs text-ink-soft">{fmtDate(c.at)}</span>
                    <span className="font-medium">{gateName(c.gate_id)}</span>
                    <span className="text-ink-soft">{c.name}{c.agency ? ` · ${c.agency}` : ""}</span>
                    <span className="ms-auto flex gap-1.5">
                      {c.offline && <Badge tone="hold">{t("دون اتصال", "offline")}</Badge>}
                      <Badge tone="off">{c.code_type}</Badge>
                      <Badge tone={c.status_at_check === "valid" ? "ok" : "bad"}>{c.status_at_check}</Badge>
                      {c.decision && <Badge tone={c.decision === "allowed" ? "ok" : "bad"}>{c.decision === "allowed" ? t("سُمح", "allowed") : t("مُنع", "denied")}</Badge>}
                    </span>
                    {c.deny_reason && <span className="w-full text-xs text-bad">{c.deny_reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          {canManage && s !== "revoked" && (
            <Card title={t("إيقاف / إعادة تفعيل / إلغاء", "Suspend / reactivate / revoke")}>
              <form action={permitStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <textarea name="reason" required rows={3} className={input} placeholder={t("السبب (إلزامي، يظهر في السجل وللجهة)", "Reason (required; logged and sent to the org)")} />
                <div className="grid gap-2">
                  {p.status === "suspended" ? (
                    <button name="action" value="reactivate" className={btn.primary}>{t("إعادة التفعيل", "Reactivate")}</button>
                  ) : (
                    <button name="action" value="suspend" className={btn.secondary}>{t("إيقاف مؤقت", "Suspend")}</button>
                  )}
                  <button name="action" value="revoke" className={btn.danger}>{t("إلغاء نهائي", "Revoke permanently")}</button>
                </div>
                <p className="text-xs text-ink-soft">{t("الإلغاء نهائي ولا يمكن التراجع عنه.", "Revocation is final.")}</p>
              </form>
            </Card>
          )}
          <Card title={t("الإصدارات والطلبات", "Versions & requests")}>
            <ul className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <Link href={`/staff/r/${v.id}`} className="num font-semibold text-brand hover:underline">{v.ref}</Link>
                  <span className="text-xs text-ink-soft">{v.kind === "amendment" ? t("تعديل", "amendment") : t("أصلي", "original")} · {v.status}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </Shell>
  );
}
