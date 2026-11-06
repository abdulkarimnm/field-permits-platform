"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* Effects inspired by Magic UI (magicui.design), rebuilt on CSS + small hooks — no motion library. */

/** Blur Fade: content fades in from blur as it scrolls into view. */
export function BlurFade({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("bf-in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`bf ${className}`} style={{ ["--d" as string]: `${delay}s` }}>
      {children}
    </div>
  );
}

/** Scroll Progress: a gold hairline across the top showing reading progress. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // the bar may be gone by now (navigated away while a frame was pending)
        const el = ref.current;
        if (!el) return;
        const h = document.documentElement.scrollHeight - innerHeight;
        el.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => {
      removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} aria-hidden className="fixed inset-x-0 top-0 z-[80] h-[3px] origin-right bg-gradient-to-l from-gold-soft via-gold to-brand ltr:origin-left" style={{ transform: "scaleX(0)" }} />;
}

/** Animated circular progress (e.g. risk score). */
export function CircularProgress({ value, size = 76, stroke = 7, color, children }: { value: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-mist)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, v) / 100)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Gold confetti burst — fired once (per key) to celebrate an issued permit. */
export function Confetti({ once }: { once: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`cf:${once}`) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      sessionStorage.setItem(`cf:${once}`, "1");
    } catch {}
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ["#e9cfa6", "#c9a66b", "#f6e2c4", "#763b30", "#b38079"];
    const parts = Array.from({ length: 140 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      return {
        x: side > 0 ? innerWidth * 0.15 : innerWidth * 0.85,
        y: innerHeight * 0.75,
        vx: side * (3 + Math.random() * 7),
        vy: -(9 + Math.random() * 9),
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: colors[i % colors.length],
      };
    });
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const k = (t - t0) / 1000;
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k / 3.2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        ctx.restore();
      }
      if (k < 3.3) raf = requestAnimationFrame(loop);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [once]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[90] h-full w-full" />;
}

/** Live mini pass inside the iPhone mock: real QR modules that change every 30 s (decorative). */
export function PhonePass({ t }: { t: { valid: string; pass: string; org: string; rep: string; zone: string; note: string } }) {
  const [left, setLeft] = useState(30);
  const [seed, setSeed] = useState(1);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const s = Math.floor(Date.now() / 1000);
      setLeft(30 - (s % 30));
      setSeed(Math.floor(s / 30));
      setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" }));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);
  const N = 21;
  const cell = (x: number, y: number) => {
    const inFinder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
    for (const [fx, fy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
      if (inFinder(fx, fy)) {
        const dx = x - fx, dy = y - fy;
        return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      }
    }
    const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    return h - Math.floor(h) > 0.52;
  };
  return (
    <div className="force-light flex h-full flex-col bg-gradient-to-b from-[#fffaf5] to-[#f6ece4] px-4 pb-5 pt-12 text-ink">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-ink-soft">{t.pass}</span>
        <span className="rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold text-white">● {t.valid}</span>
      </div>
      <p className="num mt-2 text-center font-display text-base font-bold text-brand">PRM-2026-000128</p>
      <p className="text-center text-[10px] text-ink-soft">{t.org}</p>
      <div className="relative mx-auto mt-3 grid aspect-square w-[78%] rounded-xl bg-white p-2 shadow-[0_8px_24px_-12px_rgba(61,42,36,.35)]" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {Array.from({ length: N * N }, (_, i) => (
          <span key={i} className={cell(i % N, Math.floor(i / N)) ? "bg-ink" : ""} />
        ))}
        <span className="pointer-events-none absolute inset-0 animate-[scan_2.4s_linear_infinite] rounded-xl bg-gradient-to-b from-transparent via-rose-soft/30 to-transparent" />
      </div>
      <div className="mx-auto mt-3 flex items-center gap-2">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-mist">
          <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(left / 30) * 100}%` }} />
        </div>
        <span className="num text-[11px] font-bold text-brand">{left}s</span>
      </div>
      <p className="num mt-1 text-center text-[10px] text-ink-soft">{clock}</p>
      <div className="mt-auto space-y-1.5 rounded-xl bg-white/70 p-3 text-[10px]">
        <p className="flex justify-between"><span className="text-ink-soft">{t.rep}</span><b>عبدالله الحربي</b></p>
        <p className="flex justify-between"><span className="text-ink-soft">{t.zone}</span><b>الساحة الرئيسية</b></p>
      </div>
      <p className="mt-2 text-center text-[9px] leading-relaxed text-ink-soft">{t.note}</p>
      <style>{`@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}`}</style>
    </div>
  );
}
