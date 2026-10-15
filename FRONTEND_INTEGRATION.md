# Frontend Integration Guide — Civic Eye API

How the frontend talks to the backend. The backend only returns **JSON**. The map, design and
markers are entirely the frontend's choice.

- Local API: `http://localhost:8000`. Easiest way to run it, with only Docker installed:
  `cd backend && docker compose up -d --build --wait && make docker-seed`
  (or `make dev` with uv; see `backend/README.md`)
- Interactive docs: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json` (the source of truth for every type)
- Reference map: `http://localhost:8000/dev/map` (a small Leaflet page that uses this API, handy to copy from)

## 1. Setup

### CORS
The backend allows origins listed in `CORS_ORIGINS` (backend `.env`). Vite's
`http://localhost:5173` and `http://localhost:3000` are allowed by default. Tell the backend
owner the deployed frontend URL so it can be added.

### Typed client (don't hand-write types)
```bash
npm i openapi-fetch
npm i -D openapi-typescript
npx openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts
```
```ts
// src/api/client.ts
import createClient from "openapi-fetch";
import type { paths, components } from "./schema";

export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL });
export type IncidentMapItem = components["schemas"]["IncidentMapItem"];
export type IncidentRead = components["schemas"]["IncidentRead"];
```
Re-run the `openapi-typescript` command whenever the backend changes. TypeScript will then show you
what broke. Add it as an npm script, e.g. `"api:types": "openapi-typescript ..."`.

## 2. Auth

Email + password, JWT. **Access token** lasts 15 min; **refresh token** lasts 7 days.

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /auth/register` | `{email, password (min 8), full_name, has_vehicle?}` | `{user, tokens}` |
| `POST /auth/login` | `{email, password}` | `{user, tokens}` |
| `POST /auth/refresh` | `{refresh_token}` | new `tokens` (the old refresh token stops working) |
| `POST /auth/logout` | `{refresh_token}` | 204 |
| `GET /auth/me` | — (Bearer) | `user` |

`tokens = {access_token, refresh_token, token_type: "bearer", access_token_expires_in}`

**How to use:**
1. After login/register, store both tokens (e.g. `localStorage`).
2. Send `Authorization: Bearer <access_token>` on every request.
3. On **401**, call `/auth/refresh` **once**, store the new pair, and retry the request. If refresh
   also fails, log the user out.
4. Each refresh token works **once**. Reusing an old one logs out all of that user's sessions, so
   make sure two parallel requests don't refresh at the same time (share one refresh promise).

```ts
api.use({
  onRequest({ request }) {
    const token = localStorage.getItem("access_token");
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
});
```

**Without login:** viewing the map, incident cards, centers and volunteer lists.
**Login needed:** creating or editing incidents and centers, signing up, marking tasks done.

## 3. Errors

Every error has the same shape:
```json
{ "error": { "code": "conflict", "message": "You are already signed up for this incident" } }
```
Validation errors (422) also include field details:
```json
{ "error": { "code": "validation_error", "message": "Invalid request",
  "details": [{ "field": "body.password", "message": "String should have at least 8 characters" }] } }
```

| Status | `code` | Typical cause |
| --- | --- | --- |
| 401 | `not_authenticated` | No/expired token → refresh or log in |
| 403 | `permission_denied` | Not the owner / not a coordinator |
| 404 | `not_found` | Wrong id |
| 409 | `conflict` | Already signed up, task full, already resolved, … |
| 422 | `validation_error` / `invalid_input` | Bad fields, location outside Thailand, bad bbox |

`message` is human-readable and safe to show in a toast.

## 4. The map

Recommended: **react-leaflet** + OpenStreetMap tiles. (MapLibre or Google Maps also work; the API
doesn't care.)
```tsx
<MapContainer center={[13.0, 101.0]} zoom={6}>   {/* all of Thailand */}
  <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
             attribution="&copy; OpenStreetMap contributors" />
</MapContainer>
```
OSM's free tile server is fine for development and the demo. For real traffic, switch the URL to
MapTiler, Stadia or Carto.

### Loading data for the visible area
On map `moveend` (and every **5 s** for live updates), request only what is visible:
```
GET /incidents?bbox=<west>,<south>,<east>,<north>
GET /centers?bbox=<west>,<south>,<east>,<north>
```
```ts
const b = map.getBounds();
const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
```
With React Query: `useQuery({ queryKey: ["incidents", bbox], queryFn, refetchInterval: 5000 })`.

Coordinates are always `{ "lat": 13.75, "lng": 100.5 }`. Leaflet takes `[lat, lng]`.

### Incident marker: `GET /incidents` item (`IncidentMapItem`)
```json
{
  "id": "6a1f…", "title": "Family of 6 stuck on second floor",
  "need_type": "evacuation", "urgency": "critical", "status": "in_progress",
  "magnitude": 66, "magnitude_level": 4,
  "location": { "lat": 20.428, "lng": 99.883 },
  "report_count": 3, "source_count": 2, "is_verified": true,
  "helpers_needed": 4, "helpers_signed_up": 2
}
```
| Field | Use it for |
| --- | --- |
| `location` | Marker position |
| `magnitude_level` (1–5) | **Marker size**, e.g. `radius = 6 + level * 4` |
| `urgency` | **Colour**: critical `#7b1fa2`, high `#d32f2f`, medium `#f57c00`, low `#fbc02d` |
| `status` | `in_progress` → e.g. dashed/lighter; `resolved` → grey (hidden by default) |
| `helpers_signed_up` / `helpers_needed` | Badge "2 / 4 helpers" |
| `report_count` / `source_count` / `is_verified` | "3 reports from 2 people · ✔ verified" (verified = 2+ independent people) |

Filters (all optional, combine freely; repeatable ones mean "any of"):

| Param | Example | Note |
| --- | --- | --- |
| `need_type` | `&need_type=boat&need_type=evacuation` | repeatable |
| `urgency` | `&urgency=critical&urgency=high` | repeatable |
| `status` | `&status=open&status=in_progress` | repeatable; default hides `resolved` |
| `verified` | `&verified=true` | verified only |

Results are sorted biggest first (max 500).

### Centers layer: `GET /centers` item (`CenterRead`)
Shelters and supply points (created by users) plus official places later.
```json
{
  "id": "…", "name": "Hat Yai municipal shelter", "center_type": "shelter", "status": "open",
  "location": { "lat": 7.02, "lng": 100.47 }, "phone": "+66 74 000 004", "capacity": 400,
  "supplies": ["food", "water", "shelter", "medical"], "is_official": false, "description": "…"
}
```
Filters (all optional, combine freely; repeatable ones mean "any of"):

| Param | Example | Note |
| --- | --- | --- |
| `center_type` | `&center_type=shelter&center_type=fire_station` | repeatable |
| `status` | `&status=open` | repeatable |
| `supply` | `&supply=food&supply=water` | places that provide any of these |
| `official` | `&official=true` / `false` | official only / community only |

**Suggested UI (frontend):** a layer panel with toggles that map 1:1 to these params, e.g.
"Shelters" → `center_type=shelter`, "Hospitals" → `center_type=hospital`, "Fire stations" →
`center_type=fire_station`, "Supply points" → `center_type=supply_point`, plus need-type and
urgency chips for incidents. Keep the toggle state in the URL so a filtered map can be shared.

Two kinds of places in the same endpoint:
- **Community** (`is_official: false`): shelters and supply points created by users.
- **Official** (`is_official: true`): ~3,000 hospitals, fire stations and police from
  OpenStreetMap, with `source_url`. There are many, so request
  `center_type=hospital&center_type=fire_station&center_type=police` only from zoom ≥ 10.

### Nearest help
```
GET /centers/nearest?lat=7.0086&lng=100.4747&center_type=hospital&limit=1
→ [ { ...CenterRead, "distance_m": 1075 } ]
```
Closest first, closed places skipped. Use it on the incident card ("🏥 Rajyindee Hospital · 1.1 km").

### Routes to the nearest places (on button press only)
```
GET /centers/nearest/routes?lat=7.0086&lng=100.4747&center_type=shelter&limit=3
→ {
  "warning": "Routes use normal road data and do not know which roads are flooded. …",
  "routes": [
    { "center": { ...CenterNearby },
      "route": { "kind": "road", "distance_m": 1702, "duration_s": 156,
                 "path": [[7.0087, 100.4747], [7.0091, 100.4743], ...] } }
  ]
}
```
- Sorted by **road** distance. `limit` max 3. `center_type` is repeatable (e.g. shelter + hospital).
- `path` is `[lat, lng]` pairs: `L.polyline(route.path)` draws it directly.
- `kind: "straight_line"` means the routing service was unavailable: draw it **dashed**,
  `duration_s` is `null`, `distance_m` is the straight distance.
- **Always show `warning`** near the routes: routing doesn't know which roads are flooded.
- **UX:** call it only when the user taps "Show routes" on the incident card (it queries an
  external service and takes ~1 s), not on map load or polling. Show a spinner, then fit the map
  to the routes; tapping a route selects that place.

### Hotlines
`GET /hotlines` → `[{ "number": "1669", "name": "Medical emergency / ambulance", "name_local": "เจ็บป่วยฉุกเฉิน", "category": "medical", "area": "nationwide" }, ...]`.
Show them in the report confirmation and on the incident card.
("where can I get medicine?").

## 5. Incident card

On marker click, load both:
```
GET /incidents/{id}              → IncidentRead (full card)
GET /incidents/{id}/volunteers   → who is going, per task (public)
GET /incidents/{id}/reports      → report history (public)
GET /centers/nearest?lat=&lng=&center_type=hospital&limit=1   → nearest hospital (and shelter)
```
`IncidentRead` = map item fields + `summary`, `location_text`, `people_affected`, `owner_id`,
`contact_phone`, `tasks[]`, timestamps.

- `contact_phone` is **only returned to logged-in users** (`null` otherwise). Show "Log in to see contact".
- Show the **Edit / Resolve / Add task** buttons only when `owner_id === me.id` or `me.role` is `coordinator`/`admin`.

Task (the list of "what you can do to help"):
```json
{ "id": "…", "title": "Boat pickup", "role": "boat_operator",
  "needed_count": 2, "signed_up_count": 1, "spots_left": 1, "status": "open" }
```
Task `status`: `open` (spots left) → `filled` (enough people) → `done`.

Volunteer (public, never shows email or phone):
```json
{ "id": "<signup id>", "status": "going",
  "user": { "id": "…", "full_name": "Somchai", "has_vehicle": true },
  "task": { "id": "…", "title": "Boat pickup", "role": "boat_operator" } }
```

## 6. Main flows

### Report with free text + AI (main flow, login optional)
The reporter writes in their own words (Thai / English / Russian). The AI fills in the fields.

1. Pin: GPS to centre the map, the user adjusts the pin (same as below).
2. *(Optional, recommended)* preview: let the reporter check what the AI understood:
```
POST /reports/preview   { "text": "น้ำท่วมถึงหน้าอก ซอย 5 มีคนติดอยู่ 4 คน ต้องการเรือด่วน" }
→ ParsedReport
{
  "is_request_for_help": true,
  "title": "Four people trapped, need a boat",
  "summary": "Chest-deep water on Soi 5, four people trapped.",
  "need_type": "boat", "urgency": "critical", "people_affected": 4,
  "location_text": "ซอย 5", "language": "th",
  "tasks": [{ "title": "Boat rescue", "role": "boat_operator", "needed_count": 2 }]
}
```
   Show it as an editable form. The call takes a few seconds, so show a spinner. **503** means the AI is
   unavailable: skip the preview and submit directly.
3. Submit:
```
POST /reports
{ "text": "<original text>", "location": { "lat": 7.0086, "lng": 100.4747 },
  "contact_phone": "+66 81 111 2222",
  "parsed": { ...the preview, possibly edited... } }     // omit "parsed" to let the AI parse now
→ 201 { "status": "parsed" | "failed" | "rejected", "was_merged": false, "message": "...",
        "parsed": {...}, "incident": IncidentRead | null }
```
| `status` | Meaning | Show |
| --- | --- | --- |
| `parsed` | Incident created | `message` + open the incident card |
| `failed` | AI was down; incident created from the raw text with default fields | `message` + card |
| `rejected` | Not a request for help (spam etc.); nothing on the map | `message` |

If the reporter is logged in, they become the owner (can edit or resolve). Anonymous reports have no owner.

**Merged reports:** if a matching incident already exists within 200 m (same kind of problem),
the report is added to it instead: `was_merged: true`, `incident` is the existing one (now with a
higher `report_count`, maybe `is_verified`), and `message` says so ("Someone already reported this
nearby…"). Show the existing incident card. See `backend/README.md` → "How merging reports works".

Report history on the card:
```
GET /incidents/{id}/reports
→ [{ "created_at": "...", "language": "th", "urgency": "critical", "people_affected": 4,
     "source": "ai", "status": "parsed", "summary": "Chest-deep water, four people trapped." }]
```
`summary` is the AI's English summary (`null` if the AI failed). Raw messages are never returned.

### Report an incident with a form (logged in)
1. Get GPS with `navigator.geolocation.getCurrentPosition` **only to centre the map** and drop a draft pin.
2. Let the user **drag the pin / tap the map** to fix the location.
3. Send:
```json
POST /incidents
{
  "title": "Water up to the knees on Soi 12",
  "summary": "Old man cannot walk to the main road",
  "need_type": "evacuation",
  "urgency": "high",
  "people_affected": 2,
  "location": { "lat": 13.8167, "lng": 100.5612 },
  "location_text": "Soi Lat Phrao 12",
  "contact_phone": "+66 81 234 5678",
  "tasks": [{ "title": "Carry to the car", "role": "carrier", "needed_count": 2 }]
}
```
`tasks` is optional; empty → one "Help on site" task. The location must be inside Thailand (422 otherwise).

### Volunteer: "I'm going"
```
POST /incidents/{id}/volunteers   { "task_id": "<task id>" }   // or {} → first task with free spots
```
→ 201 with the signup (keep its `id` for cancelling). Then refetch the card.
Possible 409s: already signed up here, task full, all tasks covered, incident resolved, or the
**limit of 2 active sign-ups per user**.

Cancel: `DELETE /incidents/{id}/volunteers/{signup_id}` (own sign-up; coordinators can cancel any).

### Mark a task done
```
POST /incidents/{id}/tasks/{task_id}/done    → IncidentRead
```
Allowed for volunteers signed up for **that task**, the owner, and coordinators. When **every** task
is done, the incident becomes `resolved` automatically.

### Owner actions
| Action | Request |
| --- | --- |
| Edit / move pin | `PATCH /incidents/{id}` `{title?, summary?, need_type?, location?, location_text?, contact_phone?}` |
| Add a task | `POST /incidents/{id}/tasks` `{title, role, needed_count}` |
| Resolve / reopen | `POST /incidents/{id}/resolve`, `POST /incidents/{id}/reopen` |
| Delete | `DELETE /incidents/{id}` |

Urgency can't be edited; it comes from reports.

### "My help" page
```
GET /users/{user_id}/signups     → [{ id, status, incident: {id, title, status, need_type, location}, task }]
```
Public, so it also works for "see what this volunteer is doing". Use `me.id` from `/auth/me`.

### Add a shelter / supply point (logged in)
```json
POST /centers
{
  "name": "Wat Hat Yai Nai shelter",
  "center_type": "shelter",
  "description": "Temple hall, dry floor",
  "location": { "lat": 7.0086, "lng": 100.4747 },
  "phone": "+66 74 123 456",
  "capacity": 120,
  "supplies": ["food", "water"]
}
```
The owner keeps it current: `PATCH /centers/{id}` `{status: "full", supplies: [...]}`. Delete: `DELETE /centers/{id}`.

## 6b. Community board (everyday part of the app)

Two modes in the UI on the **same map component**: **🆘 Emergency** (incidents, shelters,
hospitals…) and **🏘 Community** (only community posts: no hospitals or incidents on this layer).

### Switching modes: `GET /alerts`
```
GET /alerts?lat=<map centre or user>&lng=...
→ { "active": true, "radius_m": 5000,
    "message": "Emergency nearby: Family of 6 stuck on second floor (383 m away). …",
    "incidents": [ { ...IncidentMapItem, "distance_m": 383 } ] }
```
Public. Poll it from the Community screen (e.g. every 30–60 s and on map move). `active: true` →
show a red banner with `message`; tapping it switches to Emergency mode and opens the incident.

### Posts
```
GET /community/posts?bbox=...&category=lost_pet&category=found_pet&has_reward=true
→ [ PostRead ]          (public; default: open + matched, not expired; newest first)
```
| Filter | Example | Note |
| --- | --- | --- |
| `category` | `&category=lost_pet&category=help_wanted` | repeatable |
| `status` | `&status=closed` | default `open` + `matched` |
| `has_reward` | `true` / `false` | |
| `owner_id` | `<me.id>` | "My posts" |
| `include_expired` | `true` | posts expire after 30 days |

`PostRead`:
```json
{ "id": "…", "category": "lost_pet", "status": "open",
  "title": "Lost white cat Mali", "description": "…",
  "details": { "species": "cat", "colour": "white", "name": "Mali" },
  "location": { "lat": 13.816, "lng": 100.5625 }, "location_text": "Soi Lat Phrao 12",
  "reward_amount": 2000, "reward_note": "PromptPay QR when found", "platform_fee_preview": 100,
  "contact_phone": null, "owner": { "id": "…", "full_name": "Malee", "has_vehicle": false },
  "response_count": 1, "expires_at": "…", "closed_at": null, "created_at": "…", "updated_at": "…" }
```
- Suggested map icons by category: 🐾 lost_pet, 🐶 found_pet, 👛 lost_item, 🔑 found_item,
  🙋 help_wanted, 🤝 help_offered, 📌 other.
- `reward_amount` is optional (help can be free). `platform_fee_preview` is for the pitch only:
  nothing is charged; people settle rewards themselves (e.g. PromptPay QR).
- `contact_phone` is `null` for anonymous viewers.

### Create a post (login required)
Optional AI draft from free text (like reports):
```
POST /community/posts/preview  { "text": "แมวสีขาวชื่อมะลิหายแถวซอย 12 ให้รางวัล 2000 บาท" }
→ { "category": "lost_pet", "title": "...", "description": "...", "details": {...},
    "location_text": "...", "reward_amount": 2000, "reward_note": null, "language": "th" }
```
Show it as an editable form, add the pin, then:
```
POST /community/posts
{ "category": "lost_pet", "title": "Lost white cat Mali", "description": "...",
  "details": { "species": "cat" }, "location": { "lat": 13.816, "lng": 100.5625 },
  "location_text": "Soi 12", "reward_amount": 2000, "reward_note": "PromptPay QR when found",
  "contact_phone": "+66 81 555 0000" }
```
Author actions: `PATCH /community/posts/{id}` (any field), `POST /community/posts/{id}/close`
(solved / withdrawn), `DELETE /community/posts/{id}`.

### Responses ("I found it" / "I can help")
| Action | Request | Who |
| --- | --- | --- |
| Respond | `POST /community/posts/{id}/responses` `{ "message": "Saw her near 7-Eleven" }` | logged in, not the author; post must be open |
| List | `GET /community/posts/{id}/responses` | author/coordinator: all; others: only their own |
| Accept one | `POST /community/posts/{id}/responses/{rid}/accept` | author → post `matched`, other pending → `declined` |
| Withdraw | `DELETE /community/posts/{id}/responses/{rid}` | the responder (if accepted, post becomes `open` again) |

Response: `{ id, post_id, user: {id, full_name, has_vehicle}, message, status, created_at }`,
status `pending | accepted | declined | withdrawn`. Responses are private (the public only sees
`response_count`), so messages work as a simple inbox for the author.

## 7. Enum values

| Enum | Values |
| --- | --- |
| `need_type` / `supplies` | `evacuation`, `food`, `water`, `medicine`, `medical`, `boat`, `shelter`, `other` |
| `urgency` | `low`, `medium`, `high`, `critical` |
| incident `status` | `open`, `in_progress`, `resolved` |
| task `role` | `driver`, `carrier`, `boat_operator`, `medic`, `cook`, `general` |
| task `status` | `open`, `filled`, `done` |
| signup `status` | `going`, `completed`, `cancelled` |
| `center_type` | `shelter`, `supply_point`, `hospital`, `fire_station`, `police`, `other` |
| center `status` | `open`, `full`, `closed`, `unknown` |
| user `role` | `user`, `coordinator`, `admin` |
| post `category` | `lost_pet`, `found_pet`, `lost_item`, `found_item`, `help_wanted`, `help_offered`, `other` |
| post `status` | `open`, `matched`, `closed` |
| response `status` | `pending`, `accepted`, `declined`, `withdrawn` |

## 8. Demo data

`cd backend && make seed` loads synthetic incidents across Thailand, shelters, sign-ups and merged
follow-up reports (Hat Yai: 3 reports, verified). `make centers-load` loads the official places.
Password for all accounts: `demo-password-1`.

| Account | Role |
| --- | --- |
| `demo@civiceye.dev` | coordinator (owns all demo incidents, can manage everything) |
| `volunteer1@civiceye.dev` … `volunteer3@civiceye.dev` | volunteers |

## 9. Coming next (backend)
- Deployment: public API URL (will be shared), Docker setup.
