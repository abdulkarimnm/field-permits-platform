# Notes for AI assistants working on this repo

- **Colours / light & dark mode:** read `THEME.md` before adding or styling any page or component. Use only the semantic token classes (`bg-surface`, `bg-panel`, `bg-field`, `text-ink`, `text-ink-soft`, `border-line`, `btn.primary`, `Badge` …) — never `bg-white`, raw hex, or grey palettes. `npm run build` runs `scripts/check-theme.mjs` and fails on violations; after UI changes run `npm run audit:theme` against a running server.
