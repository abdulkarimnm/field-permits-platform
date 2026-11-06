"use client";
import { useEffect } from "react";

/** Sends uncaught browser errors to the technical error log (deduplicated per page load). */
export function reportClientError(e: { message: string; stack?: string | null; digest?: string | null; kind?: "client" | "render" }) {
  try {
    const body = JSON.stringify({ ...e, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/errors", new Blob([body], { type: "application/json" }));
    else fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const send = (message: string, stack?: string) => {
      const k = message + (stack ?? "").slice(0, 120);
      if (seen.has(k) || seen.size > 10) return;
      seen.add(k);
      reportClientError({ message, stack });
    };
    const onErr = (ev: ErrorEvent) => {
      // ignore noise from browser extensions and cross-origin scripts
      if (!ev.message || ev.message === "Script error." || /extension:\/\//.test(ev.filename ?? "")) return;
      send(ev.message, ev.error?.stack);
    };
    const onRej = (ev: PromiseRejectionEvent) => {
      const r = ev.reason as { message?: string; stack?: string } | string;
      send(typeof r === "string" ? r : r?.message ?? "Unhandled promise rejection", typeof r === "string" ? undefined : r?.stack);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}
