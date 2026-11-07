#!/usr/bin/env node
// Theme guard: every page must take its colours from the semantic tokens in src/app/globals.css,
// so light and dark mode work everywhere, including pages added later. Runs before every build.
// See THEME.md for the token list and how to opt out on purpose.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SRC = path.join(ROOT, "src");

// Files whose look is fixed by design (always-dark brand screens, always-light documents).
// A new file is NOT here, so it is checked. Add a file only with a reason.
const FIXED = {
  "app/page.tsx": "home hero, always maroon (noir)",
  "app/offline/page.tsx": "noir",
  "app/start/page.tsx": "noir",
  "app/sandbox/SandboxHub.tsx": "noir",
  "app/global-error.tsx": "standalone document with its own <html>",
  "app/pass/": "the pass in hand: noir + force-light card",
  "app/permit/": "printed permit: force-light",
  "app/staff/reports/print/": "printed report: force-light",
  "app/demo/": "demo film: force-light / noir",
  "app/staff/ops/": "command centre + wall screen: always dark",
  "app/apply/login/": "auth: noir + glass-card",
  "app/staff/login/": "auth: noir + glass-card",
  "components/AuthLayout.tsx": "noir + glass-card",
  "components/DemoAccounts.tsx": "glass-card",
  "components/SandboxDock.tsx": "dark floating dock",
  "components/AppRuntime.tsx": "splash + install sheet (noir)",
  "components/TabBar.tsx": "mobile tab bar + sheet (noir)",
  "components/Shell.tsx": "band nav (maroon)",
  "components/SaudiPlate.tsx": "number plate: force-light",
  "components/magic.tsx": "decorative effects on noir / force-light",
  "components/fx.tsx": "decorative effects on noir",
  "components/lux.tsx": "decorative effects on noir",
  "components/ThemeSwitch.tsx": "sheet variant lives in the noir sheet",
  "lib/appIcon.tsx": "generated image",
  "app/layout.tsx": "browser theme-color meta values",
};

const RULES = [
  [/(?<![\w-])(bg|from|to|via)-white(?![\w/-])/, "solid white: use bg-surface / bg-field / bg-raised (or keep-white for QR codes)"],
  [/(?<![\w-])(text|bg|border)-black(?![\w-])/, "black: use text-ink, or bg-noir for always-dark media"],
  [/(?<![\w-])(bg|text|border|from|to|via|ring|divide|fill|stroke)-(gray|stone|neutral|slate|zinc)-\d{2,3}/, "Tailwind grey palette: use ink / ink-soft / line / mist"],
  [/(?<![\w-])(bg|text|border|from|to|via|ring|divide|outline|fill|stroke|shadow)-\[#[0-9a-fA-F]{3,8}\]/, "raw hex colour: add or use a token (see THEME.md)"],
  [/(?<![\w-])bg-ink(?![\w-])/, "bg-ink flips to a light colour in dark: use bg-brand (button) or bg-noir (always dark)"],
  [/(?<![\w-])bg-paper(?![\w/-])/, "bg-paper is the page itself: use bg-panel for a tinted panel inside a card"],
  [/(?:color|background(?:Color)?)\s*:\s*["'`]#[0-9a-fA-F]{3,8}/, "inline hex colour: use a CSS variable, e.g. var(--color-ink)"],
];

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|jsx)$/.test(e.name)) files.push(p);
  }
})(SRC);

const problems = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  if (Object.keys(FIXED).some((k) => (k.endsWith("/") ? rel.startsWith(k) : rel === k))) continue;
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/theme-ok/.test(line) || /theme-ok/.test(lines[i - 1] || "")) return;
    for (const [re, why] of RULES) {
      const m = line.match(re);
      if (m) problems.push(`  src/${rel}:${i + 1}  "${m[0]}"  →  ${why}`);
    }
  });
}

if (problems.length) {
  console.error(`\n✗ Theme check: ${problems.length} colour(s) bypass the theme tokens (they would break dark or light mode):\n`);
  console.error(problems.join("\n"));
  console.error(`\nFix: use the semantic tokens listed in THEME.md. If a colour is fixed on purpose (a solid brand fill,`);
  console.error(`a QR code), put  {/* theme-ok: <reason> */}  on the line above, or // theme-ok at the end of the line.\n`);
  process.exit(1);
}
console.log(`✓ Theme check: ${files.length} files, all colours go through the theme tokens.`);
