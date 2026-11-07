"use client";
import { useEffect, useRef } from "react";
import { ST, type Lvl } from "./CommandCenter";

/* ─────────────────────────────────────────────────────────────
   "Reality" view of the field: the real aerial photo laid on a tilted
   plane, with live pins standing up at each zone and gate (CSS 3D, no
   WebGL). Pins sit at the place they mark on the photo, so the wall
   screen reads like the field itself.
   Positions are in the photo's own pixels (1029 × 600) — if the photo is
   replaced, only POS changes.
   ───────────────────────────────────────────────────────────── */
const W = 1029, H = 600;
const POS: Record<string, [number, number]> = {
  A: [560, 440], // الساحة الرئيسية — the open plaza in front of the mosque
  B: [640, 318], // مواقف الزوار — the car park beside the mosque
  C: [735, 478], // منطقة الخدمات — the service buildings
  D: [668, 392], // محيط جبل الرماة — the Archers' hill
  E: [400, 368], // المسار التاريخي — the walled heritage enclosure
};
// pins stand at different heights so neighbouring labels never sit on top of each other
const STEM: Record<string, number> = { A: 14, B: 62, C: 16, D: 38, E: 30 };
const GATE_XY: Record<number, [number, number]> = { 1: [505, 268], 2: [545, 560], 3: [868, 492] };

type ZoneV = { id: number; code: string; name_ar: string; name_en: string; cap: number; sensitive: boolean; lvl: Lvl; L: { v: number; r: number }; P: number };
type GateV = { id: number; name_ar: string; name_en: string; checks: number[]; bad: number[] };

export default function Field3D({
  src, zones, gates, slot, layer, future, maxPresence, sel, onSelect, t,
}: {
  src: string; zones: ZoneV[]; gates: GateV[]; slot: number; layer: "load" | "presence"; future: boolean; maxPresence: number;
  sel: { kind: "zone" | "gate"; id: number } | null; onSelect: (s: { kind: "zone" | "gate"; id: number }) => void; t: (a: string, b: string) => string;
}) {
  const stage = useRef<HTMLDivElement>(null);

  // the camera follows the pointer a little (and drifts slowly on its own on a wall screen)
  useEffect(() => {
    const el = stage.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0, last = performance.now();
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      tx = (e.clientX - b.left) / b.width - 0.5;
      ty = (e.clientY - b.top) / b.height - 0.5;
      last = performance.now();
    };
    const tick = (now: number) => {
      if (now - last > 4000) { tx = Math.sin(now / 7000) * 0.35; ty = Math.cos(now / 9000) * 0.25; } // idle drift
      x += (tx - x) * 0.05; y += (ty - y) * 0.05;
      el.style.setProperty("--rz", `${(x * 7).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(34 + y * 8).toFixed(2)}deg`);
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener("pointermove", move);
    raf = requestAnimationFrame(tick);
    return () => { el.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);

  const at = ([px, py]: [number, number]) => ({ left: `${(px / W) * 100}%`, top: `${(py / H) * 100}%` });

  return (
    <div ref={stage} className="f3d relative aspect-[1029/700] w-full overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/10" role="img" aria-label={t("صورة ثلاثية الأبعاد لميدان سيد الشهداء مع الحالة الحية لكل منطقة وبوابة", "3D view of Sayyid Alshuhada Field with the live state of every zone and gate")}>
      <div className="f3d-plane absolute inset-x-[6%] top-[6%] aspect-[1029/600]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full select-none rounded-xl object-cover shadow-[0_40px_80px_-20px_rgba(0,0,0,.9)]" />
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgba(20,8,6,.55))]" />

        {zones.map((z) => {
          const p = POS[z.code];
          if (!p) return null;
          const s = ST[z.lvl];
          const ratio = layer === "load" ? z.L.r : z.P / Math.max(1, maxPresence);
          const on = sel?.kind === "zone" && sel.id === z.id;
          const size = 46 + Math.min(1, ratio) * 70;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => onSelect({ kind: "zone", id: z.id })}
              aria-label={`${t(z.name_ar, z.name_en)} — ${t(s.ar, s.en)}`}
              aria-pressed={on}
              className="f3d-anchor absolute outline-none"
              style={at(p)}
            >
              {/* footprint on the ground */}
              <span className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${z.lvl === "crit" ? "heat" : ""}`} style={{ width: size, height: size, background: `radial-gradient(circle, ${s.c}cc 0%, ${s.c}55 45%, transparent 70%)`, opacity: z.lvl === "idle" ? 0.35 : 1 }} />
              <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ width: 16, height: 16, borderColor: on ? "#fff6e6" : s.c, background: "rgba(40,16,10,.6)" }} />
              {/* pin standing up from the ground */}
              <span className="f3d-pin absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center">
                <span className={`whitespace-nowrap rounded-xl border px-1.5 py-0.5 text-center shadow-lg backdrop-blur-sm sm:px-2.5 sm:py-1 ${on ? "border-cream bg-cream text-noir" : "border-white/15 bg-[#2a120d]/85 text-cream"}`} style={{ borderColor: on ? undefined : s.c }}>
                  <span className={`text-[12px] font-bold leading-tight ${on ? "block" : "hidden sm:block"}`}>{t(z.name_ar, z.name_en)}{z.sensitive ? " ◆" : ""}</span>
                  <span className="num block text-[11px] font-semibold leading-tight" style={{ color: on ? undefined : s.c }}>
                    {s.icon} {layer === "load" ? `${z.L.v}/${z.cap}` : future ? "—" : `${z.P} ${t("فرد", "ppl")}`}
                  </span>
                </span>
                <span className="w-0.5" style={{ height: STEM[z.code] ?? 24, background: `linear-gradient(${s.c}, transparent)` }} />
              </span>
            </button>
          );
        })}

        {gates.map((g) => {
          const p = GATE_XY[g.id];
          if (!p) return null;
          const n = g.checks[slot] ?? 0;
          const alarm = (g.bad[slot] ?? 0) > 0;
          const on = sel?.kind === "gate" && sel.id === g.id;
          return (
            <button key={g.id} type="button" onClick={() => onSelect({ kind: "gate", id: g.id })} aria-label={`${t(g.name_ar, g.name_en)}: ${n}`} aria-pressed={on} className="f3d-anchor absolute outline-none" style={at(p)}>
              {n > 0 && <span className="ping-ring absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: alarm ? "#e0524a" : "#3aa0c8" }} />}
              <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold-soft bg-[#3d1b14]" />
              <span className="f3d-pin absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center">
                <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-lg ${on ? "border-cream bg-cream text-noir" : "border-gold/40 bg-[#2a120d]/85 text-cream"}`}>
                  <span className={on ? "" : "hidden sm:inline"}>{t(g.name_ar, g.name_en)}</span>
                  <span className={`num grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold ${alarm ? "bg-[#c2392f] text-white" : "bg-gold text-noir"}`}>{n}</span>
                </span>
                <span className="h-5 w-0.5 bg-gradient-to-b from-gold-soft to-transparent" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#1e0c09]/80 to-transparent" />
      <p className="pointer-events-none absolute bottom-2 end-3 text-[10px] text-cream/55">{t("صورة جوية للميدان · المؤشرات حية", "Aerial photo of the field · markers are live")}</p>
    </div>
  );
}
