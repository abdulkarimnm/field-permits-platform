"use client";
import { useEffect, useRef } from "react";

/* Formal light & motion effects. All of them:
   - are decorative (aria-hidden, pointer-events none),
   - stop when prefers-reduced-motion is set,
   - pause while the tab is hidden or the element is off-screen. */

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Gold dust: slow, sparse motes rising through warm light. */
export function GoldDust({ density = 46, className = "" }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let w = 0, h = 0, raf = 0, visible = true;
    const dpr = Math.min(2, devicePixelRatio || 1);
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; tw: number; ph: number };
    let ps: P[] = [];
    const resize = () => {
      const b = cv.getBoundingClientRect();
      w = b.width;
      h = b.height;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((density * w * h) / (1440 * 900));
      ps = Array.from({ length: Math.max(12, n) }, () => spawn(true));
    };
    const spawn = (anywhere = false): P => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.8,
      vy: 0.12 + Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.12,
      a: 0.25 + Math.random() * 0.55,
      tw: 0.004 + Math.random() * 0.01,
      ph: Math.random() * Math.PI * 2,
    });
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(p.ph) * 0.08;
        p.ph += p.tw;
        if (p.y < -10) Object.assign(p, spawn());
        const alpha = p.a * (0.55 + 0.45 * Math.sin(p.ph * 3));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `rgba(246,226,196,${alpha})`);
        g.addColorStop(0.4, `rgba(201,166,107,${alpha * 0.45})`);
        g.addColorStop(1, "rgba(201,166,107,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (visible) raf = requestAnimationFrame(draw);
    };
    resize();
    if (reduced()) {
      draw();
      cancelAnimationFrame(raf);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      const was = visible;
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible && !was) raf = requestAnimationFrame(draw);
    });
    io.observe(cv);
    const vis = () => {
      const was = visible;
      visible = document.visibilityState === "visible";
      if (visible && !was) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", vis);
    addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      removeEventListener("resize", resize);
    };
  }, [density]);
  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}

/** A soft warm light that follows the pointer across a dark surface. */
export function PointerGlow({ size = 620 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reduced()) return;
    const el = ref.current!;
    const host = el.parentElement!;
    let raf = 0, tx = 0, ty = 0, x = 0, y = 0, on = false;
    const move = (e: PointerEvent) => {
      const b = host.getBoundingClientRect();
      tx = e.clientX - b.left;
      ty = e.clientY - b.top;
      if (!on) {
        on = true;
        x = tx;
        y = ty;
        el.style.opacity = "1";
        loop();
      }
    };
    const leave = () => {
      on = false;
      el.style.opacity = "0";
    };
    const loop = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
      if (on) raf = requestAnimationFrame(loop);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [size]);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-0 rounded-full opacity-0 transition-opacity duration-700"
      style={{ width: size, height: size, background: "radial-gradient(circle, rgba(233,207,166,.16) 0%, rgba(201,166,107,.07) 35%, transparent 70%)", mixBlendMode: "screen" }}
    />
  );
}

/** The logo's three arches, drawn in gold on load, with a light travelling along them. */
export function ArchesDraw({ className = "" }: { className?: string }) {
  const arches = [0, 200, 400];
  return (
    <svg viewBox="0 0 600 440" fill="none" className={`arches-draw ${className}`} aria-hidden>
      <defs>
        <linearGradient id="ad-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dcb5" stopOpacity=".95" />
          <stop offset=".7" stopColor="#c9a66b" stopOpacity=".35" />
          <stop offset="1" stopColor="#c9a66b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ad-spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff6e6" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff6e6" stopOpacity="1" />
          <stop offset="1" stopColor="#fff6e6" stopOpacity="0" />
        </linearGradient>
        <filter id="ad-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" /></filter>
      </defs>
      {arches.map((x, i) => {
        const outer = `M${x + 10} 440V120a90 90 0 0 1 180 0v320`;
        const inner = `M${x + 32} 440V128a68 68 0 0 1 136 0v312`;
        return (
          <g key={x}>
            <path d={outer} stroke="url(#ad-fade)" strokeWidth="1.4" className="ad-line" style={{ animationDelay: `${i * 0.25}s` }} />
            <path d={inner} stroke="url(#ad-fade)" strokeWidth="1" strokeOpacity=".55" className="ad-line" style={{ animationDelay: `${0.15 + i * 0.25}s` }} />
            {/* travelling light */}
            <path d={outer} stroke="#fff6e6" strokeWidth="2.4" strokeLinecap="round" filter="url(#ad-glow)" className="ad-spark" style={{ animationDelay: `${2 + i * 1.3}s` }} />
          </g>
        );
      })}
      <path d="M10 350l80-80h110M210 420c90 0 180-60 180-180M400 330l130-120 60 44" stroke="url(#ad-fade)" strokeWidth="1" strokeOpacity=".6" className="ad-line" style={{ animationDelay: ".9s" }} />
    </svg>
  );
}
