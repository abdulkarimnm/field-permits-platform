/* Field Permits — service worker
 * - App shell & static assets: cache-first
 * - Pages: network-first; the verification portal and the representative's pass are kept
 *   for offline use (gates and phones without signal). Other pages fall back to /offline.
 * - APIs are never cached.
 */
const VERSION = "vp-v1";
const SHELL = ["/offline", "/brand/logo.png", "/brand/mark.svg", "/icons/icon-192.png", "/manifest.webmanifest"];
const OFFLINE_PAGES = [/^\/verify(\/|$)/, /^\/pass\//, /^\/offline$/];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/dev/")) return;

  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/");
  if (isStatic) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    const keep = OFFLINE_PAGES.some((r) => r.test(url.pathname));
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (keep && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (keep && (await caches.match(url.pathname))) || (await caches.match("/offline"))),
    );
  }
});

// Purge cached personal pages on sign-out (shared devices).
self.addEventListener("message", (e) => {
  if (e.data === "purge") {
    e.waitUntil(
      caches.open(VERSION).then((c) => c.keys().then((ks) => Promise.all(ks.filter((k) => OFFLINE_PAGES.some((r) => r.test(new URL(k.url).pathname)) && !k.url.endsWith("/offline")).map((k) => c.delete(k))))),
    );
  }
});
