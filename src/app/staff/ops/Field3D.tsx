"use client";
import { useEffect, useRef, useState } from "react";
import { ST, type Lvl } from "./CommandCenter";
import type { FieldScene, SceneData } from "./field3d/scene";

type ZoneV = { id: number; code: string; name_ar: string; name_en: string; cap: number; sensitive: boolean; lvl: Lvl; L: { v: number; r: number }; P: number };
type GateV = { id: number; name_ar: string; name_en: string; checks: number[]; bad: number[] };
type Sel = { kind: "zone" | "gate"; id: number } | null;

/**
 * "Reality" view of the field: a real 3D diorama (three.js) — relief terrain with the aerial photo
 * on it, translucent zone volumes that rise with load, gate posts, an orbiting camera.
 * The heavy module is loaded only on the client, only when this view is shown.
 */
export default function Field3D({
  src, zones, gates, slot, layer, future, maxPresence, sel, onSelect, onUnavailable, t,
}: {
  src: string; zones: ZoneV[]; gates: GateV[]; slot: number; layer: "load" | "presence"; future: boolean; maxPresence: number;
  sel: Sel; onSelect: (s: NonNullable<Sel>) => void; onUnavailable: () => void; t: (a: string, b: string) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<FieldScene | null>(null);
  const select = useRef(onSelect); select.current = onSelect;
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);

  const data = (): SceneData => ({
    zones: zones.map((z) => {
      const s = ST[z.lvl];
      const ratio = layer === "load" ? z.L.r : z.P / Math.max(1, maxPresence);
      const value = `${s.icon} ${layer === "load" ? `${z.L.v}/${z.cap}` : future ? "—" : `${z.P} ${t("فرد", "ppl")}`}`;
      return { id: z.id, code: z.code, name: t(z.name_ar, z.name_en), value, color: s.c, ratio, idle: z.lvl === "idle", crit: z.lvl === "crit", sensitive: z.sensitive };
    }),
    gates: gates.map((g) => ({ id: g.id, name: t(g.name_ar, g.name_en), n: g.checks[slot] ?? 0, alarm: (g.bad[slot] ?? 0) > 0 })),
    sel,
  });
  const latest = useRef(data); latest.current = data;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    setReady(false);
    setTouch(matchMedia("(pointer: coarse)").matches);
    import("./field3d/scene")
      .then(({ createFieldScene }) => {
        if (!live) return;
        api.current = createFieldScene(el, { src, onSelect: (s) => select.current(s), reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
        api.current.update(latest.current());
        setReady(true);
      })
      .catch(() => live && onUnavailable());
    return () => { live = false; api.current?.dispose(); api.current = null; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = JSON.stringify(data());
  useEffect(() => { api.current?.update(latest.current()); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="f3d relative w-full overflow-hidden rounded-2xl bg-[#1e0c09] ring-1 ring-white/10" style={{ aspectRatio: "16 / 10" }}>
      <div ref={host} className="absolute inset-0" role="group" aria-label={t("مجسّم ثلاثي الأبعاد لميدان سيد الشهداء مع الحالة الحية لكل منطقة وبوابة", "3D model of Sayyid Alshuhada Field with the live state of every zone and gate")} />
      {!ready && <p className="absolute inset-0 grid place-items-center text-xs text-cream/60">{t("جارٍ بناء المجسّم…", "Building the model…")}</p>}
      <p className="pointer-events-none absolute bottom-2 end-3 text-[10px] text-cream/55">
        {touch ? t("اسحب للتدوير · إصبعان للتقريب", "Drag to orbit · pinch to zoom") : t("اسحب للتدوير · عجلة الفأرة للتقريب", "Drag to orbit · scroll to zoom")}
      </p>
    </div>
  );
}
