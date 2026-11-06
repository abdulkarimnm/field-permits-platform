import type { ReactNode } from "react";
import { i18n } from "@/lib/i18n";
import { Masthead } from "./Masthead";
import { Silk } from "./Arches";
import { ArchesDraw, GoldDust, PointerGlow } from "./lux";
import { Icon, type IconName } from "./icons";

/** Immersive sign-in: the landing page's identity, with a glass form card. */
export async function AuthLayout({ eyebrow, title, sub, points, children }: { eyebrow: string; title: string; sub: string; points: string[]; children: ReactNode }) {
  const { t } = await i18n();
  const icons: IconName[] = ["lock", "shield", "key"];
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead />
      <main className="noir relative flex flex-1 overflow-hidden">
        <Silk />
        <div className="rays" aria-hidden><i /><i /><i /><i /></div>
        <GoldDust />
        <PointerGlow />
        <ArchesDraw className="pointer-events-none absolute -bottom-8 left-1/2 w-[min(1100px,140%)] -translate-x-1/2 opacity-45" />

        <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_27rem] lg:gap-16 lg:py-16">
          {/* copy */}
          <section className="rise order-2 lg:order-1">
            <p className="flex items-center gap-3 text-xs font-semibold text-gold"><span className="h-px w-10 bg-gold/70" /><span className="shiny">{eyebrow}</span></p>
            <h2 className="sweep mt-5 max-w-xl overflow-hidden font-display text-4xl font-bold leading-[1.25] text-white sm:text-5xl">
              <span className="text-gold-grad">{title}</span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-[1.95] text-cream/75">{sub}</p>
            <ul className="mt-8 grid max-w-xl gap-2.5 sm:grid-cols-1">
              {points.map((p, i) => (
                <li key={p} className="rise flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-cream/85 backdrop-blur" style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-gold-soft to-gold text-noir"><Icon name={icons[i % icons.length]} size={16} /></span>
                  {p}
                </li>
              ))}
            </ul>
          </section>

          {/* glass card */}
          <section className="rise order-1 lg:order-2" style={{ animationDelay: ".08s" }}>
            <div className="relative">
              <div className="halo" aria-hidden />
              <div className="glass-card beam rounded-[28px] p-6 sm:p-8" style={{ ["--beam" as string]: "#f3dcb5" }}>{children}</div>
            </div>
            <p className="mt-4 text-center text-[11px] text-cream/45">{t("اتصال مشفّر · كل محاولة دخول تُسجّل في سجل لا يقبل التلاعب", "Encrypted connection · every sign-in attempt is logged tamper-evidently")}</p>
          </section>
        </div>
      </main>
    </div>
  );
}
