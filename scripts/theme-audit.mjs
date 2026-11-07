#!/usr/bin/env node
// Theme audit: finds every page in src/app by itself (new pages included), opens each one in light
// and dark, on a phone, a tablet and a desktop, and measures the contrast of every piece of text against the
// background it actually renders on. Fails if any text is below WCAG AA.
//
//   npm run audit:theme                       # against http://localhost:3000
//   BASE=https://… npm run audit:theme        # against another server (needs the sandbox enabled)
//   SHOTS=out/theme npm run audit:theme       # also save a screenshot of every page
//
// Needs Chrome (or set CHROME=/path/to/chrome) and the devDependency puppeteer-core.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.env.SHOTS;
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => fs.existsSync(p));

// sample values for dynamic segments; a page whose segment has no sample is listed as skipped
const SAMPLES = { "[id]": "1" };
// which sandbox role opens which area (first match wins); anything else is opened signed-out
const ROLE_FOR = [
  [/^\/apply\/login/, null], [/^\/staff\/login/, null],
  [/^\/apply/, "applicant"],
  [/^\/staff\/ops/, "supervisor"],
  [/^\/staff\/(r|permits)/, "reviewer"],
  [/^\/verify/, "verifier"],
  [/^\/staff/, "admin"],
];
const SKIP = [/^\/dev\//, /^\/staff\/ops\/screen/]; // dev-only tools; the TV wall streams forever

function routes() {
  const out = [], skipped = [];
  (function walk(d, url) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) { if (e.name === "page.tsx") out.push(url || "/"); continue; }
      if (e.name === "api" || e.name.startsWith("_") || e.name.startsWith("@")) continue;
      const seg = /^\(.*\)$/.test(e.name) ? "" : "/" + e.name; // route groups add nothing to the URL
      walk(path.join(d, e.name), url + seg);
    }
  })(path.join(ROOT, "src/app"), "");
  const final = [];
  for (const r of out.sort()) {
    if (SKIP.some((re) => re.test(r))) { skipped.push(r + " (excluded)"); continue; }
    const filled = r.replace(/\[[^\]]+\]/g, (s) => SAMPLES[s] ?? "\0");
    if (filled.includes("\0")) skipped.push(r + " (no sample value)"); else final.push(filled);
  }
  return { list: final, skipped };
}

// runs inside the page: every visible text element vs the colour actually painted behind it
function measure() {
  // any CSS colour (rgb, oklab, color-mix, color(srgb …)) → rgba, by letting the browser paint it
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const parse = (c) => {
    if (!c || c === "transparent") return null;
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data;
    const v = { r, g, b, a: a / 255 };
    cache.set(c, v); return v;
  };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none" && e !== document.body) return null; // gradient or artwork: the pixel is unknown
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (bg.a < 1) bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const fails = [];
  let checked = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
    if (el.closest("[aria-hidden=true], svg, .sr-only, [disabled], :disabled, [inert]")) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    if (o < 0.5) continue; // chrome that has stepped aside, or a fade in progress
    const fg = parse(cs.color); if (!fg || fg.a === 0) continue; // gradient-clipped text
    const bg = bgOf(el); if (!bg) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    checked++;
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const v = ratio(over({ ...fg, a: fg.a * o }, bg), bg);
    if (v < need) fails.push({ text: el.textContent.trim().slice(0, 40), ratio: Math.round(v * 100) / 100, need, fg: cs.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, cls: String(el.className).slice(0, 90) });
  }
  const de = document.documentElement;
  return { checked, fails, theme: de.dataset.theme, hscroll: de.scrollWidth - de.clientWidth };
}

const { list, skipped } = routes();
if (!CHROME) { console.error("Chrome not found: set CHROME=/path/to/chrome"); process.exit(2); }
const { default: puppeteer } = await import("puppeteer-core");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
const VIEWPORTS = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  tablet: { width: 820, height: 1180, hasTouch: true, deviceScaleFactor: 1 },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
};
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
console.log(`Theme audit on ${BASE}: ${list.length} pages × 2 themes × 3 screens` + (skipped.length ? `\n  skipped: ${skipped.join(", ")}` : ""));

let bad = 0, total = 0;
for (const theme of ["light", "dark"]) for (const [vk, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(vp);
  await page.setCookie({ name: "theme", value: theme, url: BASE });
  let role;
  for (const r of list) {
    const want = (ROLE_FOR.find(([re]) => re.test(r)) || [null, null])[1];
    if (want && want !== role) {
      await page.goto(BASE + "/sandbox", { waitUntil: "networkidle0" });
      await page.evaluate(async (role) => {
        await fetch("/api/sandbox/as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      }, want);
      role = want;
    }
    const errors = [];
    const onErr = (e) => errors.push(e.message);
    page.on("pageerror", onErr);
    try { await page.goto(BASE + r, { waitUntil: "networkidle0", timeout: 30000 }); }
    catch { console.log(`  ✗ ${theme} ${vk} ${r}: did not load`); bad++; page.off("pageerror", onErr); continue; }
    await new Promise((res) => setTimeout(res, 900));
    await page.evaluate(() => document.querySelectorAll(".bf").forEach((e) => e.classList.add("bf-in"))); // finish entrance fades
    await new Promise((res) => setTimeout(res, 800));
    const m = await page.evaluate(measure);
    page.off("pageerror", onErr);
    total++;
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${theme}-${vk}-${r.replace(/\W+/g, "_") || "home"}.png`), fullPage: vk === "desktop" });
    const problems = [];
    if (m.theme !== theme) problems.push(`theme is "${m.theme}"`);
    if (m.hscroll > 2) problems.push(`scrolls sideways by ${m.hscroll}px`);
    for (const f of m.fails.slice(0, 8)) problems.push(`"${f.text}" ${f.ratio}:1 (needs ${f.need}) ${f.fg} on ${f.bg}  .${f.cls}`);
    if (m.fails.length > 8) problems.push(`…and ${m.fails.length - 8} more`);
    for (const e of errors) problems.push(`page error: ${e.slice(0, 140)}`);
    if (problems.length) { bad++; console.log(`  ✗ ${theme} ${vk} ${r}  (${m.checked} texts)\n      ` + problems.join("\n      ")); }
    else console.log(`  ✓ ${theme} ${vk} ${r}  (${m.checked} texts)`);
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n✗ ${bad} of ${total} page views have problems.` : `\n✓ All ${total} page views pass (contrast AA, theme applied, no sideways scroll).`);
process.exit(bad ? 1 : 0);
