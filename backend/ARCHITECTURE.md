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
│       ├── claude_client.py    # Claude API (report parsing, center extraction)
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
| AI             | Anthropic SDK (model name from env `CLAUDE_MODEL`)        |
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

**Storage.** Each incident and center has a `location geography(Point, 4326)` column with a GiST
index. The API exposes plain `lat` / `lng` numbers; conversion happens only in `shared/geo.py`.

**Getting coordinates for an incident** (first match wins):
1. Coordinates sent by the client: a tap on the map or the browser's GPS location.
2. Geocoding the AI-extracted `location_text` via Nominatim (bounded to the Bangkok area).
3. Nothing found: save the incident with `location_status = "unresolved"` so the reporter can pin it.

**Reading for the map:**
- `GET /incidents?bbox=min_lng,min_lat,max_lng,max_lat&status=open&type=food` returns light
  map items (id, lat, lng, type, urgency, status, helpers `3/5`). The frontend polls it every few seconds.
- `GET /incidents/{id}` returns the full card.
- `GET /centers?bbox=...&type=shelter` returns the same kind of list for the centers layer.
- `GET /centers/nearest?lat=&lng=&type=hospital` returns the nearest centers with their distance.
- The bbox query uses `ST_MakeEnvelope` + `ST_Intersects`, and nearest/dedup use `ST_DWithin` /
  `ST_Distance`. All of these live as helpers in `shared/geo.py` and are reused by every module.

## Report intake pipeline (`modules/reports`)

```
text (+ optional lat/lng)
  → claude_client.parse_report()      → ParsedReport (location_text, need_type, urgency, people_needed, tasks)
  → resolve_location()                → point (client coordinates or geocoder)
  → incidents.service.find_duplicate()→ open incident, same need_type, within ~200 m
  → merge (report_count += 1, keep the higher urgency) OR incidents.service.create_incident()
```

Every raw report is stored in a `reports` table linked to its incident (for audit and verification).

## Rules that keep it modular

- New feature = new folder in `modules/` + one line in `app/api.py` + one Alembic migration.
- No imports from another module's `models.py` / `repository.py`. Import its `service.py` instead.
- Swapping a provider (another LLM, another geocoder) means changing one file in `integrations/`.
- Config only from `core/config.py`. No hardcoded keys, URLs or thresholds.
- Errors: raise domain exceptions (`NotFoundError`, `PermissionDeniedError`) from services. They are
  mapped to HTTP responses in one place (`core/exceptions.py`).
