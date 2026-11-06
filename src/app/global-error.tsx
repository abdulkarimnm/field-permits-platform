"use client";
import { useEffect } from "react";

/* Last-resort boundary (root layout failed). Kept dependency-free on purpose. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error.digest) return;
    try {
      navigator.sendBeacon?.("/api/errors", new Blob([JSON.stringify({ message: error.message, stack: error.stack, kind: "render", path: location.pathname })], { type: "application/json" }));
    } catch {}
  }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#faf7f4", color: "#3d2a24", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <h1 style={{ color: "#763b30" }}>تعذر تحميل المنصة</h1>
          <p>سُجّل الخلل تلقائيًا. رمز المرجع: <b dir="ltr">{error.digest ?? "CLIENT"}</b></p>
          <button onClick={reset} style={{ background: "#763b30", color: "#fff", border: 0, borderRadius: 12, padding: "12px 20px", cursor: "pointer" }}>إعادة المحاولة</button>
        </div>
      </body>
    </html>
  );
}
