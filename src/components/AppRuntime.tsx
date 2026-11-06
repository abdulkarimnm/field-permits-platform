"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icons";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/** Makes the web platform behave like an installed app. */
export default function AppRuntime({ lang }: { lang: "ar" | "en" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [bip, setBip] = useState<BIP | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [splash, setSplash] = useState(false);

  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    document.documentElement.classList.toggle("standalone", standalone);

    // Service worker (production builds only, so dev hot-reload is never cached)
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});

    // Clear cached personal pages when signing out
    const onSubmit = (e: Event) => {
      if ((e.target as HTMLElement).closest?.("[data-logout]")) navigator.serviceWorker?.controller?.postMessage("purge");
    };
    document.addEventListener("submit", onSubmit, true);

    // Launch screen once per app session in standalone mode
    if (standalone && !sessionStorage.getItem("vp_splash")) {
      sessionStorage.setItem("vp_splash", "1");
      setSplash(true);
      setTimeout(() => setSplash(false), 1500);
    }

    // Install prompt
    const dismissed = Number(get("vp_install_dismissed") ?? 0) > Date.now() - 7 * 86400_000;
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIP);
      if (!dismissed && !standalone) setTimeout(() => setShow(true), 2500);
    };
    addEventListener("beforeinstallprompt", onBip);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos && !standalone && !dismissed && innerWidth < 768) {
      setIos(true);
      setTimeout(() => setShow(true), 3000);
    }
    return () => {
      removeEventListener("beforeinstallprompt", onBip);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  const dismiss = () => {
    set("vp_install_dismissed", String(Date.now()));
    setShow(false);
  };

  return (
    <>
      {splash && (
        <div className="splash noir fixed inset-0 z-[100] grid place-items-center" aria-hidden>
          <div className="text-center">
            <svg viewBox="0 0 96 64" className="splash-arches mx-auto h-20 w-28" fill="none" stroke="#e9cfa6" strokeWidth="2.2">
              <path d="M4 64V22a14 14 0 0 1 28 0v42M34 64V22a14 14 0 0 1 28 0v42M64 64V22a14 14 0 0 1 28 0v42" />
            </svg>
            <p className="mt-5 font-display text-xl font-bold text-white">{t("تصاريح الميدان", "Field Permits")}</p>
            <p className="mt-1 text-xs text-gold">{t("ميدان سيد الشهداء", "Sayyid Alshuhada Field")}</p>
          </div>
        </div>
      )}

      {show && (bip || ios) && (
        <div className="no-print fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[70] md:inset-x-auto md:bottom-6 md:end-6 md:w-96">
          <div className="rise noir beam overflow-hidden rounded-3xl border border-gold/30 p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="h-14 w-14 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{t("ثبّت تطبيق تصاريح الميدان", "Install Field Permits")}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-cream/65">
                  {ios
                    ? t("اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».", "Tap Share, then “Add to Home Screen”.")
                    : t("وصول بلمسة، ملء الشاشة، ويعمل دون اتصال عند البوابة.", "One tap away, full screen, works offline at the gate.")}
                </p>
              </div>
              <button onClick={dismiss} aria-label={t("إغلاق", "Close")} className="-m-1 grid h-9 w-9 place-items-center rounded-full text-cream/60 active:bg-white/10">✕</button>
            </div>
            {ios ? (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-2.5 text-xs text-cream/80">
                <Icon name="share" size={18} className="text-gold-soft" /> {t("مشاركة", "Share")} <span className="text-cream/40">←</span> {t("إضافة إلى الشاشة الرئيسية", "Add to Home Screen")}
              </div>
            ) : (
              <button
                onClick={async () => {
                  await bip!.prompt();
                  await bip!.userChoice;
                  setBip(null);
                  setShow(false);
                }}
                className="mt-3 min-h-12 w-full rounded-2xl bg-gradient-to-b from-gold-soft to-gold text-sm font-bold text-noir active:scale-[.98]"
              >
                {t("تثبيت التطبيق", "Install app")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
