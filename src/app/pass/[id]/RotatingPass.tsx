"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import Link from "next/link";

const WINDOW = 30;

async function code(secret: string, number: string, w: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${number}:${w}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

export default function RotatingPass(props: {
  lang: "ar" | "en";
  number: string;
  secret: string;
  status: string;
  statusLabel: string;
  org: string;
  rep: string;
  from: string;
  to: string;
  zones: string[];
  counts: { people: number; vehicles: number; equipment: number };
  version: number;
}) {
  const t = (ar: string, en: string) => (props.lang === "ar" ? ar : en);
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(WINDOW);
  const [now, setNow] = useState<Date | null>(null);
  const active = props.status === "valid" || props.status === "not_started";

  useEffect(() => {
    let last = -1;
    let stop = false;
    const tick = async () => {
      const s = Date.now() / 1000;
      const w = Math.floor(s / WINDOW);
      setLeft(Math.ceil(WINDOW - (s % WINDOW)));
      setNow(new Date());
      if (w !== last && active) {
        last = w;
        const c = await code(props.secret, props.number, w);
        if (!stop) setQr(await QRCode.toDataURL(`SSH1:R:${props.number}:${w}:${c}`, { margin: 1, width: 520, errorCorrectionLevel: "M", color: { dark: "#3d2a24", light: "#ffffff" } }));
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [props.secret, props.number, active]);

  const fmt = (d: string) =>
    new Intl.DateTimeFormat(props.lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));
  const tone = props.status === "valid" ? "bg-ok" : props.status === "not_started" ? "bg-wait" : props.status === "suspended" ? "bg-hold" : "bg-bad";

  return (
    <div className="noir relative min-h-dvh overflow-hidden px-4 py-5 text-white">
      <div className="relative z-10 mx-auto max-w-sm">
        <div className="flex items-center justify-between">
          <Link href="/apply" className="text-sm text-cream/80">← {t("طلباتي", "My requests")}</Link>
          <span className="text-xs text-cream/70">{t("بطاقة دخول رقمية", "Digital entry pass")}</span>
        </div>

        <div className="beam mt-4 overflow-hidden rounded-3xl bg-white text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
          <div className="flex items-center justify-between gap-3 bg-cream px-5 py-3">
            <Image src="/brand/logo.png" alt="" width={120} height={28} className="h-7 w-auto" />
            <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${tone}`}>{props.statusLabel}</span>
          </div>

          <div className="px-5 pt-5 text-center">
            <p className="num text-lg font-bold text-brand">{props.number}</p>
            <p className="text-xs text-ink-soft">{props.org}</p>
          </div>

          <div className="relative mx-auto mt-4 aspect-square w-64">
            {active && qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={t("رمز الدخول المتغير", "Rotating entry code")} className="h-full w-full" />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-2xl bg-mist text-center text-sm text-ink-soft">
                {active ? t("جارٍ توليد الرمز…", "Generating…") : t("لا يمكن استخدام هذا التصريح حاليًا", "This permit can't be used now")}
              </div>
            )}
            {/* Live motion strip: a screenshot freezes it, a live screen keeps moving */}
            {active && <span className="pointer-events-none absolute inset-x-0 top-0 h-full animate-[scan_2.4s_linear_infinite] bg-gradient-to-b from-transparent via-rose-soft/25 to-transparent" />}
          </div>

          {active && (
            <div className="mt-3 flex items-center justify-center gap-3 px-5">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-mist">
                <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${(left / WINDOW) * 100}%` }} />
              </div>
              <span className="num w-8 text-sm font-semibold text-brand">{left}s</span>
            </div>
          )}
          <p className="num mt-2 text-center text-xs text-ink-soft">
            {now ? now.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" }) : ""}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line px-5 py-4 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-ink-soft">{t("الممثل", "Representative")}</dt>
              <dd className="font-medium">{props.rep}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t("من", "From")}</dt>
              <dd className="font-medium">{fmt(props.from)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t("إلى", "To")}</dt>
              <dd className="font-medium">{fmt(props.to)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-ink-soft">{t("المناطق", "Zones")}</dt>
              <dd className="font-medium">{props.zones.join("، ")}</dd>
            </div>
            <div className="col-span-2 flex gap-4 text-xs text-ink-soft">
              <span><b className="num text-ink">{props.counts.people}</b> {t("فرد", "people")}</span>
              <span><b className="num text-ink">{props.counts.vehicles}</b> {t("مركبة", "vehicles")}</span>
              <span><b className="num text-ink">{props.counts.equipment}</b> {t("معدة", "equipment")}</span>
              <span className="ms-auto">v<b className="num text-ink">{props.version}</b></span>
            </div>
          </dl>
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-cream/80">
          {t(
            "يتغير الرمز كل 30 ثانية ويعمل دون إنترنت بعد فتح الصفحة. صورة الشاشة لا تُقبل عند البوابة.",
            "The code changes every 30 seconds and works offline once opened. Screenshots are rejected at the gate.",
          )}
        </p>
      </div>
      <style>{`@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}`}</style>
    </div>
  );
}
