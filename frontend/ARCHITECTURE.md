# Frontend Architecture — Civic Eye

Decisions made for the web app. Read this before adding code. The API contract is in
`../FRONTEND_INTEGRATION.md`; the backend is described in `../backend/ARCHITECTURE.md`.

## Product in one paragraph

A mobile-first web app with two modes on one map. **Emergency**: incidents (people who need
help), volunteers ("I'm going"), shelters, hospitals, routes to help. **Community**: everyday
posts (lost/found pets and items, help wanted/offered, optional reward), so people use the app
daily and already trust it when a flood comes. A red banner switches to Emergency when something
urgent is nearby. Users are neighbours of all ages, often on a phone, often stressed: the
interface must be obvious without explanation.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build / dev server | **Vite** | Fast, outputs plain static files (any static host) |
| UI | **React 19 + TypeScript** | Standard, typed, easy for teammates |
| Routing | **React Router 7** (`react-router`) | URL per screen, shareable links |
| Server data | **TanStack Query 5** | Caching, polling (map refresh), loading/error states |
| API client | **openapi-fetch** + **openapi-typescript** | Types generated from the backend's OpenAPI: backend changes show up as TypeScript errors |
| Map | **Leaflet** + **react-leaflet**, OpenStreetMap tiles | Same as the backend dev map; free |
| Styling | **CSS Modules** + global design tokens (CSS variables) | No UI framework, no inline styles, styles next to components |
| Text | `src/i18n/en.ts` | All UI text in one file; Thai = add `th.ts` with the same keys |

No other UI or state libraries. Add a dependency only when it removes real complexity.

## Folder structure

```
frontend/
├── index.html
├── .env.example              VITE_API_URL
├── src/
│   ├── main.tsx              providers (QueryClient, Router, Auth), global CSS
│   ├── app/
│   │   ├── routes.tsx        all routes in one place
│   │   └── AppLayout.tsx     shell: mode switch, alert banner, bottom nav, <Outlet/>
│   ├── api/
│   │   ├── schema.d.ts       GENERATED from the backend (npm run api:types). Don't edit.
│   │   ├── client.ts         typed client, base URL, auth header, refresh on 401
│   │   ├── tokens.ts         token storage (localStorage, wrapped in try/catch)
│   │   └── types.ts          friendly aliases: Incident, Center, Post…
│   ├── features/             one folder per area, same idea as backend modules
│   │   ├── map/              MapView, markers, filters, bbox hook
│   │   ├── incidents/        incident sheet, tasks, volunteers, report history
│   │   ├── centers/          center sheet, nearest help, routes
│   │   ├── report/           "Ask for help" flow (pin → text → AI preview → result)
│   │   ├── community/        board, post sheet, responses, new post flow
│   │   ├── auth/             AuthProvider, login/register screens
│   │   └── profile/          "Me": my help, my posts
│   ├── components/           shared UI only: Button, Chip, Sheet, BottomNav, Banner, Empty…
│   ├── hooks/                shared hooks (useGeolocation, useMediaQuery…)
│   ├── styles/
│   │   ├── tokens.css        colours, type scale, spacing, radius, shadows, z-index
│   │   └── base.css          reset, body, focus ring, utilities
│   ├── i18n/
│   │   ├── en.ts             every UI string
│   │   └── index.ts          t() helper
│   └── utils/                format distance, time ago, etc.
```

Rules:
- A **feature** owns its components, hooks (one `api.ts` per feature with its TanStack Query hooks)
  and `.module.css`. Features may use `components/`, `hooks/`, `api/`, `utils/`, and *import other
  features only through their public `index.ts`*.
- `components/` is generic (no API calls, no feature knowledge).
- New screen = new route in `app/routes.tsx` + a folder in `features/`.

## Data and API

- `npm run api:types` regenerates `src/api/schema.d.ts` from `${VITE_API_URL}/openapi.json`
  (backend must be running). Commit the generated file.
- All requests go through `src/api/client.ts`: adds `Authorization`, on **401** calls
  `/auth/refresh` once (shared promise, so parallel requests don't double-refresh), retries, and
  logs out if refresh fails.
- Every endpoint gets a hook in its feature's `api.ts` (`useIncidents(filters)`,
  `useSignUp()`…). Components never call `fetch` directly.
- Map layers poll every **5 s** (`refetchInterval`) and refetch on map move (bbox in query key).
  Routes are fetched **only on button press**.
- Errors use the backend shape `{ error: { code, message, details? } }`; `message` is shown as is.

## Design system

Brief: clean, friendly, obvious for anyone ("like for a kid"), **green main colour, blue
sometimes**, pastel surfaces, modern but not the neon / gradient AI look. Mobile first.

### Colour (tokens.css)
| Token | Hex | Use |
| --- | --- | --- |
| `--green-600` Paddy green | `#2F8F57` | primary buttons, active nav, selected chips |
| `--green-900` Leaf ink | `#1E3A2B` | text |
| `--green-50` Rice field | `#EEF5EE` | app background |
| `--blue-600` Khlong blue | `#3C78A8` | secondary actions, links, water, routes |
| `--blue-50` Rain | `#E6F0F7` | secondary surfaces, info notes |
| `--red-600` Alarm | `#C8423B` | **only** real urgency: critical incidents, alert banner |
| urgency | critical `#C8423B`, high `#E07B39`, medium `#E3B23C`, low `#7FB38F`, resolved `#A7B3AC` | markers |

Red means urgent and nothing else. Text on colour must meet WCAG AA (4.5:1).

### Type
**Atkinson Hyperlegible** (Braille Institute, designed for legibility) for everything; Thai will
use a Thai fallback (e.g. IBM Plex Sans Thai Looped) in the same stack. Scale: 14 / 16 (body) /
18 / 22 / 28. Hierarchy by size and weight, sentence case everywhere, no all-caps labels.

### Layout
- Mobile: full-screen map; top: mode switch (🆘 Emergency / 🏘 Community) + alert banner when
  needed; bottom nav: Map · List · **Ask for help** (raised round button, the one bold element) ·
  Me. Details open in a **bottom sheet** (peek → half → full).
- Desktop (≥ 900 px): nav moves to a top bar; the sheet becomes a 400 px left panel next to the map.
- Map markers: **water-drop shapes** for incidents (size = magnitude level, colour = urgency;
  in-progress = outlined), round icons for places, emoji icons for community posts.

### Principles
1. One main action per screen; secondary actions are quieter (outline / text buttons).
2. Plain words for people, not system names: "2 of 4 people going", "Ask for help", "I'm going".
3. Every screen is reachable from the bottom nav in one tap; the mode switch is always visible.
4. Tap targets ≥ 48 px, visible keyboard focus, respects `prefers-reduced-motion`.
5. Motion only answers an action (sheet opens, button confirms). No decorative animations.
6. Empty and error states say what to do next.

## Commands

```bash
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm run dev                   # http://localhost:5173 (backend: cd ../backend && make run)
npm run api:types             # regenerate API types (backend running)
npm run build                 # static files in dist/
npm run lint
```

## Build order (roadmap)
1. ✅ Base: tokens, layout, nav, mode switch, map (incidents, places, filters), incident / place /
   post sheets, list, alert banner.
2. ✅ Ask for help: pin (fixed centre pin, "use my location") → text → AI check (editable) → result
   (incl. merged / rejected). ✅ Add a shelter / supply point (login required).
3. Accounts: ✅ login / register / logout, ✅ "Me" with my sign-ups, ✅ token refresh on 401;
   ✅ I'm going / cancel / mark task done (tap twice to confirm); ⬜ routes to nearest help.
4. ⬜ Community: respond, new post (AI draft), responses inbox, my posts.
5. ⬜ Polish: marker clustering if needed, Thai texts.
6. ✅ Deployed: one server behind Cloudflare (see ../deploy/README.md).

## Docker
`frontend/Dockerfile` builds the static files with Node (`VITE_API_URL` is a build argument, baked
into the files) and serves them with nginx (`nginx.conf`: SPA fallback to `index.html`, long cache
for hashed `/assets/`, gzip). The root `docker-compose.yml` runs db + api + web; use the root
`Makefile` (`make up`, `make down`, `make seed`).

## Mobile and PWA
- Layout height uses `100dvh` (follows the mobile address bar) with a `100vh` fallback; the body
  never scrolls (`overflow: hidden`, `overscroll-behavior: none`), screens scroll inside.
- `MapResizer` calls Leaflet `invalidateSize()` whenever the map container changes size.
- PWA: `public/manifest.webmanifest` + icons (`icon.svg`, `icon-192/512.png`,
  `apple-touch-icon.png`) → "Add to Home Screen" opens full screen. No service worker yet (no
  offline mode); add one only with a clear caching plan.
- Geolocation ("use my location") only works on `https://` or `localhost`.
