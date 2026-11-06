import Link from "next/link";
import { i18n } from "@/lib/i18n";
import { Masthead } from "@/components/Masthead";
import { getSetting } from "@/lib/settings";
import { Silk } from "@/components/Arches";
import { RotatingDemo, Spotlight } from "@/components/fx";
import { BlurFade, PhonePass, ScrollProgress } from "@/components/magic";
import { ArchesDraw, GoldDust, PointerGlow } from "@/components/lux";
import { Icon, type IconName } from "@/components/icons";

export default async function Home() {
  const { t } = await i18n();
  const demo = await getSetting("demo_mode");
  const arrow = <span aria-hidden className="inline-block transition-transform group-hover:-translate-x-1 ltr:rotate-180 ltr:group-hover:translate-x-1">←</span>;

  const portals = [
    { href: "/apply/login", k: "01", title: t("الجهات والشركات", "Organizations"), body: t("قدّم طلب التصريح في دقائق، وتابع حالته لحظة بلحظة، ونزّل تصريحك فور اعتماده.", "Request a permit in minutes, track it live, download it the moment it's approved."), cta: t("تقديم أو متابعة طلب", "Apply or track") },
    { href: "/staff/login", k: "02", title: t("إدارة الميدان", "Field administration"), body: t("مراجعة أولية واعتماد نهائي بفرز ذكي، وإدارة التصاريح، وغرفة عمليات حية.", "Two-stage review with smart triage, permit control and a live operations room."), cta: t("دخول الموظفين", "Staff sign in") },
    { href: "/verify", k: "03", title: t("الجهات المختصة", "Field agencies"), body: t("امسح الرمز لترى الحالة الفعلية الآن، وطابق الأفراد والمركبات والمعدات.", "Scan to see the live status and match people, vehicles and equipment."), cta: t("بوابة التحقق", "Verification portal") },
  ];

  const journey = [
    [t("التقديم", "Submit"), t("رمز لمرة واحدة، دون حساب", "One-time code, no account")],
    [t("المراجعة الأولية", "Initial review"), t("فرز ذكي بدرجة مخاطر", "Smart risk triage")],
    [t("الاعتماد النهائي", "Final approval"), t("فصل المهام بين المرحلتين", "Separation of duties")],
    [t("الإصدار", "Issuance"), t("PDF رسمي ورمز QR", "Official PDF + QR")],
    [t("التحقق الميداني", "Field check"), t("الحالة الحية لا الورق", "Live status, not paper")],
  ];

  const layers: [IconName, string][] = [
    ["key", t("رمز لا يحمل بيانات (256 بت)", "Data-free 256-bit code")],
    ["lock", t("الدخول للمخولين فقط", "Authorized users only")],
    ["scan", t("ماسح داخل البوابة", "In-portal scanner")],
    ["pulse", t("حالة لحظية عند المسح", "Live status at scan")],
    ["target", t("مطابقة النطاق", "Scope matching")],
    ["phone", t("رمز الممثل المؤقت", "Representative code")],
    ["log", t("سجل لكل عملية", "Every check logged")],
  ];

  return (
    <div className="noir min-h-dvh overflow-x-hidden">
      <ScrollProgress />
      <Masthead
        end={
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/verify" className="rounded-lg px-3 py-2 font-medium text-ink-soft hover:text-brand">{t("التحقق الميداني", "Field verification")}</Link>
            <Link href="/staff/login" className="rounded-lg px-3 py-2 font-medium text-ink-soft hover:text-brand">{t("دخول الموظفين", "Staff")}</Link>
          </nav>
        }
      />
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <Silk />
        <div className="rays" aria-hidden><i /><i /><i /><i /></div>
        <GoldDust />
        <PointerGlow />
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-20">
          <div className="rise">
            <p className="flex items-center gap-3 text-xs font-semibold tracking-wide text-gold">
              <span className="h-px w-10 bg-gold/70" />
              <span className="shiny">{t("منصة رسمية · إدارة ميدان سيد الشهداء", "Official platform · Sayyid Alshuhada Field")}</span>
            </p>
            <h1 className="sweep mt-6 overflow-hidden font-display text-[2.4rem] font-bold leading-[1.25] text-white sm:text-6xl sm:leading-[1.2]">
              {t("تصريح دخول واحد", "One entry permit")}
              <span className="text-gold-grad block">{t("يُتحقق منه لحظة الوصول", "verified on arrival")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-[1.9] text-cream/75 sm:text-lg">
              {t(
                "من تقديم الطلب إلى البوابة في مسار واحد: اعتماد على مرحلتين، وتصريح إلكتروني برمز يتغير كل 30 ثانية، وتحقق ميداني من الحالة الفعلية في النظام.",
                "From request to gate in one flow: two-stage approval, an electronic permit with a code that changes every 30 seconds, and field checks against the live record.",
              )}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/apply/login" className="shimmer-btn group inline-flex min-h-12 items-center gap-3 rounded-xl bg-gradient-to-b from-gold-soft to-gold px-6 text-[15px] font-bold text-noir shadow-[0_10px_30px_-10px_rgba(201,166,107,.7)] transition hover:brightness-105">
                {t("قدّم طلب تصريح", "Request a permit")} {arrow}
              </Link>
              {demo ? (
                <Link href="/sandbox" className="group inline-flex min-h-12 items-center gap-2.5 rounded-xl border border-gold/50 bg-white/5 px-5 text-[15px] font-semibold text-gold-soft backdrop-blur transition hover:bg-white/10">
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gold" /></span>
                  {t("جرّب النظام بكل الصلاحيات", "Try every role yourself")}
                </Link>
              ) : (
                <Link href="/verify" className="inline-flex min-h-12 items-center rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-cream backdrop-blur transition hover:border-gold/50 hover:bg-white/10">
                  {t("بوابة التحقق الميداني", "Field verification")}
                </Link>
              )}
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-4 divide-x divide-white/10 border-t border-white/10 pt-6 rtl:divide-x-reverse">
              {[["7", t("طبقات تحقق", "check layers")], ["30", t("ثانية لكل رمز", "sec per code")], ["256", t("بت عشوائية", "random bits")], ["2", t("مرحلتا اعتماد", "approval stages")]].map(([v, k]) => (
                <div key={k} className="flex flex-col items-center px-2 text-center">
                  <dt className="sr-only">{k}</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums leading-none text-gold-soft sm:text-3xl">{v}</dd>
                  <p className="mt-2 text-[11px] leading-snug text-cream/60 sm:text-xs">{k}</p>
                </div>
              ))}
            </dl>
          </div>

          {/* Live pass on an iPhone (Magic UI–style device mock) */}
          <div className="relative mx-auto w-full max-w-[19rem] lg:mx-0 lg:justify-self-center">
            <ArchesDraw className="pointer-events-none absolute -top-24 left-1/2 hidden w-[200%] -translate-x-1/2 opacity-60 sm:block" />
            <div className="halo" aria-hidden />
            <div className="rise relative" style={{ animationDelay: ".15s" }}>
              <div className="iphone">
                <div className="iphone-screen aspect-[9/19.5]">
                  <div className="iphone-island" />
                  <PhonePass t={{ valid: t("ساري", "Valid"), pass: t("بطاقة دخول رقمية", "Digital entry pass"), org: t("شركة الواحة للمقاولات", "Al-Waha Contracting"), rep: t("الممثل", "Representative"), zone: t("المنطقة", "Zone"), note: t("صورة الشاشة لا تُقبل عند البوابة", "Screenshots are rejected at the gate") }} />
                </div>
              </div>
              <span className="absolute -end-16 top-32 hidden items-center gap-2 rounded-2xl border border-white/15 bg-noir-2/80 px-3 py-2 text-xs text-cream shadow-xl backdrop-blur-md sm:flex">
                <Icon name="lock" size={16} className="text-gold-soft" /> {t("رمز يتغير كل 30 ثانية", "Rotates every 30s")}
              </span>
              <span className="absolute -end-10 bottom-24 hidden items-center gap-2 rounded-2xl border border-white/15 bg-noir-2/80 px-3 py-2 text-xs text-cream shadow-xl backdrop-blur-md sm:flex">
                <Icon name="wifi" size={16} className="text-gold-soft" /> {t("يعمل دون اتصال", "Works offline")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Portals ── */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {portals.map((p, i) => (
            <BlurFade key={p.href} delay={i * 0.08}>
            <Spotlight className="group h-full rounded-3xl border border-white/10 bg-noir-2/80">
              <Link href={p.href} className="flex h-full flex-col p-6 sm:p-7">
                <span className="num font-display text-sm text-gold/80">{p.k}</span>
                <h2 className="mt-3 text-xl font-bold text-white">{p.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-[1.85] text-cream/65">{p.body}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-gold-soft">{p.cta} {arrow}</span>
              </Link>
            </Spotlight>
            </BlurFade>
          ))}
        </div>
      </section>

      {/* ── Bento ── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="shiny text-xs font-semibold">{t("ما الذي يميز هذه المنصة", "What sets it apart")}</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-snug text-white sm:text-4xl">{t("ثقة تُبنى طبقة فوق طبقة", "Trust, built layer on layer")}</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          <BlurFade className="md:col-span-4" delay={0}><Spotlight className="h-full rounded-3xl border border-white/10 bg-noir-2/70 p-6">
            <Bento k={t("رمز حي يتغير كل 30 ثانية", "A live code every 30 seconds")} v={t("بطاقة الممثل على جواله تولّد رمزًا موقّعًا يتجدد باستمرار، فلا تنفع صورة الشاشة ولا النسخة المصورة، ويعمل دون إنترنت بعد فتحها.", "The representative's phone pass generates a signed code that keeps renewing — screenshots and photocopies don't work, and it runs offline once opened.")} />
            <div className="mt-6"><RotatingDemo /></div>
          </Spotlight></BlurFade>
          <BlurFade className="md:col-span-2" delay={0}><Spotlight className="h-full rounded-3xl border border-white/10 bg-noir-2/70 p-6">
            <Bento k={t("تحقق دون اتصال", "Works offline")} v={t("نسخة موقّعة رقميًا (Ed25519) لدى المتحقق تُبقي البوابة عاملة عند انقطاع الشبكة، وتُرفع النتائج تلقائيًا.", "A digitally signed (Ed25519) snapshot keeps gates working without a network; results sync automatically.")} />
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-cream/70"><span className="h-2 w-2 rounded-full bg-hold" /> {t("دون اتصال · موقّع ✓", "Offline · signed ✓")}</p>
          </Spotlight></BlurFade>
          <BlurFade className="md:col-span-2" delay={0}><Spotlight className="h-full rounded-3xl border border-white/10 bg-noir-2/70 p-6">
            <Bento k={t("فرز ذكي للطلبات", "Smart triage")} v={t("درجة مخاطر شفافة لكل طلب: مسار سريع للجهات الموثوقة، وتنبيه للتداخل والمناطق الحساسة.", "A transparent risk score: fast lane for trusted orgs, flags for overlaps and sensitive zones.")} />
            <div className="mt-6 flex gap-2 text-xs">
              <span className="rounded-full bg-ok/20 px-3 py-1 text-[#8fd3b0]">{t("سريع", "Fast")}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-cream/80">{t("عادي", "Normal")}</span>
              <span className="rounded-full bg-bad/25 px-3 py-1 text-[#f3a39d]">{t("مشدد", "Strict")}</span>
            </div>
          </Spotlight></BlurFade>
          <BlurFade className="md:col-span-2" delay={0}><Spotlight className="h-full rounded-3xl border border-white/10 bg-noir-2/70 p-6">
            <Bento k={t("حجز السعة بالساعة", "Hourly capacity")} v={t("تختار الجهة موعد دخولها من جدول سعة حي، فلا ازدحام عند المداخل.", "Orgs book an entry hour from a live capacity grid — no queues at the gates.")} />
            <div className="mt-6 flex h-12 items-end gap-1.5" aria-hidden>
              {[40, 65, 90, 100, 70, 45, 30, 55, 80, 60].map((h, i) => (
                <span key={i} className={`flex-1 rounded-t ${h >= 100 ? "bg-bad/70" : h > 70 ? "bg-gold/70" : "bg-rose/50"}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </Spotlight></BlurFade>
          <BlurFade className="md:col-span-2" delay={0}><Spotlight className="h-full rounded-3xl border border-white/10 bg-noir-2/70 p-6">
            <Bento k={t("سجل لا يقبل التلاعب", "Tamper-evident log")} v={t("كل عملية تحمل بصمة SHA-256 للعملية السابقة؛ أي تعديل يكسر السلسلة ويظهر فورًا.", "Each action carries the SHA-256 of the previous one; any edit breaks the chain at once.")} />
            <div className="num mt-6 flex items-center gap-1.5 text-[10px] text-cream/50" aria-hidden>
              {["a3f9", "7c21", "e08b", "4d6e"].map((h, i) => (
                <span key={h} className="flex items-center gap-1.5">
                  <span className="rounded-md border border-gold/30 bg-black/20 px-2 py-1 font-mono">{h}…</span>
                  {i < 3 && <span className="text-gold/60">→</span>}
                </span>
              ))}
            </div>
          </Spotlight></BlurFade>
        </div>
      </section>

      {/* ── Seven layers (Orbiting Circles) ── */}
      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <BlurFade>
            <p className="shiny text-xs font-semibold">{t("التحقق من صحة التصريح ومنع التلاعب", "Authenticity & anti-tampering")}</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-snug text-white sm:text-4xl">{t("سبع طبقات قبل أن تُفتح البوابة", "Seven layers before the gate opens")}</h2>
            <p className="mt-4 max-w-lg leading-[1.9] text-cream/65">{t("لا يُعد المطبوع ولا رمز QR وحده إثباتًا للدخول؛ القرار يُبنى على سبع طبقات ينفذها المتحقق بالترتيب.", "Neither paper nor QR alone proves entry; the decision rests on seven layers the verifier runs in order.")}</p>
            <ol className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {layers.map(([ic, h], i) => (
                <li key={h} className="flex items-center gap-3 text-sm text-cream/85">
                  <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/30 bg-white/[.04] text-gold-soft"><Icon name={ic} size={16} /></span>
                  <span><span className="num me-1 text-gold/70">{i + 1}.</span>{h}</span>
                </li>
              ))}
            </ol>
          </BlurFade>
          <BlurFade delay={0.1}>
            <div className="relative mx-auto h-[22rem] w-[22rem] max-sm:-my-5 max-sm:scale-[.86]" aria-hidden>
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(201,166,107,.18),transparent_65%)]" />
              <div className="orbit" style={{ width: "58%", height: "58%", ["--dur" as string]: "28s" }}>
                {layers.slice(0, 3).map(([ic], i) => (
                  <div key={i} className="orbit-item" style={{ ["--a" as string]: `${i * 120}deg`, ["--rad" as string]: "6.4rem", ["--s" as string]: "2.75rem" }}>
                    <span className="grid h-full w-full place-items-center rounded-full border border-gold/40 bg-noir-2 text-gold-soft shadow-lg"><Icon name={ic} size={18} /></span>
                  </div>
                ))}
              </div>
              <div className="orbit" style={{ width: "96%", height: "96%", ["--dur" as string]: "46s", ["--dir" as string]: "reverse", ["--rdir" as string]: "normal" }}>
                {layers.slice(3).map(([ic], i) => (
                  <div key={i} className="orbit-item" style={{ ["--a" as string]: `${45 + i * 90}deg`, ["--rad" as string]: "10.55rem", ["--s" as string]: "2.75rem" }}>
                    <span className="grid h-full w-full place-items-center rounded-full border border-gold/40 bg-noir-2 text-gold-soft shadow-lg"><Icon name={ic} size={18} /></span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 m-auto grid h-24 w-24 place-items-center rounded-[1.75rem] bg-gradient-to-b from-gold-soft to-gold text-noir shadow-[0_20px_50px_-15px_rgba(201,166,107,.8)]">
                <Icon name="shield" size={44} strokeWidth={1.8} />
              </div>
            </div>
          </BlurFade>
        </div>
      </section>

      {/* ── Journey (Animated Beam) ── */}
      <section className="border-y border-white/10 bg-black/15">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <BlurFade><h2 className="font-display text-2xl font-bold text-white">{t("رحلة التصريح", "The permit journey")}</h2></BlurFade>
          <ol className="mt-10 grid gap-8 sm:grid-cols-5 sm:gap-4">
            {journey.map(([h, b], i) => (
              <li key={h} className="relative">
                <BlurFade delay={i * 0.08}>
                  <div className="flex items-center gap-3">
                    <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/50 bg-noir-2 font-display text-sm font-bold text-gold-soft shadow-[0_0_24px_-6px_rgba(201,166,107,.6)]">{i + 1}</span>
                    {i < journey.length - 1 && <div className="beam-track hidden flex-1 sm:block" style={{ ["--d" as string]: `${i * 0.45}s` }} />}
                  </div>
                  <h3 className="mt-4 font-sans text-[15px] font-semibold text-white">{h}</h3>
                  <p className="mt-1 text-sm text-cream/60">{b}</p>
                </BlurFade>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-cream/50 sm:px-6">
        <span>{t("© إدارة ميدان سيد الشهداء — منصة تصاريح الدخول", "© Sayyid Alshuhada Field Administration — Entry Permits")}</span>
        {demo && (
          <Link href="/dev/outbox" className="text-gold/80 underline-offset-4 hover:underline">
            {t("وضع التجربة الداخلية · صندوق الرسائل", "Internal trial · message outbox")}
          </Link>
        )}
      </footer>
    </div>
  );
}

function Bento({ k, v }: { k: string; v: string }) {
  return (
    <>
      <h3 className="font-sans text-lg font-bold text-white">{k}</h3>
      <p className="mt-2 max-w-xl text-sm leading-[1.85] text-cream/65">{v}</p>
    </>
  );
}
