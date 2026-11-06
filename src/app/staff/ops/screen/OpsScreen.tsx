"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ticker } from "@/components/fx";
import type { ScreenData, ScreenEvent } from "@/lib/screen";
import { GATE_POS, GEO, ST, lvlOf } from "../CommandCenter";

/* Series colours (validated status palette + two flow hues), always paired with a text label. */
const C = { in: "#6cc79a", out: "#9fd6ec", bad: "#e0524a", gold: "#e9cfa6" };
const POLL_MS = 5000;

type Layer = "presence" | "load";

export default function OpsScreen({ initial, lang, gateZones }: { initial: ScreenData; lang: "ar" | "en"; gateZones: { id: number; zone_ids: number[] }[] }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const [d, setD] = useState(initial);
  const [lastOk, setLastOk] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [authLost, setAuthLost] = useState(false);
  const [layer, setLayer] = useState<Layer>("presence");
  const [sound, setSound] = useState(false);
  const [full, setFull] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seen = useRef(new Set(initial.events.map((e) => e.id)));
  const audio = useRef<AudioContext | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* clock */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* live feed */
  const beep = useCallback((bad: boolean) => {
    const ctx = audio.current;
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = bad ? 520 : 880;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (bad ? 0.6 : 0.18));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.65);
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/ops/screen", { cache: "no-store" });
        if (r.status === 401) return setAuthLost(true);
        if (!r.ok) return;
        const next: ScreenData = await r.json();
        if (stop) return;
        const added = next.events.filter((e) => !seen.current.has(e.id));
        added.forEach((e) => seen.current.add(e.id));
        if (added.length) {
          setFresh(new Set(added.map((e) => e.id)));
          if (sound && added.some((e) => e.kind === "suspicious" || e.kind === "denied")) beep(true);
        }
        setD(next);
        setLastOk(Date.now());
        setAuthLost(false);
      } catch {}
    };
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [sound, beep]);

  /* keep the TV awake */
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try { lock = await (navigator as unknown as { wakeLock?: { request: (k: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch {}
    };
    req();
    const vis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())?.catch(() => {});
  const toggleSound = () => {
    if (!audio.current) audio.current = new AudioContext();
    setSound((s) => { if (!s) setTimeout(() => beep(false), 0); return !s; });
  };

  const stale = now - lastOk > 20_000;
  const ago = Math.max(0, Math.round((now - lastOk) / 1000));
  const gateName = (id: number) => { const g = d.gates.find((x) => x.id === id); return g ? t(g.name_ar, g.name_en) : `#${id}`; };
  const zoneName = (id: number | null) => { const z = d.zones.find((x) => x.id === id); return z ? t(z.name_ar, z.name_en) : "—"; };
  const k = d.kpi;

  const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Riyadh" }).format(now);
  const greg = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(now);
  const hijri = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(now);
  const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));

  return (
    <div ref={rootRef} dir={lang === "ar" ? "rtl" : "ltr"} className="ops-screen fixed inset-0 z-[60] flex flex-col gap-3 overflow-y-auto lg:overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#5a2a20_0%,#3a1912_55%,#2a110c_100%)] p-3 text-cream sm:p-4 2xl:gap-4 2xl:p-5">
      {/* ── header ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <svg viewBox="0 0 48 40" className="h-9 w-11 shrink-0 2xl:h-11 2xl:w-14" aria-hidden><g fill="none" stroke="#e9cfa6" strokeWidth="2.4"><path d="M3 38V16a8 8 0 0 1 16 0v22M17 38V12a8 8 0 0 1 16 0v26M31 38V16a8 8 0 0 1 16 0v22" /></g></svg>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-white 2xl:text-3xl">{t("شاشة العمليات", "Operations screen")} <span className="font-normal text-cream/60">· {t("ميدان سيد الشهداء", "Sayyid Al-Shuhada Field")}</span></h1>
            <p className="text-xs text-cream/55 2xl:text-sm">{t("الدخول والخروج لحظة بلحظة من سجل البوابات", "Entries and exits, live from the gate log")}</p>
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2 text-xs 2xl:text-sm">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold ${stale || authLost ? "bg-[#e0524a]/20 text-[#ffb4ab]" : "bg-[#6cc79a]/15 text-[#a8e6c4]"}`} role="status" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${stale || authLost ? "bg-[#e0524a]" : "live-dot bg-[#6cc79a]"}`} />
            {authLost ? t("انتهت الجلسة — سجّل الدخول", "Session ended — sign in") : stale ? t(`انقطاع · آخر تحديث قبل ${ago} ث`, `Disconnected · ${ago}s ago`) : t(`مباشر · قبل ${ago} ث`, `Live · ${ago}s ago`)}
          </span>
          <span className={`rounded-full border px-3 py-1.5 ${d.chain.ok ? "border-white/15 text-cream/75" : "border-[#e0524a] bg-[#e0524a]/20 font-bold text-[#ffb4ab]"}`}>
            {d.chain.ok ? t(`سلسلة السجل سليمة · ${d.chain.count}`, `Audit chain intact · ${d.chain.count}`) : t("تحذير: تلاعب في السجل", "WARNING: audit tampering")}
          </span>
          <button onClick={toggleSound} aria-pressed={sound} className="min-h-9 rounded-full border border-white/15 px-3 hover:border-gold/60">{sound ? t("صوت التنبيه: مفعّل", "Alert sound: on") : t("صوت التنبيه: مغلق", "Alert sound: off")}</button>
          <button onClick={toggleFull} className="min-h-9 rounded-full border border-white/15 px-3 hover:border-gold/60">{full ? t("الخروج من ملء الشاشة", "Exit full screen") : t("ملء الشاشة", "Full screen")}</button>
          <Link href="/staff/ops" className="min-h-9 content-center rounded-full border border-white/15 px-3 hover:border-gold/60">{t("غرفة العمليات", "Ops room")}</Link>
        </div>
        <div className="text-end">
          <p className="num font-display text-3xl font-bold leading-none text-white 2xl:text-5xl" dir="ltr">{clock}</p>
          <p className="mt-1 text-[11px] text-cream/55 2xl:text-xs">{greg} · {hijri}</p>
        </div>
      </header>

      {/* ── KPIs ── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label={t("المؤشرات", "Indicators")}>
        <Kpi big label={t("داخل الميدان الآن", "Inside now")} value={k.insidePeople} unit={t("فرد", "people")} sub={t(`${k.insideVehicles} مركبة · ${k.insideParties} تصريح`, `${k.insideVehicles} vehicles · ${k.insideParties} permits`)} />
        <Kpi label={t("دخول اليوم", "Entries today")} value={k.inPeople} unit={t("فرد", "people")} color={C.in} sub={t(`${k.inVehicles} مركبة`, `${k.inVehicles} vehicles`)} icon="↓" />
        <Kpi label={t("خروج اليوم", "Exits today")} value={k.outPeople} unit={t("فرد", "people")} color={C.out} sub={t(`${k.outVehicles} مركبة`, `${k.outVehicles} vehicles`)} icon="↑" />
        <Kpi label={t("تصاريح سارية الآن", "Valid permits")} value={k.validPermits} sub={t(`${k.upcomingPermits} تبدأ لاحقًا`, `${k.upcomingPermits} upcoming`)} />
        <Kpi label={t("رفض عند البوابات اليوم", "Gate rejections today")} value={k.denied + k.tamper} color={k.denied + k.tamper ? "#f3897f" : undefined} sub={t(`${k.tamper} رمز مزيف/قديم · نسبة المنع ${k.deniedRate}%`, `${k.tamper} fake/stale · denial ${k.deniedRate}%`)} />
        <Kpi label={t("تنبيهات مفتوحة", "Open alerts")} value={k.alerts} danger={k.critical > 0} sub={k.critical ? t(`${k.critical} حرجة`, `${k.critical} critical`) : t("لا يوجد حرج", "None critical")} />
      </section>

      {/* ── main ── */}
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(15rem,22%)_1fr_minmax(15rem,21%)] 2xl:gap-4">
        {/* events (start side) */}
        <Panel title={t("الأحداث لحظة بلحظة", "Live events")} meta={t(`آخر ${d.events.length} عملية`, `last ${d.events.length}`)} className="order-3 lg:order-1">
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-1">
            {d.events.map((e) => <EventRow key={e.id} e={e} isNew={fresh.has(e.id)} gate={gateName(e.gate_id)} time={hhmm(e.at)} t={t} />)}
          </ul>
        </Panel>

        {/* map */}
        <Panel
          title={t("خريطة الميدان المباشرة", "Live field map")}
          className="order-1 lg:order-2"
          action={
            <div className="flex rounded-full bg-black/25 p-0.5 text-xs" role="radiogroup" aria-label={t("طبقة الخريطة", "Map layer")}>
              {([["presence", t("التواجد (الأفراد بالداخل)", "Presence (people inside)")], ["load", t("الازدحام (مركبات هذه الساعة)", "Congestion (vehicles this hour)")]] as const).map(([key, l]) => (
                <button key={key} role="radio" aria-checked={layer === key} onClick={() => setLayer(key)} className={`rounded-full px-3 py-1.5 font-semibold transition ${layer === key ? "bg-gold-soft text-noir" : "text-cream/70 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          }
        >
          <FieldMap d={d} layer={layer} gateZones={gateZones} fresh={fresh} t={t} />
        </Panel>

        {/* alerts + gates (end side) */}
        <div className="order-2 flex min-h-0 flex-col gap-3 lg:order-3">
          <Panel title={t("التنبيهات", "Alerts")} meta={String(d.alerts.length)} className="max-h-[45%] shrink-0">
            <ul className="min-h-0 space-y-2 overflow-y-auto">
              {d.alerts.length === 0 && <li className="rounded-xl border border-[#6cc79a]/30 bg-[#6cc79a]/10 px-3 py-2.5 text-sm text-[#a8e6c4]">✓ {t("الوضع مستقر — لا تنبيهات", "All clear — no alerts")}</li>}
              {d.alerts.map((a) => (
                <li key={a.id} className={`rounded-xl border px-3 py-2.5 ${a.level === "critical" ? "alert-crit border-[#e0524a]/60 bg-[#e0524a]/15" : "border-[#d9a441]/40 bg-[#d9a441]/10"}`}>
                  <p className="text-sm font-bold text-white">{a.level === "critical" ? "▲ " : "! "}{t(a.ar[0], a.en[0])}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-cream/70">{t(a.ar[1], a.en[1])}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t("البوابات", "Gates")} className="min-h-0 flex-1">
            <ul className="min-h-0 space-y-2 overflow-y-auto">
              {d.gates.map((g) => {
                const warn = g.bad15 > 0;
                const idle = !g.last15;
                return (
                  <li key={g.id} className={`rounded-xl border p-3 ${warn ? "border-[#e0524a]/60 bg-[#e0524a]/12" : "border-white/10 bg-white/[.03]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-white">{t(g.name_ar, g.name_en)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${warn ? "bg-[#e0524a] text-white" : idle ? "bg-white/10 text-cream/60" : "bg-[#6cc79a]/20 text-[#a8e6c4]"}`}>
                        {warn ? t("إنذار", "Alarm") : idle ? t("لا نشاط", "Idle") : t("نشطة", "Active")}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
                      <GateStat k={t("دخول", "In")} v={g.in} c={C.in} />
                      <GateStat k={t("خروج", "Out")} v={g.out} c={C.out} />
                      <GateStat k={t("رفض", "Denied")} v={g.denied} c={g.denied ? "#f3897f" : undefined} />
                      <GateStat k={t("آخر 15 د", "15 min")} v={g.last15} />
                    </dl>
                    <p className="mt-1.5 text-[11px] text-cream/45">{g.lastAt ? t(`آخر نشاط ${hhmm(g.lastAt)}`, `Last activity ${hhmm(g.lastAt)}`) : t("لا نشاط اليوم", "No activity today")}</p>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      {/* ── bottom ── */}
      <div className="grid shrink-0 gap-3 lg:h-[24%] lg:min-h-[11rem] lg:grid-cols-[minmax(15rem,22%)_1fr_minmax(15rem,21%)] 2xl:gap-4">
        <Panel title={t("المناطق الآن", "Zones now")}>
          <ul className="min-h-0 space-y-2 overflow-y-auto pe-1">
            {d.zones.map((z) => {
              const r = z.cap ? Math.max(z.bookedNow, z.enteredNow) / z.cap : 0;
              const lvl = lvlOf(r);
              return (
                <li key={z.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-white">{t(z.name_ar, z.name_en)}{z.sensitive && <span className="ms-1.5 text-[10px] text-[#f0a46a]">{t("حساسة", "sensitive")}</span>}</span>
                    <span className="num text-cream/60">{t(`${z.presence} بالداخل · ${Math.max(z.bookedNow, z.enteredNow)}/${z.cap} مركبة/س`, `${z.presence} inside · ${Math.max(z.bookedNow, z.enteredNow)}/${z.cap} veh/h`)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, r * 100)}%`, background: ST[lvl].c }} /></div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title={t("الدخول والخروج · آخر ساعتين", "Entries & exits · last 2 hours")} meta={t("كل عمود 5 دقائق", "5-minute bars")}>
          <FlowChart flow={d.flow} t={t} />
        </Panel>
        <Panel title={t("بالداخل الآن حسب التصريح", "Inside now by permit")} meta={String(d.inside.length)}>
          <ul className="min-h-0 space-y-1.5 overflow-y-auto pe-1 text-xs">
            {d.inside.length === 0 && <li className="text-cream/50">{t("لا أحد بالداخل", "Nobody inside")}</li>}
            {d.inside.map((p) => (
              <li key={p.number} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${p.expired ? "bg-[#e0524a]/15 ring-1 ring-[#e0524a]/50" : "bg-white/[.04]"}`}>
                <span className="num font-bold text-white">{p.people}</span>
                <span className="min-w-0 flex-1 truncate">{p.org}<span className="text-cream/45"> · {zoneName(p.zone)}</span></span>
                {p.expired ? <span className="shrink-0 font-bold text-[#ffb4ab]">{t("منتهٍ", "expired")}</span> : p.since && <span className="num shrink-0 text-cream/45">{t("منذ", "since")} {hhmm(p.since).slice(0, 5)}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, meta, action, className = "", children }: { title: string; meta?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col rounded-2xl max-lg:max-h-[28rem] border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur 2xl:p-4 ${className}`}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white 2xl:text-base"><span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-gold-soft to-brand" />{title}</h2>
        {meta && <span className="text-[11px] text-cream/45">{meta}</span>}
        {action && <div className="ms-auto">{action}</div>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function Kpi({ label, value, unit, sub, color, icon, big, danger }: { label: string; value: number; unit?: string; sub?: string; color?: string; icon?: string; big?: boolean; danger?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3 2xl:p-4 ${danger ? "alert-crit border-[#e0524a]/70 bg-gradient-to-b from-[#a8322a] to-[#7a2019]" : big ? "border-gold/40 bg-gradient-to-b from-white/[.10] to-white/[.03]" : "border-white/10 bg-black/20"}`}>
      <p className="text-xs text-cream/65 2xl:text-sm">{icon && <span style={{ color }} className="me-1 font-bold">{icon}</span>}{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <Ticker value={value} className={`num font-display font-bold leading-none ${big ? "text-5xl 2xl:text-7xl" : "text-4xl 2xl:text-6xl"}`} />
        {unit && <span className="text-xs text-cream/55">{unit}</span>}
      </p>
      {color && <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: color }} />}
      {sub && <p className="mt-1.5 truncate text-[11px] text-cream/55 2xl:text-xs">{sub}</p>}
    </div>
  );
}

function GateStat({ k, v, c }: { k: string; v: number; c?: string }) {
  return (
    <div>
      <dd className="num text-xl font-bold leading-none 2xl:text-2xl" style={{ color: c ?? "#fff6e6" }}>{v}</dd>
      <dt className="mt-0.5 text-[10px] text-cream/50">{k}</dt>
    </div>
  );
}

const EV = {
  in: { c: C.in, icon: "↓", ar: "دخول", en: "Entry" },
  out: { c: C.out, icon: "↑", ar: "خروج", en: "Exit" },
  denied: { c: C.bad, icon: "✕", ar: "منع دخول", en: "Denied" },
  suspicious: { c: C.bad, icon: "▲", ar: "رمز مزيف أو قديم", en: "Fake/stale code" },
  lookup: { c: C.gold, icon: "?", ar: "استعلام", en: "Lookup" },
} as const;

function EventRow({ e, isNew, gate, time, t }: { e: ScreenEvent; isNew: boolean; gate: string; time: string; t: (a: string, b: string) => string }) {
  const s = EV[e.kind];
  return (
    <li className={`rounded-xl border-s-[3px] bg-white/[.04] px-3 py-2 ${isNew ? "ev-new" : ""}`} style={{ borderInlineStartColor: s.c }}>
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-noir" style={{ background: s.c }} aria-hidden>{s.icon}</span>
        <span className="text-sm font-bold text-white">{t(s.ar, s.en)}</span>
        {(e.kind === "in" || e.kind === "out") && <span className="num text-xs text-cream/70">{t(`${e.people} فرد${e.vehicles ? ` · ${e.vehicles} مركبة` : ""}`, `${e.people} ppl${e.vehicles ? ` · ${e.vehicles} veh` : ""}`)}</span>}
        <span className="num ms-auto text-[11px] text-cream/45" dir="ltr">{time}</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-cream/55">
        {gate}{e.number ? <> · <span className="num">{e.number}</span></> : <> · {t("غير معروف", "unknown")}</>}{e.org ? ` · ${e.org}` : ""}
      </p>
    </li>
  );
}

function FieldMap({ d, layer, gateZones, fresh, t }: { d: ScreenData; layer: Layer; gateZones: { id: number; zone_ids: number[] }[]; fresh: Set<number>; t: (a: string, b: string) => string }) {
  const maxP = Math.max(20, ...d.zones.map((z) => z.presence));
  const freshGates = useMemo(() => new Set(d.events.filter((e) => fresh.has(e.id)).map((e) => e.gate_id)), [d.events, fresh]);
  return (
    <div className="relative min-h-[20rem] flex-1 lg:min-h-0">
      <svg viewBox="0 0 1000 690" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" role="img" aria-label={t("مخطط الميدان", "Field plan")}>
        <defs>
          <pattern id="os-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(233,207,166,.06)" /></pattern>
          {(Object.keys(ST) as (keyof typeof ST)[]).map((k) => (
            <radialGradient key={k} id={`os-glow-${k}`}><stop offset="0" stopColor={ST[k].c} stopOpacity=".5" /><stop offset="1" stopColor={ST[k].c} stopOpacity="0" /></radialGradient>
          ))}
        </defs>
        <rect width="1000" height="690" fill="url(#os-grid)" />
        <g transform="translate(940 60)"><circle r="22" fill="rgba(0,0,0,.25)" stroke="rgba(233,207,166,.35)" /><path d="M0 -15 L5 2 L0 -2 L-5 2 Z" fill="#e9cfa6" /><text y="18" textAnchor="middle" fontSize="11" fill="#e9cfa6">N</text></g>
        <g fill="none" stroke="rgba(233,207,166,.16)" strokeWidth="14" strokeLinecap="round"><path d="M40 300 H 330" /><path d="M505 690 V 430" /><path d="M1000 520 H 720" /></g>
        {gateZones.map((g) => {
          const p = GATE_POS[g.id];
          if (!p) return null;
          const live = d.gates.find((x) => x.id === g.id)?.last15;
          return g.zone_ids.map((zid) => {
            const z = d.zones.find((x) => x.id === zid);
            const geo = z && GEO[z.code];
            if (!geo) return null;
            const [x, y] = geo.c;
            return <path key={`${g.id}-${zid}`} d={`M${p[0]} ${p[1]} Q ${(p[0] + x) / 2} ${Math.min(p[1], y) - 40} ${x} ${y}`} fill="none" stroke={live ? "rgba(243,220,181,.65)" : "rgba(233,207,166,.13)"} strokeWidth={live ? 2 : 1.2} strokeDasharray="6 8" className={live ? "flow" : ""} />;
          });
        })}
        {d.zones.map((z) => {
          const geo = GEO[z.code];
          if (!geo) return null;
          const r = layer === "presence" ? z.presence / maxP : z.cap ? Math.max(z.bookedNow, z.enteredNow) / z.cap : 0;
          const lvl = layer === "presence" ? (z.presence ? (r >= 0.85 ? "crit" : r >= 0.5 ? "busy" : "ok") : "idle") : lvlOf(r);
          const s = ST[lvl];
          return (
            <g key={z.id}>
              {lvl !== "idle" && <circle cx={geo.c[0]} cy={geo.c[1]} r={55 + Math.min(1, r) * 95} fill={`url(#os-glow-${lvl})`} className={lvl === "crit" ? "heat" : ""} />}
              <path d={geo.d} fill={s.c} fillOpacity={lvl === "idle" ? 0.12 : 0.22 + Math.min(1, r) * 0.38} stroke={z.sensitive ? "rgba(240,164,106,.95)" : "rgba(233,207,166,.5)"} strokeWidth={1.6} strokeDasharray={z.sensitive ? "7 5" : undefined} className="transition-[fill-opacity,fill] duration-700" />
              <text x={geo.c[0]} y={geo.c[1] - 16} textAnchor="middle" fontSize="26" fontWeight="700" fill="#fbf1ea" style={{ paintOrder: "stroke", stroke: "rgba(40,16,10,.65)", strokeWidth: 4 }}>{t(z.name_ar, z.name_en)}</text>
              <g transform={`translate(${geo.c[0]} ${geo.c[1] + 20})`}>
                <rect x="-80" y="-17" width="160" height="34" rx="17" fill="rgba(40,16,10,.72)" stroke={s.c} strokeOpacity=".75" />
                <text textAnchor="middle" dy="6" fontSize="19" fontWeight="700" fill="#fff6e6">{s.icon} {layer === "presence" ? `${z.presence} ${t("فرد", "ppl")}` : `${Math.max(z.bookedNow, z.enteredNow)}/${z.cap}`}</text>
              </g>
            </g>
          );
        })}
        {d.gates.map((g) => {
          const p = GATE_POS[g.id];
          if (!p) return null;
          const warn = g.bad15 > 0;
          return (
            <g key={g.id} transform={`translate(${p[0]} ${p[1]})`}>
              {freshGates.has(g.id) && <circle r="16" fill="none" stroke={warn ? C.bad : C.gold} strokeWidth="2" className="ripple" />}
              <circle r="17" fill="#3a1912" stroke={warn ? C.bad : "rgba(233,207,166,.8)"} strokeWidth={warn ? 3 : 2} />
              <path d="M-7 7 V-1 a7 7 0 0 1 14 0 V7" fill="none" stroke="#e9cfa6" strokeWidth="2" />
              {g.last15 > 0 && (
                <g transform="translate(14 -14)"><circle r="10" fill={warn ? C.bad : "#d9a441"} /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#2a110c">{g.last15}</text></g>
              )}
              <text y="40" textAnchor="middle" fontSize="18" fontWeight="700" fill="#f3e6dc" style={{ paintOrder: "stroke", stroke: "rgba(40,16,10,.7)", strokeWidth: 4 }}>{t(g.name_ar, g.name_en)}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-0 start-0 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-black/30 px-2.5 py-1.5 text-[11px] text-cream/75">
        {layer === "presence" ? (
          <>
            <Legend c={ST.ok.c} l={t("تواجد منخفض", "Low presence")} />
            <Legend c={ST.busy.c} l={t("متوسط", "Medium")} />
            <Legend c={ST.crit.c} l={t("الأعلى تواجدًا", "Highest")} />
          </>
        ) : (
          <>
            <Legend c={ST.ok.c} l={t("متاح", "Available")} />
            <Legend c={ST.busy.c} l={t("مزدحم ≥60%", "Busy ≥60%")} />
            <Legend c={ST.crit.c} l={t("حرج ≥85%", "Critical ≥85%")} />
          </>
        )}
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-3.5 rounded-sm border border-dashed border-[#f0a46a]" />{t("منطقة حساسة", "Sensitive")}</span>
        <span className="inline-flex items-center gap-1"><span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-[#d9a441] text-[8px] font-bold text-noir">n</span>{t("عمليات البوابة آخر 15 د", "Gate ops, 15 min")}</span>
      </div>
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>;
}

function FlowChart({ flow, t }: { flow: ScreenData["flow"]; t: (a: string, b: string) => string }) {
  const W = 1000, H = 150, PAD = 22;
  const max = Math.max(4, ...flow.map((f) => Math.max(f.in, f.out)));
  const bw = (W - PAD * 2) / Math.max(1, flow.length);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));
  const tot = flow.reduce((s, f) => ({ in: s.in + f.in, out: s.out + f.out, bad: s.bad + f.denied }), { in: 0, out: 0, bad: 0 });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex gap-4 text-[11px] text-cream/75">
        <Legend c={C.in} l={`${t("دخول", "In")} ${tot.in}`} />
        <Legend c={C.out} l={`${t("خروج", "Out")} ${tot.out}`} />
        <Legend c={C.bad} l={`${t("رفض", "Denied")} ${tot.bad}`} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1" style={{ direction: "ltr" }} role="img" aria-label={t(`آخر ساعتين: ${tot.in} دخول، ${tot.out} خروج، ${tot.bad} رفض`, `Last 2h: ${tot.in} in, ${tot.out} out, ${tot.bad} denied`)}>
        {[0.5, 1].map((g) => <line key={g} x1={PAD} x2={W - PAD} y1={y(max * g)} y2={y(max * g)} stroke="rgba(255,255,255,.07)" />)}
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="rgba(255,255,255,.18)" />
        {flow.map((f, i) => {
          const x = PAD + i * bw;
          const w = Math.max(2, bw / 2 - 1.5);
          return (
            <g key={f.t}>
              {f.in > 0 && <rect x={x + 1} y={y(f.in)} width={w} height={H - PAD - y(f.in)} rx="2" fill={C.in}><title>{`${hhmm(f.t)} · ${t("دخول", "in")} ${f.in}`}</title></rect>}
              {f.out > 0 && <rect x={x + 1 + w + 1} y={y(f.out)} width={w} height={H - PAD - y(f.out)} rx="2" fill={C.out}><title>{`${hhmm(f.t)} · ${t("خروج", "out")} ${f.out}`}</title></rect>}
              {f.denied > 0 && <circle cx={x + bw / 2} cy={H - PAD - 6} r="4" fill={C.bad}><title>{`${hhmm(f.t)} · ${t("رفض", "denied")} ${f.denied}`}</title></circle>}
              {i % 6 === 0 && <text x={x} y={H - 5} fontSize="11" fill="rgba(243,230,220,.5)">{hhmm(f.t)}</text>}
            </g>
          );
        })}
        <text x={W - PAD} y={H - 5} fontSize="11" textAnchor="end" fill="rgba(159,214,236,.8)">{t("الآن", "now")}</text>
      </svg>
    </div>
  );
}
