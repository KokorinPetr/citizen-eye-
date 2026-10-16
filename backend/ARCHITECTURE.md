# Backend Architecture — Civic Eye

## Approach: modular monolith

One FastAPI app, one PostgreSQL database, split into **feature modules**. Each module owns its
routes, schemas, models and logic. To add a feature, add a new module and register its router.
To change a feature, edit only that module. Modules talk to each other through their **service**
functions and never through another module's models or repository.

```
backend/
├── pyproject.toml / uv.lock
├── docker-compose.yml          # postgres (PostGIS) for local dev
├── alembic.ini
├── migrations/                 # Alembic migrations
├── .env.example
├── app/
│   ├── main.py                 # create_app(): CORS, exception handlers, include routers
│   ├── api.py                  # collects all module routers in one place
│   ├── core/                   # shared infrastructure, no business logic
│   │   ├── config.py           # Settings (pydantic-settings) read from env
│   │   ├── database.py         # async engine, session factory, get_db_session dependency
│   │   ├── security.py         # password hashing, JWT encode/decode
│   │   ├── exceptions.py       # AppError base + HTTP mapping
│   │   └── base_model.py       # SQLAlchemy DeclarativeBase, id/created_at mixins
│   ├── shared/                 # reusable helpers used by several modules
│   │   ├── geo.py              # Point/BBox schemas, bbox filter, distance helpers
│   │   └── pagination.py
│   ├── modules/
│   │   ├── auth/               # users, login, access + refresh tokens
│   │   ├── incidents/          # incidents CRUD, map listing, status flow
│   │   ├── volunteers/         # "I'm going" sign-up
│   │   ├── reports/            # AI intake: text → incident (create or merge)
│   │   ├── centers/            # emergency centers layer
│   │   └── seed/               # demo data
│   └── integrations/           # wrappers over external APIs
│       ├── ai/                 # provider-agnostic AI layer (see "AI connectors")
│       │   ├── connector.py    # AIConnector interface + AIConnectorError
│       │   ├── factory.py      # get_ai_connector() picks the provider from settings
│       │   └── providers/      # openai_compatible.py (DeepSeek, OpenAI, ...), fake.py
│       └── geocoder.py         # Nominatim
├── scripts/                    # scrape_centers.py and other one-off scripts
├── data/                       # centers_snapshot.json, seed data
└── tests/                      # mirrors app/modules/*
```

### Inside a module

Every module uses the same file layout, so all modules read the same way:

| File              | Responsibility                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| `router.py`       | HTTP only: validate input, call service, return schema                  |
| `schemas.py`      | Pydantic models: `<Entity>Create`, `<Entity>Update`, `<Entity>Read`     |
| `models.py`       | SQLAlchemy ORM tables                                                   |
| `repository.py`   | All DB queries for this module                                          |
| `service.py`      | Business logic; the module's public API for other modules               |
| `dependencies.py` | FastAPI `Depends` helpers (e.g. `get_incident_or_404`, `get_current_user`) |
| `enums.py`        | `StrEnum` value sets (optional)                                         |

Request flow: `router → service → repository → DB`. Calls to external APIs go through `integrations/`.

## Tech choices

| Concern        | Choice                                                    |
| -------------- | --------------------------------------------------------- |
| Web framework  | FastAPI + uvicorn                                         |
| DB             | PostgreSQL 16 + **PostGIS** (`postgis/postgis` image locally; Supabase/Neon support it) |
| ORM / driver   | SQLAlchemy 2.0 async + asyncpg, GeoAlchemy2 for geometry  |
| Migrations     | Alembic                                                   |
| Settings       | pydantic-settings                                         |
| Auth           | PyJWT + pwdlib[argon2]                                    |
| AI             | Any LLM behind `AIConnector`; provider and model from env (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`) |
| Geocoding      | Nominatim over httpx, rate limited, results cached        |
| Tests / lint   | pytest + httpx `AsyncClient`, ruff                        |

## Auth (JWT access + refresh)

- **Register / login** with email and password. Passwords are hashed with argon2.
- **Access token**: short-lived JWT (15 min), sent as `Authorization: Bearer <token>`.
  Claims: `sub` (user id), `type="access"`, `exp`, `iat`.
- **Refresh token**: long-lived JWT (7 days), `type="refresh"` plus a `jti`. Only a **hash** of
  the `jti` is stored in `refresh_tokens`, so tokens can be revoked.
- **Rotation**: each `/auth/refresh` revokes the old refresh token and issues a new pair. If a
  revoked token is used again, all of that user's refresh tokens are revoked (reuse detection).
- `get_current_user` dependency protects routes; `get_optional_user` is for routes that work both ways.

| Endpoint              | Auth    | Purpose                              |
| --------------------- | ------- | ------------------------------------ |
| `POST /auth/register` | public  | Create a user, return a token pair   |
| `POST /auth/login`    | public  | Email + password → token pair        |
| `POST /auth/refresh`  | refresh | Rotate tokens                        |
| `POST /auth/logout`   | refresh | Revoke the refresh token             |
| `GET /auth/me`        | access  | Current user                         |

**Access policy:** people in need must not hit a login wall, so `POST /reports` and all map reads
(`GET /incidents`, `GET /centers`) stay **public**. Volunteer sign-up, status changes, manual
incident editing and `/seed` require a logged-in user.

Tables:
- `users`: id, email (unique, lowercased), password_hash, name, has_vehicle, is_active, created_at
- `refresh_tokens`: id, user_id, jti_hash, expires_at, revoked_at, created_at

## Coordinates and the map

The map itself is rendered on the frontend (Leaflet + OpenStreetMap tiles). The backend's job is to
**store points and return the ones inside the visible area**.

**Storage.** See `DATA_MODEL.md` for every table. Each incident and center has a `location geography(Point, 4326)` column with a GiST
index. The API exposes plain `lat` / `lng` numbers; conversion happens only in `shared/geo.py`.

**Getting coordinates for an incident:** always from the client.
1. The frontend uses browser GPS only to centre the map and drop a draft pin.
2. The user drags the pin or taps the map to adjust it.
3. The pin is sent as `location: {lat, lng}` (required). The backend checks that it lies in the service
   area (`SERVICE_AREA_BBOX`, all of Thailand) and stores it. The owner can move it later with `PATCH`.

There is no geocoding for incidents. `location_text` is free text for humans (Nominatim stays only
for the centers scraper).

**Reading for the map:**
- `GET /incidents?bbox=min_lng,min_lat,max_lng,max_lat&status=open&need_type=food` returns light
  map items (id, lat, lng, type, urgency, status, helpers `3/5`). The frontend polls it every few seconds.
- `GET /incidents/{id}` returns the full card.
- `GET /centers?bbox=...&type=shelter` returns the same kind of list for the centers layer.
- `GET /centers/nearest?lat=&lng=&type=hospital` returns the nearest centers with their distance.
- The bbox query uses `ST_MakeEnvelope` + `ST_Intersects`, and nearest/dedup use `ST_DWithin` /
  `ST_Distance`. All of these live as helpers in `shared/geo.py` and are reused by every module:
  `point_column()`, `to_db_point()`, `DbPoint` (response type), `within_bbox()`, `within_distance()`,
  `distance_meters()`, `parse_bbox` (query dependency), `ensure_in_service_area()`.
- PostGIS order is **(lng, lat)**. Only `shared/geo.py` builds or reads points.

**Privacy:** an incident's `contact_phone` is returned only on `GET /incidents/{id}` to logged-in
users, never on the public map list. Center phones are public (they are a place's contact).

## Centers (shelters and supply points)

Users can add their own places to the map: `POST /centers` with a pin, `center_type`
(`shelter`, `supply_point`, ...), phone, capacity and `supplies` (list of `NeedType`, e.g. food,
water, boat). The owner keeps `status` (open / full / closed) and supplies up to date. Official data
(OSM, BMA) goes into the same table with another `source` and no owner, so only coordinators can edit
it. `GET /centers?bbox=&center_type=&status=&supply=medicine` returns them for the map.

## Official places and hotlines

- `app/integrations/osm.py` queries the Overpass API once (`make centers-fetch`) for hospitals, fire
  stations and police in Thailand, removes duplicates and saves `data/centers_osm_snapshot.json`
  (with source link and retrieval date per place). `make centers-load` replaces all `source = osm`
  rows from the snapshot; user-created places are untouched. The demo never scrapes live.
- The snapshot is the source of truth. `make centers-export` writes DB rows (with coordinator edits)
  back to it; every overwrite first copies the old file to `data/backups/`, and `centers-fetch`
  refuses a result >20% smaller than the current snapshot unless `FORCE=1`.
- `GET /centers/nearest?lat=&lng=&center_type=hospital&limit=3` uses PostGIS KNN (`<->`,
  `order_by_nearest()` in `shared/geo.py`) and returns `distance_m`; closed places are skipped.
- `GET /hotlines` serves `data/hotlines.json` (verify the numbers before the demo).
- Filters: `IncidentFilters` / `CenterFilters` (in each module's `schemas.py`), built by one FastAPI
  dependency per module (`dependencies.py`) and applied in the repository. Adding a filter = one
  field + one `where`.
- Routes: `app/integrations/routing.py` (`Router` protocol, `OsrmRouter`, `get_router` dependency;
  `ROUTING_BASE_URL`, default the public OSRM demo server). `GET /centers/nearest/routes` takes the
  nearest places, fetches road routes in parallel, sorts by road distance, and falls back to
  straight lines if routing fails. Always returns a "roads may be flooded" warning.

## Community board (`modules/community`)

The everyday part of the app, built from the same blocks as incidents but in **its own module and
tables** (no `kind` flag inside incidents, so the emergency flow is never affected):

- `community_posts`: category (`lost_pet`, `found_pet`, `lost_item`, `found_item`, `help_wanted`,
  `help_offered`, `other`), pin, `details` JSONB (species, colour, item…; new fields need no
  migration), **optional** `reward_amount` (THB) + `reward_note`, status `open → matched → closed`,
  `expires_at` (30 days, `COMMUNITY_POST_TTL_DAYS`). Login required to post (anti-scam).
- `community_responses`: "I found it" / "I can help" + message. Visible only to the author and the
  responder (public sees `response_count`). The author accepts one → post `matched`, other pending
  responses `declined`; if the accepted helper withdraws, the post is open again.
- Reused: `shared/geo` (pins, bbox), `ensure_owner_or_manager`, filter-object pattern
  (`PostFilters`), the AI connector (`POST /community/posts/preview` with `community/prompts.py`),
  `PhoneNumber` (contact phone hidden from anonymous viewers).
- **No payments.** `platform_fee_preview` (5% of the reward) is shown for the pitch only; people
  settle rewards themselves (e.g. PromptPay QR). See README → "Business model".

## Feed (`modules/feed`)

Neighbourhood talk (complaints, questions, news, chat) so people open the app every day. Public to
read, login to write. Complaints such as "the drain on Soi 5 is blocked" double as early flood
signals.

- `feed_posts`: `topic`, `body`, optional `area_text` (area name only, **no pin**, for privacy),
  denormalised `like_count` / `comment_count` / `report_count`, `is_hidden`.
- `feed_comments`: `parent_id` for replies, **one level**: a reply to a reply is attached to the
  top comment, so threads stay readable on a phone. Deleting a comment deletes its replies.
- `feed_reactions`: one table for likes **and** reports (`kind`), on a post *or* a comment (check
  constraint), unique per user + kind + target (partial unique indexes). Counts are recounted
  after each change, so they never drift.
- Moderation: `FEED_HIDE_AFTER_REPORTS` (3) different people → `is_hidden`; hidden items disappear
  for everyone except their author and coordinators. Author or coordinator can delete.
- Reads include `liked_by_me` (one extra query per page for the viewer's likes).

### Emergency ↔ Community (`GET /alerts`)
`GET /alerts?lat=&lng=` (incidents module) returns active **high/critical** incidents within
`ALERT_RADIUS_M` (5 km), closest first. The Community screen polls it; `active: true` → red banner /
switch to Emergency mode.

## Dev tools

- `make seed` loads `data/demo_seed.json` (synthetic) with a demo coordinator account.
- `/dev/map` (`app/modules/dev/`) is a small Leaflet page for checking data. It is not mounted when `ENVIRONMENT=production`.

## Incident status rules

| Change | Who / what |
| --- | --- |
| → `open` | Created (manually or from a report) |
| `open` → `in_progress` | Automatic: first volunteer signs up (or a task is done) |
| `in_progress` → `open` | Automatic: every volunteer cancels |
| → `resolved` | Owner, coordinator/admin (`POST /incidents/{id}/resolve`), or automatically when **all tasks** are done (`POST /incidents/{id}/tasks/{task_id}/done`) |
| `resolved` → `open` | Owner, coordinator/admin (`POST /incidents/{id}/reopen`), or automatically when a new report is merged within 24 h (Phase 5) |

The AI never changes status; it only sets need type, urgency, people affected and tasks.
Anti-abuse (kept simple): volunteers can only complete tasks they signed up for, max 2 active
signups per user, and a new report reopens a wrongly resolved incident. The owner is the logged-in
creator; owner + coordinators/admins can edit, resolve, reopen and delete.

## AI connectors (`integrations/ai`)

The app never imports a vendor SDK directly. Everything goes through one interface:

```python
# integrations/ai/connector.py
class AIConnector(Protocol):
    provider_name: str
    model_name: str

    async def generate_structured(
        self, system_prompt: str, user_prompt: str, output_schema: type[T]
    ) -> T: ...
```

- `generate_structured` returns a validated Pydantic object (e.g. `ParsedReport`). Providers use
  their JSON mode; the answer is validated against the schema.
- **Current provider: DeepSeek** (`AI_PROVIDER=deepseek`, `AI_MODEL=deepseek-flash`, `AI_API_KEY`).
  `providers/openai_compatible.py` works with any OpenAI-style `/chat/completions` API, so OpenAI,
  or anything else with that API (via `AI_BASE_URL`), is an env change. A vendor with a different API =
  one new file in `providers/` + one line in `factory.py`.
- The `fake` provider makes no network calls: it answers with a responder registered per schema, or
  the schema's first `examples` entry. Tests always use it (`tests/conftest.py`).
- `factory.get_ai_connector()` is a FastAPI dependency; tests override it with
  `app.dependency_overrides`.
- **Prompts live in the module that uses them** (e.g. `modules/reports/prompts.py`), so
  `integrations/ai` stays generic and never imports app modules.
- `make ai-check text="..."` sends one text to the real provider and prints the result.
- Provider errors are wrapped in `AIConnectorError`. Callers handle that one exception and fall back
  (store the raw report with `status = failed`).
- Every report row stores `ai_provider` and `ai_model`, so results can be compared across models.

## Report intake pipeline (`modules/reports`)

```
POST /reports  {text, location (pin), contact_phone?, parsed?}
  → ensure_in_service_area()            (before the AI call, so bad pins cost nothing)
  → parsed given? (reporter confirmed a preview) → use it, no AI call
    else connector.generate_structured(prompt, text, ParsedReport)
         AIConnectorError → fallback: title = text, need_type = other, urgency = medium, status = failed
  → not is_request_for_help → report saved as `rejected`, no incident
  → incidents.service.create_or_merge_incident(IncidentCreate, reporter or None, ReportMeta)
       → find_merge_target(): within 200 m, active or resolved < 24 h, same need group, closest
       → merge_into_incident()  OR  create_incident()
  → ReportResult { status, was_merged, message, parsed, incident }
```
- `POST /reports/preview {text}` parses without saving (503 if the AI is down), so the frontend can
  show the result for the reporter to confirm/edit and then send it back as `parsed`.
- Both endpoints are public; a logged-in reporter becomes the incident owner, anonymous reports
  have no owner (coordinators manage them).
- `ParsedReport` coerces bad AI values to safe defaults (unknown need type → `other`, unknown role →
  `general`, counts clamped), so a slightly wrong answer never loses a report.
- The AI writes `title`, `summary` and task titles in English; `location_text` keeps the original
  wording; the original message is kept in `reports.raw_text`.

Merging and magnitude rules are in `DATA_MODEL.md`. Magnitude (0–100) drives marker size on the map.

Every raw report is stored in a `reports` table linked to its incident (for audit and verification).

## Rules that keep it modular

- New feature = new folder in `modules/` + one line in `app/api.py` + one Alembic migration.
- No imports from another module's `models.py` / `repository.py`. Import its `service.py` instead
  (`enums.py` and `schemas.py` are shared vocabulary and fine to import). A repository may *join*
  another module's model for a read query (e.g. volunteers counts only signups on active incidents).
- Ownership checks use one helper: `auth.permissions.ensure_owner_or_manager()`.
- Swapping a provider (another LLM, another geocoder) means adding or changing one file in `integrations/` plus an env var.
- Config only from `core/config.py`. No hardcoded keys, URLs or thresholds.
- Every error response is `{"error": {"code", "message", "details?"}}`, validation errors included.
- Errors: raise domain exceptions (`NotFoundError`, `PermissionDeniedError`) from services. They are
  mapped to HTTP responses in one place (`core/exceptions.py`).
