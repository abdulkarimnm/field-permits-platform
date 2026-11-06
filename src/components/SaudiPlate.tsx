import { arabicDigits, latinOf, parseSaPlate } from "@/lib/plates";

/* Visual Saudi plate (physical object → always laid out LTR like the real plate):
   [ digits ١٥٠٢ / 1502 | letters ن ك ر / N K R | KSA strip ]
   Each Arabic letter sits directly above its Latin twin, so the Latin row reads
   left-to-right while the Arabic row reads right-to-left — exactly as on real plates.
   Non-Saudi plates fall back to a neutral tag. */

const SIZES = {
  sm: { h: 30, digit: 13, letter: 12, latin: 8, strip: 22, pad: 6 },
  md: { h: 46, digit: 20, letter: 18, latin: 10, strip: 30, pad: 9 },
  lg: { h: 64, digit: 28, letter: 25, latin: 13, strip: 40, pad: 12 },
};

export default function SaudiPlate({ plate, kind, size = "md", className = "" }: { plate: string; kind?: "sa" | "other"; size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  const p = kind === "other" ? null : parseSaPlate(plate);
  if (!p) {
    return (
      <span dir="ltr" className={`inline-flex items-center rounded-md border-2 border-ink/80 bg-white px-2 font-mono font-bold tracking-wider text-ink ${className}`} style={{ height: s.h, fontSize: s.digit * 0.8 }} aria-label={`Plate ${plate}`}>
        {plate || "—"}
      </span>
    );
  }
  const visual = [...p.letters].reverse(); // first Arabic letter sits at the right
  const latin = latinOf(visual);
  return (
    <span dir="ltr" role="img" aria-label={`لوحة ${p.letters.join(" ")} ${p.digits} · ${latinOf(p.letters).reverse().join("")} ${p.digits}`}
      className={`inline-flex select-none items-stretch overflow-hidden rounded-[6px] border-2 border-ink/85 bg-white text-ink shadow-[0_1px_0_rgba(0,0,0,.08),inset_0_0_0_1px_rgba(255,255,255,.6)] ${className}`} style={{ height: s.h }}>
      {/* digits */}
      <span className="flex flex-col items-center justify-center border-e-2 border-ink/85" style={{ paddingInline: s.pad }}>
        <span className="font-bold leading-none" style={{ fontSize: s.digit * 0.86, letterSpacing: ".06em" }}>{arabicDigits(p.digits)}</span>
        <span className="font-mono font-bold leading-none" style={{ fontSize: s.digit * 0.62, marginTop: s.h * 0.06, letterSpacing: ".18em" }}>{p.digits}</span>
      </span>
      {/* letters */}
      <span className="flex items-center border-e-2 border-ink/85" style={{ paddingInline: s.pad * 0.7, gap: s.pad * 0.55 }}>
        {visual.map((l, i) => (
          <span key={i} className="flex flex-col items-center justify-center">
            <span className="font-bold leading-none" style={{ fontSize: s.letter }}>{l}</span>
            <span className="font-mono font-bold leading-none" style={{ fontSize: s.latin, marginTop: s.h * 0.07 }}>{latin[i]}</span>
          </span>
        ))}
      </span>
      {/* KSA strip */}
      <span className="flex flex-col items-center justify-center bg-[#f3f1ee]" style={{ width: s.strip }}>
        <svg viewBox="0 0 20 16" width={s.strip * 0.55} height={s.strip * 0.44} aria-hidden><path d="M10 1v9M10 3c-3 0-5 1-6 3 2-1 4-1 6 0M10 3c3 0 5 1 6 3-2-1-4-1-6 0M4 13l12-1.5M16 13 4 11.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        <span className="font-bold leading-none" style={{ fontSize: s.latin * 0.72, marginTop: 1 }}>السعودية</span>
        <span className="font-mono font-bold leading-none" style={{ fontSize: s.latin * 0.78, marginTop: 1 }}>KSA</span>
      </span>
    </span>
  );
}
