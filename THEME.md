# Theme: light and dark mode

Every page supports light and dark mode without any per-page dark code. The tokens in
`src/app/globals.css` decide every colour. Dark mode repoints those tokens, so a new page that uses
them gets dark mode automatically.

## How the theme is chosen

The user picks نهاري (light), ليلي (dark), or تلقائي (follow the device). The sun/moon button in
the masthead switches between light and dark. The "More" sheet on mobile has all three choices.

The choice is kept in the `theme` cookie:

- **Rendering:** the server sets `<html data-theme>`, so the page has no flash of the wrong theme.
- **Before the page paints:** an inline script in `layout.tsx` resolves "auto" and follows the
  device if it changes.
- **Switching:** the new theme spreads out as a circle from the button that was tapped (View
  Transitions). Browsers without View Transitions, and users who prefer reduced motion, get an
  instant switch.

## Tokens to use (Tailwind classes)

| Role | Class | Light | Dark |
| --- | --- | --- | --- |
| Page background | `bg-paper` (body only) | warm white | cocoa `#1b1310` with a faint maroon dawn |
| Card / main surface | `bg-surface` (the `Card` component) | white | `#261d1a` |
| Tinted panel inside a card | `bg-panel` | `#faf7f4` | `#2d2320` |
| A layer above a card (hover rows, popovers, sheets) | `bg-raised` | `#fdf8f4` | `#312622` |
| Inputs, selects, textareas | `bg-field border-line-strong` (use `input` from `ui.tsx`) | white | `#1f1715`, border `#786863` |
| Chips, subtle fills | `bg-chip`, `bg-mist` | cream | warm greys |
| Dividers, card borders | `border-line` | `#eadfd8` | `#423633` |
| Main text | `text-ink` | `#3d2a24` | `#f5ede7` |
| Secondary text | `text-ink-soft` | `#6e5a53` | `#c6b7ae` |
| Brand text and links | `text-brand` | maroon | lifted to rose `#eeb3a4` |
| Primary button | `btn.primary` from `ui.tsx` (`bg-brand`) | maroon | maroon one step lighter |
| Status badge | `bg-ok-soft text-ok` and the other status pairs (`Badge`) | | |
| Information | `text-info`, `bg-info-soft` | blue | light blue |
| Solid fills with white text (same in both themes) | `bg-ok`, `bg-bad`, `bg-info-solid`, `bg-ok-bright`, `bg-excel` | | |
| Card shadow | `shadow-card`, `shadow-raised` | soft warm | deep, with a top highlight |
| Focus ring | `ring-focus`, `border-focus` | maroon | gold |
| Always dark (brand art, camera, code) | `bg-noir`, `.noir` | | |

The status pairs are:

- `ok`: approved
- `wait`: waiting
- `hold`: returned or suspended
- `bad`: rejected
- `off`: withdrawn or expired

Every dark pair was measured against WCAG 2.x AA:

| Pair | Contrast |
| --- | --- |
| ink on paper | 15.8:1 |
| ink on surface | 14.3:1 |
| ink-soft on surface | 8.5:1 |
| brand text on surface | 9.2:1 |
| status text on its soft fill | at least 6.4:1 |
| white on brand | 7.2:1 |
| input border on field | 3.3:1 (the minimum for a control boundary is 3:1) |

## Do not

- **`bg-white`, `bg-black`, `text-black`, or the grey palettes** (`gray-*`, `stone-*`, and so on).
  They do not change with the theme.
- **Raw hex classes** such as `bg-[#…]` or `text-[#…]`, or inline `style={{ color: "#…" }}`. If a
  role has no token, add one to `@theme` and to the dark block in `globals.css`.
- **`bg-ink` as a fill.** It flips to a light colour in dark mode. Use `bg-brand` for a button and
  `bg-noir` for an always-dark area.
- **`bg-paper` inside a card.** Use `bg-panel`.

## Always-light or always-dark by design

Some screens keep one look in both themes:

- **`.force-light`:** printed documents, the permit, Saudi number plates, and the pass card. They
  stay light in both themes.
- **`.keep-white`:** opts one element out of the dark safety net, such as a QR code.
- **`.noir`, `.cc`, `.band`, `.glass-card`:** brand areas that are always dark.

## The two automatic checks

1. **`npm run check:theme`.** It runs automatically before every `npm run build`, so it also runs on
   every deploy.
   - **What it does:** scans every `.tsx` file and fails the build if a colour bypasses the tokens.
     It prints the file, the line, and the fix.
   - **When a colour is fixed on purpose:** write `theme-ok: <reason>` in a comment on that line or
     the line above.
   - **Files that are fixed by design:** these are listed in `FIXED` at the top of
     `scripts/check-theme.mjs`, each with its reason.
2. **`npm run audit:theme`.**
   - **What it covers:** it finds every page under `src/app` by itself, including pages added
     later. It signs in with the right sandbox role and opens each page in light and dark, on a
     phone, a tablet and a desktop.
   - **What it checks:** the contrast of every piece of text against the background actually
     painted behind it, that the theme was applied, and that nothing scrolls sideways.
   - **How to run it:** `BASE=http://localhost:3000 npm run audit:theme`. Add `SHOTS=out/theme` to
     save a screenshot of every page.
   - **New dynamic segments:** a new dynamic segment such as `[slug]` needs a sample value in
     `SAMPLES` in the script. Until it has one, the audit lists that page as skipped.

## A safety net

If an untokenised colour still reaches the browser in dark mode, `globals.css` maps it to the
nearest token:

| Untokenised colour | Mapped to |
| --- | --- |
| `bg-white` and the light greys | `surface` |
| `text-black` and the dark greys | `ink` |
| mid greys | `ink-soft` |
| grey borders | `line` |

The net catches mistakes only. New code still uses the tokens.
