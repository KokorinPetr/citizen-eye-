# Frontend Agent Guide — Civic Eye

Read `ARCHITECTURE.md` (stack, structure, design system) and `../FRONTEND_INTEGRATION.md` (API)
first. Product context: `../backend/AGENTS.md`.

## Rules
- **Stack:** Vite + React 19 + TypeScript, React Router, TanStack Query, Leaflet/react-leaflet,
  openapi-fetch. Don't add libraries without a clear reason.
- **Package manager:** npm (`package-lock.json` is committed).
- **Types from the backend:** `npm run api:types` (backend running). Never hand-write API types;
  use the aliases in `src/api/types.ts`.
- **No direct `fetch` in components.** Every endpoint has a hook in its feature's `api.ts`.
- **Text:** every user-facing string lives in `src/i18n/en.ts` and is used as `t.section.key`
  (placeholders: `format(t.incident.peopleGoing, { going, needed })`).
  Sentence case, plain words, active verbs ("Ask for help", "I'm going").
- **Styles:** CSS Modules next to the component (`Thing.module.css`) + tokens from
  `src/styles/tokens.css`. No inline styles, no hard-coded colours outside `tokens.css`
  (the only exception: dynamic marker colours, which still come from token constants).
- **Naming:** components `PascalCase.tsx`, hooks `useThing.ts`, utilities `camelCase.ts`.
  One component per file.
- **Reuse:** if UI is used twice, it goes into `components/`; if logic is used twice, into
  `hooks/` or `utils/`.
- **Mobile first:** design for 360 px wide, then enhance at `min-width: 900px`.
  Tap targets ≥ 48 px, visible focus, `prefers-reduced-motion` respected.
- **Colour meaning:** red only for urgency. Green = primary action, blue = secondary / info.
- `localStorage` access is always wrapped in try/catch (private mode can throw).

## Commands
`npm run dev` · `npm run build` · `npm run lint` · `npm run api:types`
