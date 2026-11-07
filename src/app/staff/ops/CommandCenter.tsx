"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Field3D from "./Field3D";
import type { CommandData, GateSeries, OpsAlert, ZoneSeries } from "@/lib/ops";

/* ───────── site plan geometry (north up), keyed by zone code ───────── */
export const GEO: Record<string, { d: string; c: [number, number] }> = {
  D: { d: "M330 175 C 340 95, 470 60, 560 70 C 650 80, 720 120, 705 180 C 690 235, 560 240, 470 232 C 390 226, 322 220, 330 175 Z", c: [515, 150] },
  A: { d: "M360 262 H 690 Q 708 262 708 280 V 398 Q 708 416 690 416 H 360 Q 342 416 342 398 V 280 Q 342 262 360 262 Z", c: [525, 340] },
  E: { d: "M742 150 C 790 230, 800 330, 788 430 C 780 500, 760 560, 742 600 L 704 590 C 724 540, 742 480, 748 420 C 758 330, 748 240, 708 168 Z", c: [762, 380] },
  B: { d: "M70 446 L 470 446 L 470 610 L 96 610 Q 70 610 70 584 Z", c: [270, 528] },
  C: { d: "M540 446 L 690 446 L 712 612 L 540 612 Z", c: [622, 530] },
};
export const GATE_POS: Record<number, [number, number]> = { 1: [250, 300], 2: [505, 622], 3: [880, 520] };

/* Status palette — validated (dataviz skill) on the dark surface: CVD ΔE 12.3, normal ΔE 19, contrast ≥ 3:1.
   Always shown with an icon + text label, never colour alone. */
export const ST = {
  idle: { c: "#8a6a60", ar: "هادئ", en: "Quiet", icon: "○" },
  ok: { c: "#3aa0c8", ar: "متاح", en: "Available", icon: "✓" },
  busy: { c: "#d9a441", ar: "مزدحم", en: "Busy", icon: "!" },
  crit: { c: "#e0524a", ar: "حرج", en: "Critical", icon: "▲" },
} as const;
export type Lvl = keyof typeof ST;
export const lvlOf = (r: number): Lvl => (r >= 0.85 ? "crit" : r >= 0.6 ? "busy" : r > 0 ? "ok" : "idle");

type Layer = "load" | "presence";
type Sel = { kind: "zone" | "gate"; id: number } | null;

export default function CommandCenter({ data, lang, aerial }: { data: CommandData; lang: "ar" | "en"; aerial?: string }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const { slots, nowIndex, zones, gates, events, alerts } = data;
  const [slot, setSlot] = useState(nowIndex);
  const [layer, setLayer] = useState<Layer>("load");
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<"alerts" | "zones" | "gates" | "live">("alerts");
  const [playing, setPlaying] = useState(false);
  const [tv, setTv] = useState(false);
  const [view, setView] = useState<"real" | "plan">(aerial ? "real" : "plan");
  useEffect(() => { try { const v = localStorage.getItem("cc:view"); if (aerial && (v === "real" || v === "plan")) setView(v); } catch {} }, [aerial]);
  const pickView = (v: "real" | "plan") => { setView(v); try { localStorage.setItem("cc:view", v); } catch {} };
  const [clock, setClock] = useState("");
  const [pulses, setPulses] = useState<{ key: string; gate: number; zone: number; kind: string }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<number> | null>(null);

  const cur = slots[slot];
  const mode: "past" | "now" | "future" = cur.now ? "now" : cur.past ? "past" : "future";
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  /* live clock */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* replay */
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setSlot((s) => (s >= slots.length - 1 ? (setPlaying(false), nowIndex) : s + 1)), 1100);
    return () => clearInterval(id);
  }, [playing, slots.length, nowIndex]);

  /* new gate events → animated pulse from gate to zone */
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    const fresh = events.filter((e) => !seen.current!.has(e.id));
    fresh.forEach((e) => seen.current!.add(e.id));
    if (!fresh.length) return;
    const add = fresh
      .map((e) => {
        const g = gates.find((x) => x.id === e.gate_id);
        const zid = e.zone && g?.zone_ids.includes(e.zone) ? e.zone : g?.zone_ids[0];
        return zid ? { key: `${e.id}`, gate: e.gate_id, zone: zid, kind: e.kind } : null;
      })
      .filter(Boolean) as { key: string; gate: number; zone: number; kind: string }[];
    setPulses((p) => [...p, ...add]);
    const id = setTimeout(() => setPulses((p) => p.filter((x) => !add.some((a) => a.key === x.key))), 2600);
    return () => clearTimeout(id);
  }, [events, gates]);

  /* keyboard */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      const rtl = lang === "ar";
      if (e.key === "ArrowLeft") setSlot((s) => Math.max(0, Math.min(slots.length - 1, s + (rtl ? 1 : -1))));
      if (e.key === "ArrowRight") setSlot((s) => Math.max(0, Math.min(slots.length - 1, s + (rtl ? -1 : 1))));
      if (e.key === "Escape") setSel(null);
      if (e.key.toLowerCase() === "f") toggleTv();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  });

  const toggleTv = () => {
    const el = rootRef.current;
    if (!tv) {
      el?.requestFullscreen?.().catch(() => {});
      setTv(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTv(false);
    }
  };
  useEffect(() => {
    const f = () => !document.fullscreenElement && setTv(false);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  /* metrics at the selected hour */
  const loadAt = useCallback(
    (z: ZoneSeries, i: number) => {
      const s = slots[i];
      const v = s.past ? z.entered[i] : s.now ? Math.max(z.entered[i], z.booked[i]) : z.booked[i];
      return { v, r: z.cap ? v / z.cap : 0 };
    },
    [slots],
  );
  const presenceAt = useCallback((z: ZoneSeries, i: number) => (slots[i].now ? z.presence : z.people.slice(0, i + 1).reduce((a, b) => a + b, 0)), [slots]);
  const maxPresence = Math.max(1, ...zones.map((z) => Math.max(z.presence, presenceAt(z, slot))));

  const zoneView = useMemo(
    () =>
      zones.map((z) => {
        const L = loadAt(z, slot);
        const P = presenceAt(z, slot);
        const lvl: Lvl = layer === "load" ? lvlOf(L.r) : mode === "future" ? "idle" : P === 0 ? "idle" : P / maxPresence >= 0.85 ? "crit" : P / maxPresence >= 0.4 ? "busy" : "ok";
        return { ...z, L, P, lvl, geo: GEO[z.code] };
      }),
    [zones, slot, layer, mode, loadAt, presenceAt, maxPresence],
  );
  const zoneById = new Map(zoneView.map((z) => [z.id, z]));
  const totals = slots.map((_, i) => {
    const caps = zones.reduce((s, z) => s + z.cap, 0) || 1;
    const v = zones.reduce((s, z) => s + loadAt(z, i).v, 0);
    const worst = Math.max(0, ...zones.map((z) => loadAt(z, i).r));
    return { v, r: v / caps, worst };
  });
  const maxTot = Math.max(1, ...totals.map((x) => x.v));
  const critCount = alerts.filter((a) => a.level === "critical").length;
  const inside = zones.reduce((s, z) => s + z.presence, 0);

  const selZone = sel?.kind === "zone" ? zoneView.find((z) => z.id === sel.id) ?? null : null;
  const selGate = sel?.kind === "gate" ? gates.find((g) => g.id === sel.id) ?? null : null;

  const focusAlert = (a: OpsAlert) => {
    if (a.slot != null) setSlot(a.slot);
    if (a.zone) setSel({ kind: "zone", id: a.zone });
    else if (a.gate) setSel({ kind: "gate", id: a.gate });
  };

  return (
    <div ref={rootRef} className={`cc overflow-hidden border border-white/10 ${tv ? "cc-tv fixed inset-0 z-[100] rounded-none" : "relative rounded-3xl"}`}>
      {/* ── top bar ── */}
      <header className="relative z-10 flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3aa0c8] opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#3aa0c8]" /></span>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold text-white">{t("مركز القيادة الميداني", "Field command center")}</p>
            <p className="text-[11px] text-cream/55">{t("مباشر · ميدان سيد الشهداء", "Live · Sayyid Alshuhada Field")}</p>
          </div>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Kpi label={t("داخل الميدان", "Inside")} value={inside} />
          <Kpi label={t("تنبيهات حرجة", "Critical")} value={critCount} tone={critCount ? "#e0524a" : undefined} />
          <span className="num rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 font-display text-lg font-bold tracking-wider text-gold-soft" aria-label={t("الوقت", "Time")}>{clock}</span>
          <div className="flex rounded-xl bg-black/25 p-1 text-xs" role="radiogroup" aria-label={t("الطبقة", "Layer")}>
            {([["load", t("الازدحام", "Congestion")], ["presence", t("التواجد", "Presence")]] as const).map(([k, l]) => (
              <button key={k} role="radio" aria-checked={layer === k} onClick={() => setLayer(k)} className={`min-h-9 rounded-lg px-3 font-semibold transition ${layer === k ? "bg-gold-soft text-noir" : "text-cream/70 hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <button onClick={toggleTv} className="min-h-10 rounded-xl border border-gold/40 px-3 text-xs font-semibold text-gold-soft hover:bg-white/5" title="F">
            {tv ? t("إنهاء الشاشة الكبيرة", "Exit wall mode") : t("وضع الشاشة الكبيرة", "Wall display mode")}
          </button>
        </div>
      </header>

      <div className={`relative z-10 grid ${tv ? "h-[calc(100%-7.5rem)] lg:grid-cols-[1fr_24rem]" : "lg:grid-cols-[1fr_23rem]"}`}>
        {/* ── map stage ── */}
        <div className="relative flex min-w-0 flex-col p-3 sm:p-4">
          <div className="pointer-events-none absolute start-5 top-5 z-10 flex flex-col gap-1.5">
            <span className={`pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${mode === "future" ? "bg-[#d9a441]/20 text-[#f0cf8e] ring-1 ring-[#d9a441]/50" : mode === "now" ? "bg-[#3aa0c8]/20 text-[#9fd6ec] ring-1 ring-[#3aa0c8]/50" : "bg-white/10 text-cream ring-1 ring-white/20"}`}>
              {mode === "future" ? t("توقع", "Forecast") : mode === "now" ? t("الآن", "Now") : t("فعلي", "Actual")} · <span className="num">{hh(cur.hour)}</span>
            </span>
            <span className="text-[11px] text-cream/55">
              {layer === "load"
                ? mode === "future" ? t("مبني على المركبات المحجوزة لهذه الساعة", "Based on vehicles booked for this hour") : t("مركبات دخلت فعلًا مقابل سعة الساعة", "Vehicles admitted vs hourly capacity")
                : mode === "future" ? t("لا توقع للتواجد — اختر ساعة حالية أو سابقة", "No presence forecast — pick a current or past hour") : t("أفراد دخلوا اليوم بتصاريح سارية", "People admitted today on valid permits")}
            </span>
          </div>

          {aerial && (
            <div className="z-20 mb-2 flex w-fit self-end rounded-xl bg-black/35 p-1 text-xs backdrop-blur sm:absolute sm:end-5 sm:top-5 sm:mb-0" role="radiogroup" aria-label={t("طريقة العرض", "View")}>
              {([["real", t("الواقع ثلاثي الأبعاد", "3D reality")], ["plan", t("المخطط", "Plan")]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => pickView(k)} className={`min-h-9 rounded-lg px-3 font-semibold transition ${view === k ? "bg-gold-soft text-noir" : "text-cream/75 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          )}
          {aerial && view === "real" ? (
            <Field3D src={aerial} zones={zoneView} gates={gates} slot={slot} layer={layer} future={mode === "future"} maxPresence={maxPresence} sel={sel} onSelect={setSel} t={t} />
          ) : (
          <svg viewBox="0 0 1000 690" className="h-auto w-full" role="img" aria-label={t("مخطط الميدان بمستويات الازدحام والتواجد", "Field plan with congestion and presence levels")}>
            <defs>
              <pattern id="cc-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(233,207,166,.06)" /></pattern>
              <pattern id="cc-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V10" stroke="rgba(255,255,255,.22)" strokeWidth="3" /></pattern>
              {(Object.keys(ST) as Lvl[]).map((k) => (
                <radialGradient key={k} id={`cc-glow-${k}`}><stop offset="0" stopColor={ST[k].c} stopOpacity=".55" /><stop offset="1" stopColor={ST[k].c} stopOpacity="0" /></radialGradient>
              ))}
              <filter id="cc-soft"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>
            <rect width="1000" height="690" fill="url(#cc-grid)" />
            <g transform="translate(940 60)"><circle r="22" fill="rgba(0,0,0,.25)" stroke="rgba(233,207,166,.35)" /><path d="M0 -15 L5 2 L0 -2 L-5 2 Z" fill="#e9cfa6" /><text y="18" textAnchor="middle" fontSize="11" fill="#e9cfa6">N</text></g>
            <g fill="none" stroke="rgba(233,207,166,.16)" strokeWidth="14" strokeLinecap="round"><path d="M40 300 H 330" /><path d="M505 690 V 430" /><path d="M1000 520 H 720" /></g>

            {/* gate → zone corridors */}
            {gates.map((g) => {
              const p = GATE_POS[g.id];
              if (!p) return null;
              const active = g.checks[slot] > 0;
              return g.zone_ids.map((zid) => {
                const z = zoneById.get(zid);
                if (!z?.geo) return null;
                const [x, y] = z.geo.c;
                return <path key={`c${g.id}-${zid}`} id={`cc-path-${g.id}-${zid}`} d={`M${p[0]} ${p[1]} Q ${(p[0] + x) / 2} ${Math.min(p[1], y) - 40} ${x} ${y}`} fill="none" stroke={active ? "rgba(243,220,181,.7)" : "rgba(233,207,166,.13)"} strokeWidth={active ? 2 : 1.2} strokeDasharray="6 8" className={active ? "flow" : ""} />;
              });
            })}

            {/* zones */}
            {zoneView.map((z) => {
              if (!z.geo) return null;
              const s = ST[z.lvl];
              const on = sel?.kind === "zone" && sel.id === z.id;
              const ratio = layer === "load" ? z.L.r : z.P / maxPresence;
              return (
                <g key={z.id} role="button" tabIndex={0} aria-label={`${t(z.name_ar, z.name_en)} — ${t(s.ar, s.en)}`}
                  onClick={() => setSel({ kind: "zone", id: z.id })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel({ kind: "zone", id: z.id }))}
                  className="cursor-pointer outline-none">
                  {z.lvl !== "idle" && <circle cx={z.geo.c[0]} cy={z.geo.c[1]} r={55 + Math.min(1, ratio) * 95} fill={`url(#cc-glow-${z.lvl})`} className={z.lvl === "crit" ? "heat" : ""} />}
                  <path d={z.geo.d} fill={s.c} fillOpacity={z.lvl === "idle" ? 0.14 : 0.22 + Math.min(1, ratio) * 0.35} stroke={on ? "#fff6e6" : z.sensitive ? "rgba(240,164,106,.95)" : "rgba(233,207,166,.5)"} strokeWidth={on ? 3.5 : 1.5} strokeDasharray={z.sensitive ? "7 5" : undefined} className="transition-[fill-opacity,fill] duration-500" />
                  {mode === "future" && layer === "load" && z.lvl !== "idle" && <path d={z.geo.d} fill="url(#cc-hatch)" pointerEvents="none" />}
                  <text x={z.geo.c[0]} y={z.geo.c[1] - 12} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fbf1ea" style={{ paintOrder: "stroke", stroke: "rgba(40,16,10,.65)", strokeWidth: 4 }}>{t(z.name_ar, z.name_en)}</text>
                  <g transform={`translate(${z.geo.c[0]} ${z.geo.c[1] + 12})`}>
                    <rect x="-58" y="-12" width="116" height="24" rx="12" fill="rgba(40,16,10,.7)" stroke={s.c} strokeOpacity=".7" />
                    <text textAnchor="middle" dy="5" fontSize="13" fontWeight="600" fill="#fff6e6">
                      {s.icon} {layer === "load" ? `${z.L.v}/${z.cap}` : mode === "future" ? "—" : `${z.P} ${t("فرد", "ppl")}`}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* live pulses */}
            {pulses.map((p) => (
              <circle key={p.key} r="7" fill={p.kind === "allowed" ? "#3aa0c8" : p.kind === "exit" ? "#9fd6ec" : p.kind === "suspicious" || p.kind === "denied" ? "#e0524a" : "#e9cfa6"} filter="url(#cc-soft)">
                <animateMotion dur="2.4s" fill="freeze"><mpath href={`#cc-path-${p.gate}-${p.zone}`} /></animateMotion>
              </circle>
            ))}

            {/* gates */}
            {gates.map((g) => {
              const p = GATE_POS[g.id];
              if (!p) return null;
              const n = g.checks[slot];
              const alarm = g.bad[slot] > 0;
              const on = sel?.kind === "gate" && sel.id === g.id;
              return (
                <g key={g.id} transform={`translate(${p[0]} ${p[1]})`} role="button" tabIndex={0} aria-label={`${t(g.name_ar, g.name_en)}: ${n}`}
                  onClick={() => setSel({ kind: "gate", id: g.id })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel({ kind: "gate", id: g.id }))} className="cursor-pointer outline-none">
                  {n > 0 && <circle r="17" fill="none" stroke={alarm ? "#e0524a" : "#3aa0c8"} strokeWidth="2" className="ping-ring" />}
                  <circle r="17" fill={on ? "#fff6e6" : "#3d1b14"} stroke={alarm ? "#e0524a" : "#e9cfa6"} strokeWidth="2.5" />
                  <path d="M-6 6 V-3 a6 6 0 0 1 12 0 V6" fill="none" stroke={on ? "#3d1b14" : "#e9cfa6"} strokeWidth="2" />
                  <g transform="translate(15 -15)"><circle r="12" fill={alarm ? "#e0524a" : "#c9a66b"} /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill={alarm ? "#fff" : "#3d1b14"}>{n}</text></g>
                  <text y="36" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fbf1ea" style={{ paintOrder: "stroke", stroke: "rgba(40,16,10,.7)", strokeWidth: 4 }}>{t(g.name_ar, g.name_en)}</text>
                </g>
              );
            })}
          </svg>
          )}

          {/* legend — label + icon + colour */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-cream/75">
            {(["ok", "busy", "crit"] as Lvl[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5"><i aria-hidden="true" className="grid h-4 w-4 place-items-center rounded text-[9px] font-bold not-italic text-noir" style={{ background: ST[k].c }}>{ST[k].icon}</i>{t(ST[k].ar, ST[k].en)} {layer === "load" && <span className="text-cream/45">{k === "ok" ? "< 60%" : k === "busy" ? "60–85%" : "≥ 85%"}</span>}</span>
            ))}
            <span className="flex items-center gap-1.5"><i className="h-3 w-4 rounded border border-dashed border-[#f0a46a]" />{t("منطقة حساسة", "Sensitive")}</span>
            <span className="flex items-center gap-1.5"><i className="h-3 w-4 rounded" style={{ background: "repeating-linear-gradient(45deg,rgba(255,255,255,.35) 0 2px,transparent 2px 5px)" }} />{t("توقع", "Forecast")}</span>
          </div>

          {/* ── time machine ── */}
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <button onClick={() => { if (!playing && slot >= slots.length - 1) setSlot(0); setPlaying((p) => !p); }} aria-label={playing ? t("إيقاف", "Pause") : t("إعادة تشغيل اليوم", "Replay")} className="grid h-9 w-9 place-items-center rounded-full bg-gold-soft text-noir">
                {playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="rtl:rotate-180"><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>}
              </button>
              <p className="text-xs font-semibold text-cream">{t("آلة الزمن", "Time machine")} <span className="font-normal text-cream/50">· {t("8 ساعات مضت ← الآن ← 6 ساعات قادمة", "8h back ← now → 6h ahead")}</span></p>
              {slot !== nowIndex && <button onClick={() => { setPlaying(false); setSlot(nowIndex); }} className="ms-auto rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-cream hover:border-gold/50">{t("عودة إلى الآن", "Back to now")}</button>}
            </div>
            <div className="flex items-end gap-1" dir="ltr" role="slider" aria-valuemin={0} aria-valuemax={slots.length - 1} aria-valuenow={slot} aria-valuetext={hh(cur.hour)} aria-label={t("الساعة", "Hour")}>
              {slots.map((s, i) => {
                const tot = totals[i];
                const lvl = lvlOf(tot.worst);
                const on = i === slot;
                return (
                  <button key={i} onClick={() => { setPlaying(false); setSlot(i); }} title={`${hh(s.hour)} — ${tot.v} ${t("مركبة", "veh")}`}
                    className={`group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1.5 transition ${on ? "bg-white/10 ring-1 ring-gold-soft/60" : "hover:bg-white/5"}`}>
                    <span className="relative flex h-12 w-full items-end justify-center">
                      <span className="w-3/5 rounded-t-[4px]" style={{ height: `${Math.max(4, (tot.v / maxTot) * 100)}%`, background: tot.v ? ST[lvl].c : "rgba(255,255,255,.12)", opacity: s.past ? 0.9 : s.now ? 1 : 0.65, backgroundImage: !s.past && !s.now && tot.v ? "repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0 2px,transparent 2px 5px)" : undefined }} />
                    </span>
                    <span className={`num text-[10px] ${on ? "font-bold text-gold-soft" : s.now ? "font-semibold text-[#9fd6ec]" : "text-cream/50"}`}>{s.now ? t("الآن", "now") : String(s.hour).padStart(2, "0")}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── side panel ── */}
        <aside className="relative min-w-0 border-t border-white/10 lg:border-s lg:border-t-0">
          {selZone ? (
            <ZoneDrawer z={selZone} slots={slots} slot={slot} nowIndex={nowIndex} gates={gates} t={t} onClose={() => setSel(null)} />
          ) : selGate ? (
            <GateDrawer g={selGate} slots={slots} slot={slot} zones={zones} t={t} onClose={() => setSel(null)} />
          ) : (
            <>
              <div className="flex gap-1 border-b border-white/10 p-2" role="tablist">
                {([["alerts", t("التنبيهات", "Alerts"), alerts.filter((a) => a.level !== "info").length], ["zones", t("المناطق", "Zones"), 0], ["gates", t("البوابات", "Gates"), 0], ["live", t("مباشر", "Live"), 0]] as const).map(([k, l, n]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${tab === k ? "bg-white/10 text-gold-soft" : "text-cream/60 hover:text-white"}`}>
                    {l}{n > 0 && <span className="num rounded-full bg-[#c2392f] px-1.5 text-[10px] text-white">{n}</span>}
                  </button>
                ))}
              </div>
              <div className={`overflow-y-auto p-3 ${tv ? "max-h-[calc(100vh-12rem)]" : "max-h-[37rem]"}`}>
                {tab === "alerts" && (
                  <ul className="space-y-2">
                    {alerts.map((a) => (
                      <li key={a.id} className={`al-item rounded-2xl border p-3 ${a.level === "critical" ? "border-[#e0524a]/45 bg-[#e0524a]/10" : a.level === "warning" ? "border-[#d9a441]/40 bg-[#d9a441]/10" : "border-[#3aa0c8]/35 bg-[#3aa0c8]/10"}`}>
                        <button onClick={() => focusAlert(a)} className="block w-full text-start">
                          <p className="flex items-start gap-2 text-sm font-semibold text-white">
                            <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-noir" style={{ background: a.level === "critical" ? ST.crit.c : a.level === "warning" ? ST.busy.c : ST.ok.c }}>{a.level === "critical" ? "▲" : a.level === "warning" ? "!" : "✓"}</span>
                            {t(a.ar[0], a.en[0])}
                          </p>
                          <p className="mt-1 ps-7 text-xs leading-relaxed text-cream/70">{t(a.ar[1], a.en[1])}</p>
                        </button>
                        {a.href && a.cta && <Link href={a.href} className="ms-7 mt-2 inline-flex min-h-8 items-center rounded-lg bg-white/10 px-3 text-[11px] font-semibold text-gold-soft hover:bg-white/15">{t(...a.cta)} ←</Link>}
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "zones" && (
                  <ul className="space-y-2">
                    {[...zoneView].sort((a, b) => b.L.r - a.L.r).map((z) => (
                      <li key={z.id}>
                        <button onClick={() => setSel({ kind: "zone", id: z.id })} className="w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-start hover:border-gold/40">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-semibold text-white">{t(z.name_ar, z.name_en)}</span>
                            <Status lvl={lvlOf(z.L.r)} t={t} />
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, z.L.r * 100)}%`, background: ST[lvlOf(z.L.r)].c }} /></div>
                          <p className="num mt-1.5 flex justify-between text-[11px] text-cream/55"><span>{z.L.v}/{z.cap} {t("مركبة", "veh")}</span><span>{z.presence} {t("فرد بالداخل", "inside")}</span></p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "gates" && (
                  <ul className="space-y-2">
                    {gates.map((g) => (
                      <li key={g.id}>
                        <button onClick={() => setSel({ kind: "gate", id: g.id })} className="w-full rounded-xl border border-white/10 bg-white/[.03] p-3 text-start hover:border-gold/40">
                          <div className="flex items-center justify-between text-sm"><span className="font-semibold text-white">{t(g.name_ar, g.name_en)}</span><span className="num text-gold-soft">{g.today}</span></div>
                          <Spark values={g.checks} now={nowIndex} />
                          <p className="mt-1 text-[11px] text-cream/50">{t("تحققات اليوم · آخر 8 ساعات", "Checks today · last 8h")}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "live" && (
                  <ul className="space-y-1.5">
                    {events.map((e) => {
                      const g = gates.find((x) => x.id === e.gate_id);
                      const c = e.kind === "allowed" ? ST.ok : e.kind === "exit" ? { ...ST.ok, c: "#9fd6ec", icon: "↑" } : e.kind === "lookup" ? ST.busy : ST.crit;
                      return (
                        <li key={e.id} className="al-item flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5">
                          <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-noir" style={{ background: c.c }}>{c.icon}</span>
                          <span className="min-w-0 flex-1 truncate"><b className="num text-white">{e.number ?? t("رمز غير معروف", "Unknown code")}</b> <span className="text-cream/55">· {g ? t(g.name_ar, g.name_en) : ""}</span></span>
                          <span className="shrink-0 text-cream/50">{e.kind === "allowed" ? t("سُمح", "allowed") : e.kind === "exit" ? t("خروج", "exit") : e.kind === "denied" ? t("مُنع", "denied") : e.kind === "suspicious" ? t("مشبوه", "suspicious") : t("استعلام", "lookup")}</span>
                          <span className="num shrink-0 text-cream/40">{new Date(e.at).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" })}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* wall-mode ticker */}
      {tv && (
        <div className="relative z-10 flex h-12 items-center overflow-hidden border-t border-white/10 bg-black/30 text-sm text-cream/80">
          <span className="z-10 shrink-0 bg-[#e0524a] px-4 py-3 text-xs font-bold text-white">{t("مباشر", "LIVE")}</span>
          <div className="ticker flex gap-10 whitespace-nowrap ps-6">
            {[...alerts, ...alerts].map((a, i) => <span key={i}>{a.level === "critical" ? "▲" : a.level === "warning" ? "!" : "✓"} {t(a.ar[0], a.en[0])}</span>)}
          </div>
        </div>
      )}

      {/* accessible table */}
      {!tv && (
        <details className="relative z-10 border-t border-white/10 px-5 py-3 text-sm text-cream/80">
          <summary className="cursor-pointer text-xs text-cream/60">{t("عرض بيانات الساعة المختارة كجدول", "Show the selected hour as a table")} · <span className="num">{hh(cur.hour)}</span></summary>
          <table className="mt-3 w-full text-xs">
            <thead className="text-cream/55"><tr><th className="py-1 text-start">{t("المنطقة", "Zone")}</th><th className="text-start">{t("الحالة", "Status")}</th><th className="text-start">{t("مركبات/السعة", "Vehicles/cap")}</th><th className="text-start">{t("أفراد", "People")}</th></tr></thead>
            <tbody>{zoneView.map((z) => <tr key={z.id} className="border-t border-white/5"><td className="py-1">{t(z.name_ar, z.name_en)}</td><td>{t(ST[lvlOf(z.L.r)].ar, ST[lvlOf(z.L.r)].en)}</td><td className="num">{z.L.v}/{z.cap}</td><td className="num">{mode === "future" ? "—" : z.P}</td></tr>)}</tbody>
          </table>
        </details>
      )}
      <p className="sr-only" aria-live="polite">{t(`الساعة المختارة ${hh(cur.hour)}`, `Selected hour ${hh(cur.hour)}`)}</p>
    </div>
  );
}

/* ───────── pieces ───────── */
function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5">
      <b className="num font-display text-lg" style={{ color: tone ?? "#fff" }}>{value}</b>
      <span className="text-[11px] text-cream/55">{label}</span>
    </span>
  );
}

function Status({ lvl, t }: { lvl: Lvl; t: (a: string, e: string) => string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${ST[lvl].c}26`, color: "#fff6e6", boxShadow: `inset 0 0 0 1px ${ST[lvl].c}88` }}>
      <span style={{ color: ST[lvl].c }}>{ST[lvl].icon}</span>{t(ST[lvl].ar, ST[lvl].en)}
    </span>
  );
}

function Spark({ values, now }: { values: number[]; now: number }) {
  const max = Math.max(1, ...values);
  const pts = values.slice(0, now + 1).map((v, i) => `${(i / Math.max(1, now)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="mt-2 h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="#e9cfa6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Hourly chart for one zone: actual (past) and booked (future) vs one capacity line — single axis. */
function HourChart({ z, slots, slot, nowIndex, t }: { z: ZoneSeries; slots: CommandData["slots"]; slot: number; nowIndex: number; t: (a: string, e: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = slots.map((s, i) => (s.past ? z.entered[i] : s.now ? Math.max(z.entered[i], z.booked[i]) : z.booked[i]));
  const max = Math.max(z.cap * 1.15, ...vals, 1);
  const W = 300, H = 120, bw = W / slots.length;
  const y = (v: number) => H - (v / max) * (H - 10);
  const hi = hover ?? slot;
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label={t("المركبات بالساعة مقابل السعة", "Vehicles per hour vs capacity")} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={y(z.cap)} y2={y(z.cap)} stroke="#e0524a" strokeOpacity=".7" strokeDasharray="4 3" strokeWidth="1.2" />
        <text x={W - 2} y={y(z.cap) - 3} textAnchor="end" fontSize="8" fill="#f3a39d">{t("السعة", "capacity")} {z.cap}</text>
        <line x1={(nowIndex + 0.5) * bw} x2={(nowIndex + 0.5) * bw} y1="0" y2={H} stroke="#3aa0c8" strokeOpacity=".5" />
        {vals.map((v, i) => {
          const r = z.cap ? v / z.cap : 0;
          const c = ST[lvlOf(r)].c;
          const fut = !slots[i].past && !slots[i].now;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              <rect x={i * bw + 2} y={y(v)} width={bw - 4} height={Math.max(0, H - y(v))} rx="3" fill={v ? c : "rgba(255,255,255,.1)"} fillOpacity={fut ? 0.55 : 0.95} />
              {fut && v > 0 && <rect x={i * bw + 2} y={y(v)} width={bw - 4} height={Math.max(0, H - y(v))} rx="3" fill="url(#cc-hatch)" />}
              {i === hi && <rect x={i * bw + 1} y="0" width={bw - 2} height={H} fill="rgba(255,255,255,.06)" stroke="rgba(233,207,166,.5)" />}
              {i % 2 === 0 && <text x={i * bw + bw / 2} y={H + 12} textAnchor="middle" fontSize="8" fill="rgba(255,236,220,.5)">{String(slots[i].hour).padStart(2, "0")}</text>}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute top-0 rounded-lg border border-white/15 bg-noir/95 px-2 py-1 text-[11px] text-cream shadow-lg" style={{ left: `${Math.min(70, (hi / slots.length) * 100)}%` }}>
        <b className="num">{String(slots[hi].hour).padStart(2, "0")}:00</b> · {slots[hi].past ? t("فعلي", "actual") : slots[hi].now ? t("الآن", "now") : t("محجوز", "booked")} <b className="num">{vals[hi]}</b>/{z.cap}
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children, t }: { title: string; onClose: () => void; children: React.ReactNode; t: (a: string, e: string) => string }) {
  return (
    <div className="al-item p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-xl font-bold text-white">{title}</p>
        <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="grid h-9 w-9 place-items-center rounded-full text-cream/60 hover:bg-white/10">✕</button>
      </div>
      {children}
    </div>
  );
}

function ZoneDrawer({ z, slots, slot, nowIndex, gates, t, onClose }: { z: ZoneSeries & { L: { v: number; r: number }; P: number }; slots: CommandData["slots"]; slot: number; nowIndex: number; gates: GateSeries[]; t: (a: string, e: string) => string; onClose: () => void }) {
  const peak = slots.reduce((b, _s, i) => (i >= nowIndex && z.booked[i] > z.booked[b] ? i : b), nowIndex); // upcoming hours only
  const served = gates.filter((g) => g.zone_ids.includes(z.id));
  return (
    <Drawer title={t(z.name_ar, z.name_en)} onClose={onClose} t={t}>
      <div className="mt-1 flex flex-wrap gap-2"><Status lvl={lvlOf(z.L.r)} t={t} />{z.sensitive && <span className="rounded-full bg-[#f0a46a]/20 px-2 py-0.5 text-[11px] text-[#f0a46a]">{t("منطقة حساسة", "Sensitive")}</span>}</div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[[`${z.L.v}/${z.cap}`, t("مركبات الساعة", "Vehicles/h")], [String(z.presence), t("بالداخل الآن", "Inside now")], [String(z.permits), t("تصاريح سارية", "Valid permits")]].map(([v, k]) => (
          <div key={k} className="rounded-xl bg-black/20 p-2"><p className="num font-display text-lg font-bold text-white">{v}</p><p className="text-[10px] text-cream/55">{k}</p></div>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold text-cream">{t("المركبات بالساعة مقابل السعة", "Vehicles per hour vs capacity")}</p>
      <div className="mt-2"><HourChart z={z} slots={slots} slot={slot} nowIndex={nowIndex} t={t} /></div>
      {z.booked[peak] > 0 && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-cream/75">{t(`الذروة المتوقعة الساعة ${String(slots[peak].hour).padStart(2, "0")}:00 بـ ${z.booked[peak]} مركبة.`, `Expected peak at ${String(slots[peak].hour).padStart(2, "0")}:00 with ${z.booked[peak]} vehicles.`)}</p>}
      <p className="mt-4 text-xs font-semibold text-cream">{t("الأكثر تواجدًا اليوم", "Most present today")}</p>
      <ul className="mt-2 space-y-1.5">
        {z.topOrgs.length ? z.topOrgs.map((o) => <li key={o.org} className="flex justify-between gap-2 text-xs"><span className="truncate text-cream/80">{o.org}</span><b className="num text-white">{o.people}</b></li>) : <li className="text-xs text-cream/45">{t("لا دخول اليوم", "No entries today")}</li>}
      </ul>
      <p className="mt-4 text-xs font-semibold text-cream">{t("البوابات التي تخدمها", "Gates serving it")}</p>
      <p className="mt-1 text-xs text-cream/70">{served.map((g) => `${t(g.name_ar, g.name_en)} (${g.today})`).join(" · ") || "—"}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/staff/capacity?zone=${z.id}`} className="inline-flex min-h-9 items-center rounded-lg bg-gold-soft px-3 text-xs font-bold text-noir">{t("إدارة السعة", "Manage capacity")}</Link>
        <Link href={`/staff/permits?zone=${z.id}&status=valid`} className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-cream">{t("التصاريح السارية", "Valid permits")}</Link>
      </div>
    </Drawer>
  );
}

function GateDrawer({ g, slots, slot, zones, t, onClose }: { g: GateSeries; slots: CommandData["slots"]; slot: number; zones: ZoneSeries[]; t: (a: string, e: string) => string; onClose: () => void }) {
  const max = Math.max(1, ...g.checks);
  return (
    <Drawer title={t(g.name_ar, g.name_en)} onClose={onClose} t={t}>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[[String(g.today), t("تحققات اليوم", "Checks today")], [String(g.denied.reduce((a, b) => a + b, 0)), t("منع", "Denied")], [String(g.bad.reduce((a, b) => a + b, 0)), t("مشبوه", "Suspicious")]].map(([v, k]) => (
          <div key={k} className="rounded-xl bg-black/20 p-2"><p className="num font-display text-lg font-bold text-white">{v}</p><p className="text-[10px] text-cream/55">{k}</p></div>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold text-cream">{t("التحققات بالساعة", "Checks per hour")}</p>
      <div className="mt-2 flex h-24 items-end gap-1" dir="ltr">
        {g.checks.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${String(slots[i].hour).padStart(2, "0")}:00 — ${v}`}>
            <div className={`w-full rounded-t-[4px] ${i === slot ? "ring-1 ring-gold-soft" : ""}`} style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, background: g.bad[i] ? ST.crit.c : ST.ok.c }} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-cream/70">{t("آخر نشاط", "Last activity")}: <span className="num">{g.lastAt ? new Date(g.lastAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "—"}</span></p>
      <p className="mt-1 text-xs text-cream/70">{t("تخدم", "Serves")}: {zones.filter((z) => g.zone_ids.includes(z.id)).map((z) => t(z.name_ar, z.name_en)).join("، ")}</p>
      <div className="mt-4"><Link href="/staff/audit?q=verify" className="inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-cream">{t("سجل تحققات البوابة", "Gate check log")}</Link></div>
    </Drawer>
  );
}
