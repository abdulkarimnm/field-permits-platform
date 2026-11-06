import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { Badge, btn, Card, Empty, input, laneTone, liveTone, PageTitle, requestTone } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { LANE_LABEL, LIVE_LABEL, liveStatus, STATUS_LABEL } from "@/lib/permits";
import { searchRequests, type SearchFilters } from "@/lib/search";
import { listZones } from "@/lib/settings";

export default async function PermitsPage({ searchParams }: { searchParams: Promise<SearchFilters> }) {
  const u = await requireCap("permit.view");
  const { t, fmtDate } = await i18n();
  const f = await searchParams;
  const [rows, zones] = await Promise.all([searchRequests(f), listZones(true)]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/permits" user={u.name} kind="staff" wide>
      <PageTitle
        title={t("التصاريح والطلبات", "Permits & requests")}
        sub={t("ابحث بالرقم أو الجهة أو الجوال أو اللوحة أو الهوية.", "Search by number, organization, phone, plate or ID.")}
        action={<a href={`/api/export?${qs}`} className={btn.secondary}>{t("تصدير CSV", "Export CSV")}</a>}
      />
      <form className="mb-5 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input name="q" defaultValue={f.q} className={input} placeholder={t("رقم، جهة، جوال، لوحة، هوية…", "Number, org, phone, plate, ID…")} aria-label={t("بحث", "Search")} />
        <select name="status" defaultValue={f.status ?? ""} className={input} aria-label={t("الحالة", "Status")}>
          <option value="">{t("كل الحالات", "All statuses")}</option>
          <optgroup label={t("حالة الطلب", "Request")}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{t(...v)}</option>)}
          </optgroup>
          <optgroup label={t("حالة التصريح", "Permit")}>
            {Object.entries(LIVE_LABEL).map(([k, v]) => <option key={k} value={k}>{t(...v)}</option>)}
          </optgroup>
        </select>
        <select name="zone" defaultValue={f.zone ?? ""} className={input} aria-label={t("المنطقة", "Zone")}>
          <option value="">{t("كل المناطق", "All zones")}</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{t(z.name_ar, z.name_en)}</option>)}
        </select>
        <input type="date" name="from" defaultValue={f.from} className={input} aria-label={t("من تاريخ", "From")} />
        <input type="date" name="to" defaultValue={f.to} className={input} aria-label={t("إلى تاريخ", "To")} />
        <button className={btn.primary}>{t("بحث", "Search")}</button>
      </form>

      <Card>
        {rows.length === 0 ? (
          <Empty>{t("لا نتائج", "No results")}</Empty>
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-soft"><span className="num">{rows.length}</span> {t("نتيجة", "results")}</p>
            <ul className="-my-2 divide-y divide-line">
              {rows.map((r) => {
                const live = r.permit_status ? liveStatus({ status: r.permit_status as never, valid_from: r.valid_from, valid_to: r.valid_to }) : null;
                return (
                  <li key={r.id} className="grid gap-1.5 py-3 md:grid-cols-[9rem_9rem_1fr_auto] md:items-center md:gap-3">
                    <Link href={`/staff/r/${r.id}`} className="num text-sm font-semibold text-brand hover:underline">{r.ref}</Link>
                    {r.permit_id ? (
                      <Link href={`/staff/permits/${r.permit_id}`} className="num text-sm font-semibold hover:underline">{r.permit_number} <span className="text-xs text-ink-soft">v{r.permit_version}</span></Link>
                    ) : <span className="hidden text-ink-soft md:block">—</span>}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.org_name}</span>
                      <span className="block truncate text-xs text-ink-soft">
                        {fmtDate(r.valid_from)} ← {fmtDate(r.valid_to)} · <span className="num">{r.people_n}</span> {t("فرد", "ppl")} · <span className="num">{r.vehicles_n}</span> {t("مركبة", "veh")}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={requestTone[r.status]}>{t(...STATUS_LABEL[r.status])}</Badge>
                      {live && <Badge tone={liveTone[live]}>{t(...LIVE_LABEL[live])}</Badge>}
                      <Badge tone={laneTone[r.lane]}>{t(...LANE_LABEL[r.lane as "fast"])}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </Shell>
  );
}
