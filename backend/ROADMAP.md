# Backend Roadmap — Civic Eye

Tick items `[x]` as they are done. Riskier work comes first. See `ARCHITECTURE.md` for design details.

## Phase 0 — Foundation
- [ ] `uv init`, add deps (fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, geoalchemy2, alembic, pydantic-settings, pyjwt, pwdlib[argon2], httpx, anthropic), dev deps (pytest, pytest-asyncio, ruff)
- [ ] Folder skeleton (`app/core`, `app/shared`, `app/modules`, `app/integrations`, `tests`)
- [ ] `core/config.py` settings + `.env.example`
- [ ] `docker-compose.yml` with `postgis/postgis`
- [ ] `core/database.py`: async engine, session dependency
- [ ] Alembic set up (async), first migration enables the `postgis` extension
- [ ] `create_app()` with CORS, exception handlers, `GET /health`
- [ ] pytest setup: test DB, `AsyncClient` fixture
- [ ] Ruff config

## Phase 1 — Auth (JWT, email + password)
- [ ] `users` and `refresh_tokens` models + migration
- [ ] `core/security.py`: hash/verify password, create/decode access and refresh tokens
- [ ] `POST /auth/register`, `POST /auth/login`
- [ ] `POST /auth/refresh` with rotation + reuse detection
- [ ] `POST /auth/logout`
- [ ] `get_current_user` / `get_optional_user` dependencies, `GET /auth/me`
- [ ] Tests: happy path, wrong password, expired token, reused refresh token

## Phase 2 — Geo + incidents (map data)
- [ ] `shared/geo.py`: `Point`, `BBox` schemas, bbox filter, distance/within helpers
- [ ] `incidents` model with `geography(Point)` + GiST index, enums (type, urgency, status)
- [ ] `POST /incidents` (auth), `GET /incidents/{id}`
- [ ] `GET /incidents` with `bbox`, `status`, `type` filters (lightweight map items)
- [ ] `PATCH /incidents/{id}` (status flow open → in_progress → resolved), `DELETE /incidents/{id}`
- [ ] Tests for bbox filtering and status transitions

## Phase 3 — Volunteers
- [ ] `volunteers` model (user_id, incident_id, unique together)
- [ ] `POST /incidents/{id}/volunteers` ("I'm going"), `DELETE /incidents/{id}/volunteers/{vid}`
- [ ] Helper counter (`signed_up / needed_people`) in incident responses
- [ ] Auto-move incident to `in_progress` when the first volunteer signs up

## Phase 4 — AI report intake
- [ ] `integrations/claude_client.py`: `parse_report(text) -> ParsedReport` using structured output
- [ ] Prompts in one module; test with Thai / English / Russian samples
- [ ] `integrations/geocoder.py`: Nominatim, Bangkok bounding box, rate limit, cache
- [ ] `reports` model; `POST /reports` (public): parse → resolve location → create incident
- [ ] Fallback when the AI call or geocoding fails (store raw report, `unresolved` location)

## Phase 5 — Deduplication
- [ ] `incidents.service.find_duplicate()` (same need type, open, within N meters, configurable)
- [ ] Merge: link report, `report_count += 1`, raise urgency if needed
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
