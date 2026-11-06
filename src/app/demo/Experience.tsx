"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { CircularProgress, Confetti } from "@/components/magic";
import { Silk } from "@/components/Arches";

/* ───────── types ───────── */
type Sms = { id: number; body: string };
type Flag = { code: string; points: number; ar: string; en: string };
type Person = { name: string; id_number: string };
type Req = { org_name: string; rep_name: string; purpose: string; people: Person[]; vehicles: { plate: string; type: string }[]; equipment: { name: string; qty: number }[]; slot_date: string; slot_hour: number };
type Scan = {
  found: boolean;
  reason?: string;
  checkId: number;
  status?: string;
  number?: string;
  version?: number;
  zones?: { name_ar: string; name_en: string; atGate: boolean }[];
  people?: { name: string; id: string }[];
  vehicles?: { plate: string; type: string }[];
  canAllow?: boolean;
  repName?: string;
  repPhoneMasked?: string;
};
type Summary = { chain: { ok: boolean; count: number }; trail: { id: number; at: string; action: string; hash: string }[]; today: { checks: number; allowed: number; valid: number }; permitId: number; requestId: number };

const enc = new TextEncoder();
const nb = (s: string) => s.replace(/-/g, "‑"); // keep reference numbers on one line
const vib = (p: number | number[]) => navigator.vibrate?.(p);

async function rotPayload(secret: string, number: string) {
  const w = Math.floor(Date.now() / 1000 / 30);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${number}:${w}`)));
  const code = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  return { payload: `SSH1:R:${number}:${w}:${code}`, left: 30 - (Math.floor(Date.now() / 1000) % 30) };
}

export default function Experience({ lang }: { lang: "ar" | "en" }) {
  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
  const [ch, setCh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [t0, setT0] = useState(0);
  const [since, setSince] = useState(0);
  const [toasts, setToasts] = useState<Sms[]>([]);
  const [inbox, setInbox] = useState<Sms[]>([]);

  const [contact, setContact] = useState("");
  const [req, setReq] = useState<{ id: number; ref: string; r: Req; risk: { score: number; lane: string; flags: Flag[] } } | null>(null);
  const [typed, setTyped] = useState(0);
  const [stage1By, setStage1By] = useState("");
  const [permit, setPermit] = useState<{ id: number; number: string; version: number; rotSecret: string } | null>(null);
  const [sod, setSod] = useState(false);
  const [qr, setQr] = useState<{ img: string; payload: string; left: number } | null>(null);
  const [scan, setScan] = useState<{ result: Scan; gate: { name_ar: string; name_en: string }; verifier: { name: string; agency: string } } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [matched, setMatched] = useState<{ people: Set<number>; vehicles: Set<number> }>({ people: new Set(), vehicles: new Set() });
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpOk, setOtpOk] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [fraud, setFraud] = useState<{ stale: Scan; fake: Scan } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const api = useCallback(
    async (step: string, body: Record<string, unknown> = {}) => {
      const r = await fetch(`/api/demo/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since, ...body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      if (Array.isArray(j.sms) && j.sms.length) {
        const fresh = j.sms as Sms[];
        setSince(fresh[fresh.length - 1].id);
        setInbox((x) => [...x, ...fresh]);
        setToasts((x) => [...x, ...fresh]);
        vib([20, 40, 20]);
        fresh.forEach((m) => setTimeout(() => setToasts((x) => x.filter((y) => y.id !== m.id)), 7000));
      }
      return j;
    },
    [since],
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  /* live rotating QR for the pass + gate */
  useEffect(() => {
    if (!permit || ch < 4 || ch > 5) return;
    let stop = false;
    let last = "";
    const tick = async () => {
      const { payload, left } = await rotPayload(permit.rotSecret, permit.number);
      if (stop) return;
      if (payload !== last) {
        last = payload;
        const img = await QRCode.toDataURL(payload, { margin: 1, width: 420, color: { dark: "#3d2a24", light: "#ffffff" } });
        if (!stop) setQr({ img, payload, left });
      } else setQr((q) => (q ? { ...q, left } : q));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [permit, ch]);

  useEffect(() => {
    if (ch === 7 && t0) setElapsed(Math.round((Date.now() - t0) / 1000));
  }, [ch, t0]);

  /* ───────── chapter actions ───────── */
  const start = () =>
    run(async () => {
      const s = await api("start");
      setContact(s.contact);
      setSince(s.since);
      setT0(Date.now());
      setReq(null);
      setCh(1);
    });

  const prefill = useRef<Req | null>(null);
  useEffect(() => {
    if (ch === 1 && !req && !prefill.current) {
      // the request body the engine will submit, shown typing in before submission
      prefill.current = {
        org_name: "شركة النخبة لتنظيم الفعاليات",
        rep_name: "فيصل عبدالرحمن العتيبي",
        purpose: "تجهيز منصة الاستقبال وتركيب الإضاءة واللوحات الإرشادية لفعالية الزوار",
        people: ["فيصل عبدالرحمن العتيبي", "نواف سعد القحطاني", "عبدالعزيز خالد الشهري", "ماجد علي الزهراني", "تركي فهد الدوسري", "سلطان ناصر المطيري"].map((name) => ({ name, id_number: "••••" })),
        vehicles: [{ plate: "ر ك ن ••••", type: "شاحنة نقل خفيفة" }, { plate: "س ع د ••••", type: "مركبة خدمات" }],
        equipment: [{ name: "رافعة مقصية", qty: 1 }, { name: "وحدات إضاءة", qty: 12 }],
        slot_date: "",
        slot_hour: 0,
      };
      setTyped(0);
      const id = setInterval(() => setTyped((n) => (n >= 1000 ? (clearInterval(id), n) : n + 9)), 16);
      return () => clearInterval(id);
    }
  }, [ch, req]);

  const submit = () =>
    run(async () => {
      const j = await api("submit");
      setReq({ id: j.id, ref: j.ref, r: j.request, risk: j.risk });
      vib(30);
      setCh(2);
    });

  const stage1 = () =>
    run(async () => {
      const j = await api("stage1", { id: req!.id });
      setStage1By(j.by);
      vib(30);
      setCh(3);
    });

  const stage2 = () =>
    run(async () => {
      const j = await api("stage2", { id: req!.id });
      setSod(j.sodBlocked);
      setPermit(j.permit);
      vib([30, 60, 30, 60, 90]);
      setCh(4);
    });

  const doScan = () =>
    run(async () => {
      if (!qr) return;
      setScanning(true);
      vib(15);
      await new Promise((r) => setTimeout(r, 1600));
      const j = await api("scan", { id: req!.id, payload: qr.payload });
      setScanning(false);
      setScan(j);
      vib(j.result.found ? [40, 30, 40] : 200);
    });

  const sendOtp = () =>
    run(async () => {
      const j = await api("otp", { id: req!.id, checkId: scan!.result.checkId });
      if (!j.ok && j.error !== "cooldown") throw new Error(j.error);
      setOtpSent(true);
    });

  const otpFromSms = inbox
    .slice()
    .reverse()
    .map((m) => m.body.match(/:\s*(\d{6})\s*—/)?.[1])
    .find(Boolean);

  const checkOtp = (code: string) =>
    run(async () => {
      const j = await api("otpcheck", { id: req!.id, checkId: scan!.result.checkId, code });
      if (!j.ok) throw new Error(j.error);
      setOtpOk(true);
      vib(30);
    });

  const allow = () =>
    run(async () => {
      await api("allow", { id: req!.id, checkId: scan!.result.checkId, people: [...matched.people], vehicles: [...matched.vehicles] });
      setAllowed(true);
      vib([40, 40, 120]);
    });

  const tryFraud = () =>
    run(async () => {
      const j = await api("stale", { id: req!.id });
      setFraud(j);
      vib([200, 80, 200]);
    });

  const finish = () =>
    run(async () => {
      const j = await api("summary", { id: req!.id });
      setSummary(j);
      setCh(7);
    });

  const restart = () => {
    setCh(0);
    setReq(null);
    prefill.current = null;
    setPermit(null);
    setScan(null);
    setMatched({ people: new Set(), vehicles: new Set() });
    setOtpSent(false);
    setOtpOk(false);
    setOtpCode("");
    setAllowed(false);
    setFraud(null);
    setSummary(null);
    setInbox([]);
  };

  /* ───────── story ───────── */
  const chapters: { k: string; role: string; icon: IconName }[] = [
    { k: t("البداية", "Start"), role: "", icon: "home" },
    { k: t("الطلب", "Request"), role: t("ممثل الجهة", "Representative"), icon: "doc" },
    { k: t("المراجعة", "Review"), role: t("المراجع الأولي", "Initial reviewer"), icon: "inbox" },
    { k: t("الاعتماد", "Approval"), role: t("المعتمد النهائي", "Final approver"), icon: "shield" },
    { k: t("البطاقة", "Pass"), role: t("ممثل الجهة", "Representative"), icon: "phone" },
    { k: t("البوابة", "Gate"), role: t("المتحقق الميداني", "Field verifier"), icon: "scan" },
    { k: t("التحايل", "Fraud"), role: t("محتال افتراضي", "Would-be fraudster"), icon: "lock" },
    { k: t("الختام", "Finale"), role: t("مشرف الميدان", "Field supervisor"), icon: "pulse" },
  ];

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const ERR: Record<string, [string, string]> = {
    demo_disabled: ["وضع التجربة معطّل في الإعدادات", "Demo mode is disabled"],
    hourly_limit: ["تجاوزت عدد الرموز في الساعة، أعد التجربة لاحقًا", "Hourly code limit reached"],
    wrong: ["الرمز غير صحيح", "Wrong code"],
  };

  return (
    <div className="force-light noir relative flex flex-1 flex-col overflow-hidden">
      <Silk />
      {ch === 4 && <Confetti once={`demo-${permit?.number}`} />}

      {/* SMS notifications (real messages from the system outbox) */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[95] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((m) => (
          <div key={m.id} className="al-item pointer-events-auto w-full max-w-sm rounded-2xl border border-white/40 bg-white/90 p-3 text-ink shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 text-[11px] text-ink-soft">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-ok text-white"><Icon name="inbox" size={12} strokeWidth={2.4} /></span>
              <b className="text-ink">{t("الرسائل", "Messages")}</b> · {t("الآن", "now")} · <span className="num">{contact}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed">{m.body}</p>
          </div>
        ))}
      </div>

      {/* Chapter rail */}
      <nav className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6" aria-label={t("فصول التجربة", "Chapters")}>
        <ol className="flex items-center gap-1 overflow-x-auto pb-2">
          {chapters.slice(1).map((c, i) => {
            const n = i + 1;
            const done = ch > n;
            const on = ch === n;
            return (
              <li key={c.k} className="flex min-w-0 flex-1 items-center gap-1">
                <span className={`flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-xs transition ${on ? "bg-gold-soft text-noir shadow-[0_0_24px_-4px_rgba(233,207,166,.7)]" : done ? "text-gold-soft" : "text-cream/40"}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full ${on ? "bg-noir/10" : done ? "bg-gold/20" : "bg-white/5"}`}>
                    {done ? <Icon name="shield" size={13} /> : <span className="num text-[11px] font-bold">{n}</span>}
                  </span>
                  <span className="hidden font-semibold sm:inline">{c.k}</span>
                </span>
                {n < 7 && <span className={`h-px min-w-3 flex-1 ${done ? "bg-gold/60" : "bg-white/10"}`} />}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 pb-28 pt-4 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-center lg:pb-12">
        {/* ── Narrator ── */}
        <section key={`n${ch}`} className="rise order-2 lg:order-1">
          {ch > 0 && (
            <p className="flex items-center gap-2 text-xs font-semibold text-gold">
              <span className="num">{t(`الفصل ${ch} من 7`, `Chapter ${ch} of 7`)}</span>
              <span className="h-px w-6 bg-gold/50" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-0.5 text-cream/80"><Icon name={chapters[ch].icon} size={13} /> {chapters[ch].role}</span>
            </p>
          )}
          {ch === 0 && (
            <>
              <p className="shiny text-xs font-semibold">{t("محاكاة حية على النظام الحقيقي", "A live simulation on the real system")}</p>
              <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
                {t("عِش رحلة التصريح", "Live the permit journey")}
                <span className="text-gold-grad block">{t("في ثلاث دقائق", "in three minutes")}</span>
              </h1>
              <p className="mt-5 leading-[1.95] text-cream/75">
                {t(
                  "ستلعب كل الأدوار بنفسك: جهة تقدّم طلبًا، ومراجع، ومعتمد، وممثل يحمل بطاقته، ومتحقق عند البوابة… ثم ستحاول خداع النظام. كل ما تفعله يُنفَّذ فعليًا ويُسجَّل في سجل لا يقبل التلاعب.",
                  "You'll play every role: an organization applying, a reviewer, an approver, a representative with their pass, a verifier at the gate… then you'll try to fool the system. Everything you do really runs and lands in a tamper-evident log.",
                )}
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-2 text-sm text-cream/80">
                {[["doc", t("طلب حقيقي برقم مرجعي", "A real request")], ["shield", t("اعتماد على مرحلتين", "Two-stage approval")], ["phone", t("رمز حي يتغير", "A live rotating code")], ["log", t("بصمات سجل حقيقية", "Real audit hashes")]].map(([ic, l]) => (
                  <li key={l} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5"><Icon name={ic as IconName} size={16} className="text-gold-soft" />{l}</li>
                ))}
              </ul>
              <Cta onClick={start} busy={busy} label={t("ابدأ التجربة", "Start the experience")} />
            </>
          )}
          {ch === 1 && (
            <Story
              title={t("أنت ممثل شركة فعاليات", "You represent an events company")}
              body={t("تحتاج دخول الساحة الرئيسية غدًا بستة أفراد ومركبتين ومعدات. دخلت برمز لمرة واحدة دون حساب، والنموذج الذكي يملأ بياناتك المحفوظة ويتحقق منها أثناء الكتابة.", "You need the Main Plaza for six people, two vehicles and equipment. You signed in with a one-time code — no account — and the smart form fills and checks your saved data as you go.")}
              behind={t("التحقق من الهوية والجوال والتواريخ يتم فوريًا، وحجز موعد الدخول من جدول السعة.", "IDs, phone and dates are validated instantly; the entry hour is booked against live capacity.")}
            >
              <Cta onClick={submit} busy={busy} disabled={typed < 1000} label={typed < 1000 ? t("جارٍ تعبئة النموذج…", "Filling the form…") : t("قدّم الطلب", "Submit the request")} />
            </Story>
          )}
          {ch === 2 && req && (
            <Story
              title={t(`وصل الطلب ${nb(req.ref)} إلى المراجع`, `${nb(req.ref)} reached the reviewer`)}
              body={t("قبل أن يفتحه أحد، حسب النظام درجة مخاطر شفافة ووضعه في المسار المناسب. المراجع يرى الأسباب لا رقمًا فقط.", "Before anyone opened it, the system scored its risk and routed it. The reviewer sees the reasons, not just a number.")}
              behind={t("سجل الجهة، المناطق الحساسة، التداخل مع طلبات أخرى، وسعة الموعد — كلها تدخل في الحساب.", "Org history, sensitive zones, overlaps with other requests and slot capacity all feed the score.")}
            >
              <Cta onClick={stage1} busy={busy} label={t("اعتماد أولي", "Approve stage 1")} />
            </Story>
          )}
          {ch === 3 && (
            <Story
              title={t("المرحلة الثانية: الاعتماد النهائي", "Stage 2: final approval")}
              body={t(`اعتمد ${stage1By} المرحلة الأولى. الآن دور المعتمد النهائي — والنظام لن يسمح لنفس الشخص بتنفيذ المرحلتين.`, `${stage1By} passed stage 1. Now the final approver — the system won't let one person do both stages.`)}
              behind={t("عند الاعتماد يصدر التصريح تلقائيًا برقم ورمز عشوائي بطول 256 بت ويُشعر الممثل.", "On approval the permit is issued with a number and a 256-bit random code, and the representative is notified.")}
            >
              <Cta onClick={stage2} busy={busy} label={t("اعتماد نهائي وإصدار التصريح", "Approve & issue the permit")} />
            </Story>
          )}
          {ch === 4 && permit && (
            <Story
              title={t(`صدر التصريح ${nb(permit.number)}`, `Permit ${nb(permit.number)} issued`)}
              body={t("هذه بطاقة الممثل على جواله. لاحظ أن الرمز يتغير كل 30 ثانية: صورة الشاشة اليوم لا تساوي شيئًا بعد دقيقة.", "This is the representative's phone pass. The code changes every 30 seconds: today's screenshot is worthless a minute later.")}
              behind={sod ? t("حاول النظام أن يجعل المراجع يعتمد المرحلة الثانية — ورفض تلقائيًا (فصل المهام).", "The system tried letting the reviewer approve stage 2 — and refused (separation of duties).") : undefined}
            >
              <Cta onClick={() => setCh(5)} label={t("توجّه إلى البوابة", "Head to the gate")} />
            </Story>
          )}
          {ch === 5 && (
            <Story
              title={t("أنت الآن المتحقق عند البوابة الشمالية", "You're now the verifier at the North Gate")}
              body={
                !scan
                  ? t("امسح الرمز الحي من جوال الممثل. الماسح لا يفتح أي رابط — يبحث عن المعرّف في النظام ويحسب الحالة لحظة المسح.", "Scan the live code on the representative's phone. The scanner opens no links — it looks up the identifier and computes the status at that instant.")
                  : allowed
                    ? t("تم تسجيل السماح بالدخول ومن دخل فعلًا. هذا السجل لا يمكن تعديله لاحقًا.", "Entry allowed and who actually entered is recorded. This record can't be edited later.")
                    : t("أشّر على الموجودين فعليًا، ثم تأكد أن الحامل هو الممثل نفسه برمز يصل إلى جواله المسجل.", "Tick who's actually present, then confirm the holder is the representative with a code sent to their registered phone.")
              }
              behind={t("إن انقطعت الشبكة، تعمل البوابة من نسخة موقّعة رقميًا وترفع النتائج لاحقًا.", "If the network drops, the gate runs from a signed snapshot and syncs later.")}
            >
              {!scan ? (
                <Cta onClick={doScan} busy={busy || scanning} disabled={!qr} label={scanning ? t("جارٍ المسح…", "Scanning…") : t("امسح بطاقة الممثل", "Scan the pass")} />
              ) : !allowed ? (
                <div className="mt-7 space-y-2">
                  {!otpSent ? (
                    <button onClick={sendOtp} disabled={busy || matched.people.size === 0} className={ghostBtn}>
                      <Icon name="phone" size={18} /> {matched.people.size === 0 ? t("أشّر على الأفراد أولًا", "Tick the people first") : t("أرسل رمزًا لجوال الممثل", "Send a code to the representative")}
                    </button>
                  ) : !otpOk ? (
                    <div className="flex gap-2">
                      <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} inputMode="numeric" maxLength={6} dir="ltr" placeholder="••••••" aria-label={t("رمز الممثل", "Representative code")}
                        className="min-h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-center text-xl tracking-[0.4em] text-white placeholder:text-cream/30 focus:border-gold focus:outline-none" />
                      {otpFromSms && !otpCode && (
                        <button onClick={() => setOtpCode(otpFromSms)} className="shrink-0 rounded-xl border border-gold/40 px-3 text-xs font-semibold text-gold-soft">{t("من الرسالة", "From SMS")}</button>
                      )}
                      <button onClick={() => checkOtp(otpCode)} disabled={busy || otpCode.length !== 6} className="shrink-0 rounded-xl bg-gold-soft px-4 font-bold text-noir disabled:opacity-40">{t("تحقق", "Verify")}</button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 rounded-xl bg-ok/20 px-3 py-3 text-sm font-semibold text-[#9be0bb]"><Icon name="shield" size={18} /> {t("تم التحقق: الحامل هو الممثل نفسه", "Verified: the holder is the representative")}</p>
                  )}
                  <Cta onClick={allow} busy={busy} disabled={!otpOk || matched.people.size === 0} label={t(`اسمح بدخول ${matched.people.size} فرد`, `Allow ${matched.people.size} in`)} green />
                </div>
              ) : (
                <Cta onClick={() => setCh(6)} label={t("الآن… حاول خداع النظام", "Now… try to fool the system")} />
              )}
            </Story>
          )}
          {ch === 6 && (
            <Story
              title={t("فلنجرّب التحايل", "Let's try to cheat")}
              body={t("شخص التقط صورة شاشة للبطاقة قبل دقائق ليستخدمها لاحقًا، وآخر صنع رمزًا مزيفًا يقود إلى موقع مشابه. لنرَ ماذا يحدث عند البوابة.", "Someone took a screenshot of the pass minutes ago to reuse it; someone else made a fake code that leads to a look-alike site. Let's see what happens at the gate.")}
              behind={t("كل محاولة تُسجَّل وتظهر في غرفة العمليات كمحاولة مشبوهة.", "Every attempt is logged and shows up in the operations room as suspicious.")}
            >
              {!fraud ? <Cta onClick={tryFraud} busy={busy} label={t("جرّب صورة الشاشة والرمز المزيف", "Try the screenshot & fake code")} danger /> : <Cta onClick={finish} busy={busy} label={t("اختم التجربة في غرفة العمليات", "Finish in the operations room")} />}
            </Story>
          )}
          {ch === 7 && summary && (
            <Story
              title={t("أتممت رحلة تصريح كاملة", "You completed a full permit journey")}
              body={t(`في ${fmtTime(elapsed)} دقيقة: طلب، ومرحلتا اعتماد، وتصريح، وتحقق ميداني، ومحاولتا تحايل مرفوضتان. كل خطوة موقعة في السجل.`, `In ${fmtTime(elapsed)}: a request, two approvals, a permit, a field check and two rejected fraud attempts — each signed into the log.`)}
            >
              <div className="mt-7 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Link href="/staff/ops" className={goldBtn}>{t("افتح غرفة العمليات الحقيقية", "Open the real ops room")}</Link>
                <button onClick={restart} className={`${ghostBtn} sm:w-auto sm:px-6`}>{t("أعد التجربة", "Replay")}</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Link href={`/permit/${summary.permitId}`} className="text-gold-soft underline-offset-4 hover:underline">{t("التصريح PDF", "Permit PDF")}</Link>
                <Link href={`/pass/${summary.permitId}`} className="text-gold-soft underline-offset-4 hover:underline">{t("بطاقة الجوال", "Mobile pass")}</Link>
                <Link href={`/staff/permits/${summary.permitId}`} className="text-gold-soft underline-offset-4 hover:underline">{t("سجل التحقق", "Check log")}</Link>
                <Link href="/staff/audit" className="text-gold-soft underline-offset-4 hover:underline">{t("سجل العمليات", "Audit log")}</Link>
              </div>
            </Story>
          )}
          {error && <p role="alert" className="mt-4 rounded-xl bg-bad/25 px-3 py-2 text-sm text-[#ffb4ab]">{t(...(ERR[error] ?? ["تعذر تنفيذ الخطوة: " + error, "Step failed: " + error]))}</p>}
        </section>

        {/* ── Stage ── */}
        <section key={`s${ch}`} className="rise order-1 flex justify-center lg:order-2" style={{ animationDelay: ".08s" }} aria-label={t("المشهد", "Stage")}>
          {ch === 0 && <IntroStage t={t} />}
          {ch === 1 && (
            <Phone>
              <FormFill t={t} r={prefill.current ?? req?.r ?? null} typed={typed} />
            </Phone>
          )}
          {(ch === 2 || ch === 3) && req && (
            <Laptop url={ch === 2 ? "/staff/r/" + req.id : "/staff/r/" + req.id}>
              <ReviewScreen t={t} lang={lang} req={req} stage={ch === 2 ? 1 : 2} by={stage1By} />
            </Laptop>
          )}
          {ch === 4 && permit && (
            <Phone>
              <PassScreen t={t} permit={permit} org={req!.r.org_name} rep={req!.r.rep_name} qr={qr} />
            </Phone>
          )}
          {ch === 5 && permit && (
            <div className="grid w-full max-w-3xl items-center gap-6 md:grid-cols-[15rem_1fr]">
              <div className="relative mx-auto w-56 md:w-full">
                <Phone small>
                  <PassScreen t={t} permit={permit} org={req!.r.org_name} rep={req!.r.rep_name} qr={qr} compact />
                </Phone>
                {scanning && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="scanline h-3/5 w-4/5 rounded-2xl border-4 border-gold-soft/90" /></div>}
              </div>
              <GateScreen t={t} lang={lang} scan={scan} matched={matched} setMatched={setMatched} allowed={allowed} otpOk={otpOk} />
            </div>
          )}
          {ch === 6 && <FraudStage t={t} fraud={fraud} busy={busy} />}
          {ch === 7 && summary && <FinaleStage t={t} summary={summary} elapsed={fmtTime(elapsed)} />}
        </section>
      </div>
    </div>
  );
}

/* ───────── pieces ───────── */
const goldBtn = "shimmer-btn inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-soft to-gold px-6 py-3.5 text-base font-bold text-noir shadow-[0_14px_34px_-12px_rgba(201,166,107,.85)] transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-cream transition hover:border-gold/50 disabled:opacity-40";

function Cta({ onClick, label, busy, disabled, green, danger }: { onClick: () => void; label: string; busy?: boolean; disabled?: boolean; green?: boolean; danger?: boolean }) {
  const tone = green ? "from-[#3fb57a] to-ok text-white shadow-[0_14px_34px_-12px_rgba(31,122,77,.9)]" : danger ? "from-[#d4574d] to-bad text-white shadow-[0_14px_34px_-12px_rgba(179,38,30,.9)]" : "";
  return (
    <div className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mt-7 lg:static">
      <button onClick={onClick} disabled={busy || disabled} className={`${goldBtn} ${tone}`}>
        {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        {label}
      </button>
    </div>
  );
}

function Story({ title, body, behind, children }: { title: string; body: string; behind?: string; children?: ReactNode }) {
  return (
    <>
      <h2 className="mt-4 font-display text-3xl font-bold leading-snug text-white sm:text-[2.1rem]">{title}</h2>
      <p className="mt-4 leading-[1.95] text-cream/75">{body}</p>
      {behind && (
        <p className="mt-5 flex gap-3 rounded-2xl border border-gold/25 bg-gold/[.07] p-3.5 text-sm leading-relaxed text-cream/80">
          <Icon name="settings" size={18} className="mt-0.5 shrink-0 text-gold-soft" />
          <span><b className="text-gold-soft">{"خلف الكواليس · "}</b>{behind}</span>
        </p>
      )}
      {children}
    </>
  );
}

function Phone({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <div className={`iphone w-full ${small ? "max-w-[15rem]" : "max-w-[19.5rem]"}`}>
      <div className="iphone-screen aspect-[9/19.5]">
        <div className="iphone-island" />
        <div className="absolute inset-0 overflow-y-auto pt-11">{children}</div>
      </div>
    </div>
  );
}

function Laptop({ children, url }: { children: ReactNode; url: string }) {
  return (
    <div className="w-full max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#1b1210] shadow-[0_40px_80px_-30px_rgba(0,0,0,.8)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" /></span>
          <span className="num mx-auto truncate rounded-md bg-white/10 px-3 py-1 text-[11px] text-cream/60" dir="ltr">permits.sayyidalshuhada.sa{url}</span>
        </div>
        <div className="max-h-[32rem] overflow-y-auto bg-paper text-ink">{children}</div>
      </div>
      <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl bg-gradient-to-b from-[#3a2a26] to-[#140b09] rtl:translate-x-[2%]" />
    </div>
  );
}

function IntroStage({ t }: { t: (a: string, e: string) => string }) {
  const roles: [IconName, string][] = [["doc", t("جهة", "Org")], ["inbox", t("مراجع", "Reviewer")], ["shield", t("معتمد", "Approver")], ["phone", t("ممثل", "Rep")], ["scan", t("متحقق", "Verifier")], ["pulse", t("مشرف", "Supervisor")]];
  return (
    <div className="relative grid h-[22rem] w-[22rem] place-items-center max-sm:scale-90" aria-hidden>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(201,166,107,.22),transparent_65%)]" />
      <div className="orbit" style={{ width: "92%", height: "92%", ["--dur" as string]: "36s" }}>
        {roles.map(([ic, l], i) => (
          <div key={l} className="orbit-item" style={{ ["--a" as string]: `${i * 60}deg`, ["--rad" as string]: "10.1rem", ["--s" as string]: "3.5rem" }}>
            <span className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-gold/40 bg-noir-2 text-gold-soft shadow-lg">
              <Icon name={ic} size={18} />
              <span className="mt-0.5 text-[9px] text-cream/70">{l}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="relative grid h-28 w-28 place-items-center rounded-[2rem] bg-gradient-to-b from-gold-soft to-gold text-noir shadow-[0_24px_60px_-18px_rgba(201,166,107,.9)]">
        <Icon name="card" size={50} strokeWidth={1.6} />
      </div>
    </div>
  );
}

function FormFill({ t, r, typed }: { t: (a: string, e: string) => string; r: Req | null; typed: number }) {
  if (!r) return null;
  const rows: [string, string][] = [
    [t("الجهة", "Organization"), r.org_name],
    [t("الممثل", "Representative"), r.rep_name],
    [t("الغرض", "Purpose"), r.purpose],
    [t("المنطقة", "Zone"), t("الساحة الرئيسية", "Main Plaza")],
    [t("الأفراد", "People"), r.people.map((p) => p.name).join("، ")],
    [t("المركبات", "Vehicles"), r.vehicles.map((v) => v.type).join("، ")],
    [t("المعدات", "Equipment"), r.equipment.map((x) => `${x.name} ×${x.qty}`).join("، ")],
  ];
  const total = rows.reduce((s, [, v]) => s + v.length, 0);
  let budget = Math.round((typed / 1000) * total);
  return (
    <div className="px-4 pb-5 text-ink">
      <p className="text-[11px] text-ink-soft">{t("طلب تصريح جديد", "New permit request")}</p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-gradient-to-l from-brand to-gold transition-[width]" style={{ width: `${typed / 10}%` }} /></div>
      <div className="mt-3 space-y-2">
        {rows.map(([k, v]) => {
          const shown = v.slice(0, Math.max(0, budget));
          budget -= v.length;
          const done = shown.length === v.length;
          return (
            <div key={k} className={`rounded-xl border bg-white px-3 py-2 transition ${shown ? (done ? "border-ok/40" : "border-gold") : "border-line opacity-50"}`}>
              <p className="flex items-center justify-between text-[10px] text-ink-soft">{k}{done && <span className="text-ok">✓</span>}</p>
              <p className="min-h-4 text-[12px] font-medium leading-snug">{shown}{shown && !done && <span className="ms-0.5 inline-block h-3 w-px animate-pulse bg-brand align-middle" />}</p>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] transition ${typed >= 1000 ? "bg-ok-soft text-ok" : "bg-mist text-ink-soft"}`}>
        <Icon name="shield" size={14} /> {typed >= 1000 ? t("كل الحقول صحيحة — جاهز للتقديم", "All fields valid — ready") : t("يتحقق النظام أثناء الكتابة…", "Validating as you type…")}
      </div>
    </div>
  );
}

function ReviewScreen({ t, lang, req, stage, by }: { t: (a: string, e: string) => string; lang: "ar" | "en"; req: { ref: string; r: Req; risk: { score: number; lane: string; flags: Flag[] } }; stage: 1 | 2; by: string }) {
  const tone = req.risk.lane === "strict" ? "var(--color-bad)" : req.risk.lane === "normal" ? "var(--color-wait)" : "var(--color-ok)";
  const lane = { fast: t("مسار سريع", "Fast lane"), normal: t("مسار عادي", "Normal"), strict: t("مراجعة مشددة", "Strict") }[req.risk.lane];
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="num font-display text-xl font-bold">{req.ref}</p>
          <p className="text-xs text-ink-soft">{req.r.org_name}</p>
        </div>
        <span className="rounded-full bg-wait-soft px-3 py-1 text-xs font-bold text-wait">{stage === 1 ? t("بانتظار المراجعة الأولية", "Awaiting initial review") : t("بانتظار الاعتماد النهائي", "Awaiting final approval")}</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {[t("التقديم", "Submitted"), t("المراجعة", "Review"), t("الاعتماد", "Approval"), t("الإصدار", "Issued")].map((s, i) => (
          <div key={s}><span className={`block h-1.5 rounded-full ${i < stage ? "bg-brand" : i === stage ? "bg-rose" : "bg-mist"}`} /><span className="mt-1 block text-[10px] text-ink-soft">{s}</span></div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_15rem]">
        <div className="space-y-2 text-xs">
          <div className="rounded-xl border border-line bg-white p-3"><p className="text-ink-soft">{t("الغرض", "Purpose")}</p><p className="mt-0.5 font-medium">{req.r.purpose}</p></div>
          <div className="grid grid-cols-3 gap-2">
            {[[t("أفراد", "People"), req.r.people.length], [t("مركبات", "Vehicles"), req.r.vehicles.length], [t("معدات", "Equip."), req.r.equipment.length]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-line bg-white p-2.5 text-center"><p className="num text-lg font-bold text-brand">{v}</p><p className="text-[10px] text-ink-soft">{k}</p></div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-white p-3">
            <p className="text-ink-soft">{t("موعد دخول المركبات", "Vehicle entry slot")}</p>
            <p className="num mt-0.5 font-medium">{req.r.slot_date} · {String(req.r.slot_hour).padStart(2, "0")}:00</p>
          </div>
          {stage === 2 && <p className="rounded-xl bg-ok-soft px-3 py-2 text-ok">✓ {t(`اعتمد ${by} المرحلة الأولى`, `${by} approved stage 1`)}</p>}
        </div>
        <div className="rounded-xl border border-line bg-white p-3">
          <div className="flex items-center gap-3">
            <CircularProgress value={req.risk.score} color={tone} size={64} stroke={6}>
              <span className="num text-lg font-bold">{req.risk.score}</span>
            </CircularProgress>
            <div><p className="text-[11px] text-ink-soft">{t("الفرز الذكي", "Smart triage")}</p><p className="text-sm font-bold" style={{ color: tone }}>{lane}</p></div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {req.risk.flags.map((f, i) => (
              <li key={f.code} className="al-item flex items-start justify-between gap-2 text-[11px]" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
                <span>{lang === "ar" ? f.ar : f.en}</span>
                <span className={`num shrink-0 font-bold ${f.points < 0 ? "text-ok" : "text-bad"}`}>{f.points > 0 ? `+${f.points}` : f.points}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PassScreen({ t, permit, org, rep, qr, compact }: { t: (a: string, e: string) => string; permit: { number: string; version: number }; org: string; rep: string; qr: { img: string; left: number } | null; compact?: boolean }) {
  return (
    <div className="flex h-full flex-col px-4 pb-4 text-ink">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-ink-soft">{t("بطاقة دخول رقمية", "Digital entry pass")}</span>
        <span className="rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold text-white">● {t("ساري", "Valid")}</span>
      </div>
      <p className="num mt-2 text-center font-display text-base font-bold text-brand">{permit.number}</p>
      <p className="text-center text-[10px] text-ink-soft">{org}</p>
      <div className="relative mx-auto mt-3 w-[82%] overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_8px_24px_-12px_rgba(61,42,36,.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr ? <img src={qr.img} alt={t("الرمز الحي", "Live code")} className="aspect-square w-full" /> : <div className="aspect-square w-full animate-pulse bg-mist" />}
        <span className="pointer-events-none absolute inset-0 animate-[scan_2.4s_linear_infinite] bg-gradient-to-b from-transparent via-rose-soft/30 to-transparent" />
      </div>
      <div className="mx-auto mt-2 flex items-center gap-2">
        <div className="h-1 w-20 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${((qr?.left ?? 30) / 30) * 100}%` }} /></div>
        <span className="num text-[11px] font-bold text-brand">{qr?.left ?? 30}s</span>
      </div>
      {!compact && (
        <div className="mt-auto space-y-1.5 rounded-xl bg-white/70 p-3 text-[10px]">
          <p className="flex justify-between"><span className="text-ink-soft">{t("الممثل", "Representative")}</span><b>{rep}</b></p>
          <p className="flex justify-between"><span className="text-ink-soft">{t("الإصدار", "Version")}</span><b className="num">{permit.version}</b></p>
        </div>
      )}
      <style>{`@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}`}</style>
    </div>
  );
}

function GateScreen({ t, lang, scan, matched, setMatched, allowed, otpOk }: {
  t: (a: string, e: string) => string; lang: "ar" | "en";
  scan: { result: Scan; gate: { name_ar: string; name_en: string }; verifier: { name: string; agency: string } } | null;
  matched: { people: Set<number>; vehicles: Set<number> }; setMatched: (m: { people: Set<number>; vehicles: Set<number> }) => void; allowed: boolean; otpOk: boolean;
}) {
  if (!scan)
    return (
      <div className="grid min-h-[22rem] place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[.03] p-8 text-center text-cream/60">
        <div><Icon name="scan" size={44} className="mx-auto text-gold-soft" /><p className="mt-3 text-sm">{t("بانتظار المسح…", "Waiting for a scan…")}</p></div>
      </div>
    );
  const r = scan.result;
  const toggle = (k: "people" | "vehicles", i: number) => {
    if (allowed) return;
    const s = new Set(matched[k]);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setMatched({ ...matched, [k]: s });
    navigator.vibrate?.(8);
  };
  return (
    <div className="beam overflow-hidden rounded-3xl bg-white text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,.7)]" style={{ ["--beam" as string]: allowed ? "#5fd39a" : "#e9cfa6" }}>
      <div className={`px-5 py-4 text-center text-white ${allowed ? "bg-ok" : r.status === "valid" ? "bg-ok" : "bg-bad"}`}>
        <p className="font-display text-3xl font-bold">{allowed ? t("تم السماح بالدخول", "ENTRY ALLOWED") : t("ساري", "VALID")}</p>
        <p className="num mt-0.5 text-xs opacity-90">{r.number} · v{r.version} · {t("رمز متغير حي", "live rotating code")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[11px] text-ink-soft">
        <Icon name="target" size={14} className="text-ok" /> {lang === "ar" ? scan.gate.name_ar : scan.gate.name_en} · {t("ضمن النطاق", "in scope")}
        <span className="ms-auto">{scan.verifier.name}</span>
      </div>
      <div className="max-h-64 overflow-y-auto p-4">
        <p className="mb-2 flex justify-between text-xs font-semibold">{t("الأفراد — أشّر على الموجودين", "People — tick those present")}<span className="num text-ink-soft">{matched.people.size}/{r.people?.length}</span></p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {r.people?.map((p, i) => {
            const on = matched.people.has(i);
            return (
              <button key={i} onClick={() => toggle("people", i)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start text-xs transition active:scale-[.98] ${on ? "border-ok bg-ok-soft" : "border-line hover:border-gold"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px] ${on ? "border-ok bg-ok text-white" : "border-line"}`}>{on ? "✓" : ""}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="num text-[10px] text-ink-soft">{p.id}</span>
              </button>
            );
          })}
        </div>
        <p className="mb-2 mt-3 text-xs font-semibold">{t("المركبات", "Vehicles")}</p>
        <div className="flex flex-wrap gap-1.5">
          {r.vehicles?.map((v, i) => {
            const on = matched.vehicles.has(i);
            return (
              <button key={i} onClick={() => toggle("vehicles", i)} className={`num min-h-10 rounded-xl border px-3 text-xs transition ${on ? "border-ok bg-ok-soft" : "border-line hover:border-gold"}`}>{on ? "✓ " : ""}{v.plate}</button>
            );
          })}
        </div>
        {otpOk && <p className="mt-3 rounded-xl bg-ok-soft px-3 py-2 text-xs font-semibold text-ok">✓ {t("رمز الممثل صحيح", "Representative code verified")}</p>}
      </div>
    </div>
  );
}

function FraudStage({ t, fraud, busy }: { t: (a: string, e: string) => string; fraud: { stale: Scan; fake: Scan } | null; busy: boolean }) {
  const cards = [
    { icon: "phone" as IconName, title: t("صورة شاشة قديمة", "An old screenshot"), sub: t("رمز من قبل 5 دقائق", "A code from 5 minutes ago"), res: fraud?.stale, msg: t("رمز منتهي — صورة شاشة أو نسخة قديمة", "Stale code — screenshot or old copy") },
    { icon: "globe" as IconName, title: t("رمز QR مزيف", "A fake QR"), sub: t("يقود إلى موقع مشابه", "Leads to a look-alike site"), res: fraud?.fake, msg: t("غير موجود — لا يطابق أي تصريح", "Not found — matches no permit") },
  ];
  return (
    <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <div key={c.title} className={`overflow-hidden rounded-3xl border transition ${c.res ? "border-bad/40 bg-white text-ink" : "border-white/10 bg-white/[.04] text-cream"}`} style={{ transitionDelay: `${i * 0.2}s` }}>
          <div className="flex items-center gap-3 p-4">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${c.res ? "bg-bad-soft text-bad" : "bg-white/10 text-gold-soft"}`}><Icon name={c.icon} size={22} /></span>
            <div><p className="font-semibold">{c.title}</p><p className={`text-xs ${c.res ? "text-ink-soft" : "text-cream/55"}`}>{c.sub}</p></div>
          </div>
          {c.res ? (
            <div className="al-item bg-bad px-4 py-5 text-center text-white" style={{ animationDelay: `${i * 0.25}s` }}>
              <p className="font-display text-2xl font-bold">{t("مرفوض", "REJECTED")}</p>
              <p className="mt-1 text-xs">{c.msg}</p>
            </div>
          ) : (
            <div className="grid h-24 place-items-center border-t border-white/10 text-xs text-cream/50">{busy ? t("جارٍ المحاولة…", "Trying…") : t("بانتظار المحاولة", "Not tried yet")}</div>
          )}
        </div>
      ))}
      {fraud && <p className="sm:col-span-2 text-center text-xs text-cream/60">{t("سُجّلت المحاولتان في السجل وستظهران في غرفة العمليات كمحاولات مشبوهة.", "Both attempts were logged and appear in the ops room as suspicious.")}</p>}
    </div>
  );
}

function FinaleStage({ t, summary, elapsed }: { t: (a: string, e: string) => string; summary: Summary; elapsed: string }) {
  const ACT: Record<string, [string, string]> = {
    "request.submitted": ["تقديم الطلب", "Request submitted"],
    "request.stage1_approved": ["الاعتماد الأولي", "Stage 1 approved"],
    "permit.issued": ["إصدار التصريح", "Permit issued"],
    "permit.document_viewed": ["عرض التصريح", "Permit viewed"],
    "verify.lookup": ["مسح عند البوابة", "Gate scan"],
    "verify.rep_otp_sent": ["إرسال رمز الممثل", "Rep code sent"],
    "verify.rep_otp": ["التحقق من الممثل", "Rep verified"],
    "verify.allowed": ["السماح بالدخول", "Entry allowed"],
  };
  return (
    <div className="w-full max-w-xl">
      <div className="beam relative overflow-hidden rounded-[2rem] border border-gold/40 bg-gradient-to-b from-[#fffaf5] to-[#f6ece4] p-6 text-ink shadow-[0_40px_90px_-30px_rgba(0,0,0,.8)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-gold">{t("شهادة إتمام التجربة", "Experience certificate")}</p>
            <p className="mt-1 font-display text-2xl font-bold text-brand">{t("رحلة تصريح موثّقة", "A verified permit journey")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${summary.chain.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>{summary.chain.ok ? t("السلسلة سليمة ✓", "Chain intact ✓") : t("انكسار!", "Broken!")}</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[[elapsed, t("مدة الرحلة", "Duration")], [String(summary.trail.length), t("عملية موقّعة", "Signed actions")], [String(summary.today.allowed), t("دخول مسموح اليوم", "Entries today")]].map(([v, k]) => (
            <div key={k} className="rounded-2xl border border-line bg-white p-3"><p className="num font-display text-2xl font-bold text-brand">{v}</p><p className="text-[10px] text-ink-soft">{k}</p></div>
          ))}
        </div>
        <p className="mt-5 text-xs font-semibold">{t("بصمات عملياتك في سجل لا يقبل التلاعب", "Your actions' fingerprints in the tamper-evident log")}</p>
        <ol className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pe-1">
          {summary.trail.map((a, i) => (
            <li key={a.id} className="al-item flex items-center gap-2 text-[11px]" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[9px] font-bold text-white num">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{t(...(ACT[a.action] ?? [a.action, a.action]))}</span>
              <code className="num rounded bg-mist px-1.5 py-0.5 text-[10px] text-ink-soft">{a.hash.slice(0, 12)}…</code>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-center text-[11px] text-ink-soft">{t("كل بصمة تتضمن بصمة العملية السابقة — أي تعديل يكسر السلسلة فورًا.", "Each fingerprint includes the previous one — any edit breaks the chain.")}</p>
      </div>
    </div>
  );
}
