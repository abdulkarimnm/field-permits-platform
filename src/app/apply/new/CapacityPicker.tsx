"use client";
import { useEffect, useState } from "react";

type Grid = { dates: string[]; hours: number[]; cells: Record<string, { rem: number; cap: number }> };

export default function CapacityPicker({
  zones,
  fromDate,
  need,
  value,
  onChange,
  excludeId,
  t,
  lang,
}: {
  zones: number[];
  fromDate: string;
  need: number;
  value: { date: string | null; hour: number | null };
  onChange: (v: { date: string; hour: number }) => void;
  excludeId?: number;
  t: (a: string, e: string) => string;
  lang: string;
}) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [day, setDay] = useState<string | null>(value.date);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!zones.length) return;
    setLoading(true);
    const ctl = new AbortController();
    fetch(`/api/capacity?zones=${zones.join(",")}&from=${fromDate}&days=7${excludeId ? `&exclude=${excludeId}` : ""}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((g: Grid) => {
        setGrid(g);
        setDay((d) => (d && g.dates.includes(d) ? d : g.dates[0]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [zones, fromDate, excludeId]);

  if (!zones.length) return <p className="text-sm text-ink-soft">{t("اختر المناطق أولًا لعرض السعة المتاحة.", "Pick zones first to see available capacity.")}</p>;
  if (!grid) return <p className="text-sm text-ink-soft">{loading ? t("جارٍ تحميل السعة…", "Loading capacity…") : ""}</p>;

  const dayFmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2" role="tablist">
        {grid.dates.map((d) => {
          const free = grid.hours.filter((h) => (grid.cells[`${d}|${h}`]?.rem ?? 0) >= need).length;
          return (
            <button
              type="button"
              key={d}
              role="tab"
              aria-selected={day === d}
              onClick={() => setDay(d)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-start text-xs transition ${day === d ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-rose"}`}
            >
              <span className="block font-semibold">{dayFmt.format(new Date(d + "T00:00:00Z"))}</span>
              <span className={day === d ? "text-cream/80" : "text-ink-soft"}>
                {free} {t("فترة متاحة", "slots free")}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
        {grid.hours.map((h) => {
          const c = grid.cells[`${day}|${h}`] ?? { rem: 0, cap: 0 };
          const ok = c.rem >= need;
          const sel = value.date === day && value.hour === h;
          const pct = c.cap ? c.rem / c.cap : 0;
          return (
            <button
              type="button"
              key={h}
              disabled={!ok}
              onClick={() => day && onChange({ date: day, hour: h })}
              aria-pressed={sel}
              className={`rounded-lg border px-1 py-2 text-center transition disabled:cursor-not-allowed ${
                sel ? "border-brand bg-brand text-white" : ok ? "border-line bg-surface hover:border-brand" : "border-transparent bg-mist text-ink-soft/50 line-through"
              }`}
            >
              <span className="num block text-sm font-semibold">{String(h).padStart(2, "0")}:00</span>
              <span className={`mt-1 block h-1 rounded-full ${sel ? "bg-cream/40" : "bg-mist"}`}>
                <span className={`block h-1 rounded-full ${sel ? "bg-cream" : pct > 0.5 ? "bg-ok" : pct > 0.2 ? "bg-wait" : "bg-bad"}`} style={{ width: `${Math.max(0, pct) * 100}%` }} />
              </span>
              <span className={`num mt-1 block text-[11px] ${sel ? "text-cream" : ""}`}>
                {Math.max(0, c.rem)}/{c.cap}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {t(`الأرقام تمثل المركبات المتبقية في الساعة. طلبك يحتاج ${need} مركبة.`, `Numbers show vehicles remaining per hour. Your request needs ${need}.`)}
      </p>
    </div>
  );
}
