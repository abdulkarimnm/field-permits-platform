"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Spotlight card: a soft gold light follows the pointer; the border glows. */
export function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty("--x", `${e.clientX - r.left}px`);
        ref.current!.style.setProperty("--y", `${e.clientY - r.top}px`);
      }}
      className={`spot ${className}`}
    >
      {children}
    </div>
  );
}

/** Counts up to a value once visible. */
export function Ticker({ value, className = "" }: { value: number; className?: string }) {
  const [n, setN] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value || matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setN(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`num ${className}`}>{n}</span>;
}

/** Live rotating code demo for the landing bento (decorative). */
export function RotatingDemo() {
  const [left, setLeft] = useState(30);
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const s = 30 - (Math.floor(Date.now() / 1000) % 30);
      setLeft(s);
      if (s === 30) setSeed((x) => x + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);
  // deterministic pseudo-QR pattern that changes every window
  const cells = Array.from({ length: 81 }, (_, i) => ((i * 7919 + seed * 104729) % 13) % 3 !== 0);
  const finder = (i: number) => {
    const x = i % 9, y = Math.floor(i / 9);
    return (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
  };
  return (
    <div className="flex items-center gap-4" aria-hidden>
      <div className="grid h-24 w-24 grid-cols-9 gap-[2px] rounded-lg bg-white p-1.5 transition-opacity">
        {cells.map((on, i) => (
          <span key={i} className={`rounded-[1px] ${finder(i) ? "bg-noir" : on ? "bg-noir/85" : "bg-transparent"}`} />
        ))}
      </div>
      <div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${(left / 30) * 100}%` }} />
        </div>
        <p className="num mt-2 text-2xl font-semibold text-gold-soft">{left}s</p>
      </div>
    </div>
  );
}
