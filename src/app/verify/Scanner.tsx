"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/** In-portal camera scanner. It only reads text — it never opens the URL inside the code. */
export default function Scanner({ onResult, t }: { onResult: (text: string) => void; t: (a: string, e: string) => string }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const loop = () => {
          const v = video.current;
          const c = canvas.current;
          if (!v || !c || done.current) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              done.current = true;
              navigator.vibrate?.(60);
              onResult(code.data);
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        setErr(t("تعذر تشغيل الكاميرا. اسمح بالوصول أو أدخل الرمز يدويًا.", "Camera unavailable. Allow access or enter the code manually."));
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onResult, t]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-ink">
      <video ref={video} className="aspect-[4/3] w-full object-cover" playsInline muted />
      <canvas ref={canvas} className="hidden" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-3/5 w-3/5 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {err && <p className="absolute inset-x-0 bottom-0 bg-bad px-3 py-2 text-center text-sm text-white">{err}</p>}
    </div>
  );
}
