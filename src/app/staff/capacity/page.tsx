import Link from "next/link";
import { Shell, staffNav } from "@/components/Shell";
import { Card, PageTitle } from "@/components/ui";
import { requireCap } from "@/lib/auth";
import { i18n } from "@/lib/i18n";
import { capacityGrid } from "@/lib/permits";
import { listZones } from "@/lib/settings";

export default async function CapacityPage({ searchParams }: { searchParams: Promise<{ zone?: string }> }) {
  const u = await requireCap("capacity.view");
  const { t, lang } = await i18n();
  const zones = await listZones();
  const sp = await searchParams;
  const zone = zones.find((z) => String(z.id) === sp.zone) ?? zones[0];
  const from = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const grid = await capacityGrid([zone.id], from, 7);
  const dayFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

  return (
    <Shell nav={staffNav(u.roles)} active="/staff/capacity" user={u.name} kind="staff" wide>
      <PageTitle title={t("سعة المناطق", "Zone capacity")} sub={t("المركبات المحجوزة مقابل السعة لكل ساعة خلال 7 أيام. تُعدَّل السعة من الإعدادات.", "Booked vehicles vs. capacity per hour over 7 days. Edit capacity in Settings.")} />
      <div className="mb-4 flex flex-wrap gap-2">
        {zones.map((z) => (
          <Link key={z.id} href={`?zone=${z.id}`} className={`rounded-lg border px-3 py-2 text-sm font-medium ${z.id === zone.id ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-rose"}`}>
            {t(z.name_ar, z.name_en)} <span className="num opacity-75">({z.capacity_per_hour}/{t("س", "h")})</span>
          </Link>
        ))}
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-24" />
                {grid.hours.map((h) => <th key={h} className="num font-medium text-ink-soft">{String(h).padStart(2, "0")}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.dates.map((d) => (
                <tr key={d}>
                  <th className="whitespace-nowrap text-start font-medium">{dayFmt.format(new Date(d + "T00:00:00Z"))}</th>
                  {grid.hours.map((h) => {
                    const c = grid.cells[`${d}|${h}`];
                    const used = c.cap - c.rem;
                    const p = c.cap ? used / c.cap : 0;
                    const cls = used === 0 ? "bg-mist text-ink-soft/60" : p >= 1 ? "bg-bad text-white" : p > 0.7 ? "bg-wait text-white" : "bg-ok-soft text-ok";
                    return <td key={h} className={`num rounded-md py-2 font-semibold ${cls}`} title={`${used}/${c.cap}`}>{used || ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-ok-soft" /> {t("متاح", "available")}</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-wait" /> {t("أكثر من 70%", ">70%")}</span>
          <span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-bad" /> {t("ممتلئ", "full")}</span>
        </div>
      </Card>
    </Shell>
  );
}
