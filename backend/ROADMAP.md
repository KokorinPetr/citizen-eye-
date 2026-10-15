# Backend Roadmap — Civic Eye

Tick items `[x]` as they are done. Riskier work comes first. See `ARCHITECTURE.md` for design details.

## Phase 0 — Foundation
- [x] `uv init`, add deps (fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, geoalchemy2, alembic, pydantic-settings, pyjwt, pwdlib[argon2], httpx, + SDK of the chosen AI provider), dev deps (pytest, pytest-asyncio, ruff)
- [x] Folder skeleton (`app/core`, `app/shared`, `app/modules`, `app/integrations`, `tests`)
- [x] `core/config.py` settings + `.env.example`
- [x] `docker-compose.yml` with `postgis/postgis`
- [x] `core/database.py`: async engine, session dependency
- [x] Alembic set up (async), first migration enables the `postgis` extension
- [x] `create_app()` with CORS, exception handlers, `GET /health`
- [x] pytest setup: test DB, `AsyncClient` fixture
- [x] Ruff config

## Phase 1 — Auth (JWT, email + password)
- [x] `users` and `refresh_tokens` models + migration
- [x] `core/security.py`: hash/verify password, create/decode access and refresh tokens
- [x] `POST /auth/register`, `POST /auth/login`
- [x] `POST /auth/refresh` with rotation + reuse detection
- [x] `POST /auth/logout`
- [x] `get_current_user` / `get_optional_user` dependencies, `GET /auth/me`
- [x] Tests: happy path, wrong password, expired token, reused refresh token

## Phase 2 — Geo + incidents (map data)
- [ ] `shared/geo.py`: `Point`, `BBox` schemas, bbox filter, distance/within helpers
- [ ] `incidents` + `incident_tasks` models per `DATA_MODEL.md` (geography point, GiST index, enums)
- [ ] `calculate_magnitude()` + `magnitude_level` / helper counter / priority in responses
- [ ] `POST /incidents` (auth), `GET /incidents/{id}`
- [ ] `GET /incidents` with `bbox`, `status`, `type` filters (lightweight map items)
- [ ] `PATCH /incidents/{id}` (status flow open → in_progress → resolved), `DELETE /incidents/{id}`
- [ ] Tests for bbox filtering and status transitions

## Phase 3 — Volunteers
- [ ] `volunteer_signups` model (user, incident, task; unique active signup per user per incident)
- [ ] `POST /incidents/{id}/volunteers` ("I'm going"), `DELETE /incidents/{id}/volunteers/{vid}`
- [ ] Helper counter (`signed_up / needed_people`) in incident responses
- [ ] Auto-move incident to `in_progress` when the first volunteer signs up

## Phase 4 — AI report intake
- [ ] `integrations/ai/connector.py`: `AIConnector` protocol + `AIConnectorError`
- [ ] `integrations/ai/factory.py` + `fake` provider (tests/offline) + first real provider
- [ ] `ParsedReport` schema + report-parsing prompt; test with Thai / English / Russian samples
- [ ] `integrations/geocoder.py`: Nominatim, Bangkok bounding box, rate limit, cache
- [ ] `reports` model; `POST /reports` (public): parse → resolve location → create incident
- [ ] Fallback when the AI call or geocoding fails (store raw report, `unresolved` location)

## Phase 5 — Deduplication
- [ ] `incidents.service.find_duplicate()` (same need type, open, within N meters, configurable)
- [ ] Merge: link report, `report_count += 1`, raise urgency, add missing task roles, recalculate magnitude
- [ ] Optional AI check "same situation?" for different need types
- [ ] `verified` flag after a 2nd independent report or volunteer confirmation

## Phase 6 — Emergency centers
- [ ] `centers` model + migration
- [ ] `data/centers_snapshot.json` (OSM Overpass + hand-entered hotlines)
- [ ] `scripts/scrape_centers.py` (fetch → AI extract → geocode → snapshot)
- [ ] Loader from snapshot into DB
- [ ] `GET /centers` (type, bbox), `GET /centers/nearest`
- [ ] Attach nearest shelter/hospital + hotline to the incident card

## Phase 7 — Demo and deploy
- [ ] `POST /seed` + realistic demo data (marked synthetic)
- [ ] Dockerfile for the backend; `docker compose up` runs API + DB
- [ ] Deploy (Render/Railway + Supabase/Neon), env vars, CORS origins
- [ ] Wake the backend and run the full flow before the pitch

## Stretch
- [ ] Photo input for reports
- [ ] Volunteer matching (area, vehicle, time)
- [ ] Server-sent events instead of polling
