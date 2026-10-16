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
- [x] Service area = all of Thailand; `contact_phone` on incidents (logged-in only)
- [x] `shared/geo.py`: `Point`, `BBox` schemas, bbox filter, distance/within helpers
- [x] `incidents` + `incident_tasks` models per `DATA_MODEL.md` (geography point, GiST index, enums)
- [x] `calculate_magnitude()` + `magnitude_level` / helper counter / priority in responses
- [x] `POST /incidents` (auth), `GET /incidents/{id}`
- [x] `GET /incidents` with `bbox`, `status`, `type` filters (lightweight map items)
- [x] `PATCH /incidents/{id}` (owner/coordinator edits, move pin), `POST /incidents/{id}/resolve` + `/reopen`, `DELETE /incidents/{id}`
- [x] `reports` table (`IncidentReport`): manual creation stores a report; magnitude = avg + bonus
- [x] Tests for bbox filtering and status transitions

## Phase 3 — Volunteers
- [x] `volunteer_signups` model (user, incident, task; unique active signup per user per incident)
- [x] `POST /incidents/{id}/volunteers` ("I'm going"), `DELETE /incidents/{id}/volunteers/{vid}`
- [x] Max 2 active signups per user
- [x] Helper counter (`signed_up / helpers_needed`) in incident responses
- [x] Auto `in_progress` on first signup, back to `open` when all cancel
- [x] Volunteers mark their own task done → all tasks done → incident `resolved`
- [x] Owner adds tasks later (`POST /incidents/{id}/tasks`); reopen resets done tasks
- [x] Seed volunteers + sign-ups; dev map shows volunteers per task
- [x] Unified error shape (validation errors too); `FRONTEND_INTEGRATION.md` at repo root
- [x] Public: `GET /incidents/{id}/volunteers` (who is going, per task), `GET /users/{id}/signups`

## Phase 4 — AI report intake
- [x] `integrations/ai/connector.py`: `AIConnector` protocol + `AIConnectorError`
- [x] `integrations/ai/factory.py` + `fake` provider (tests/offline) + DeepSeek via `openai_compatible.py`
- [x] `ParsedReport` schema (coerces bad AI values) + report-parsing prompt
- [ ] Check with the real DeepSeek key: Thai / English / Russian samples (`make ai-check`)
- [x] `POST /reports` (public, text + pin): parse → create incident (or merge, Phase 5)
- [x] Fallback when the AI call fails (incident from raw text, report `status = failed`); `rejected` for non-requests
- [x] `POST /reports/preview` (parse without saving) + submit with confirmed `parsed`
- [x] `make ai-check text="..."` to try the real provider
- [x] Report playground at `/dev/report`

## Phase 5 — Deduplication
- [x] `find_merge_target()`: same need **group**, active or resolved < 24 h, within 200 m, closest
- [x] Merging into a resolved incident reopens it
- [x] Merge: link report, `report_count += 1`, raise urgency, add missing task roles, recalculate magnitude
- [x] Need groups instead of an extra AI call (rescue / health / supplies / shelter; `other` matches all)
- [x] Magnitude bonus per independent source (anti-inflation) + `is_verified` at 2 sources
- [x] `GET /incidents/{id}/reports` public history (AI summaries, never raw text)
- [x] Seed follow-up reports; dev pages show merges, sources, verified, history

## Phase 6 — Emergency centers
- [x] `centers` model + migration (user-created shelters / supply points with supplies)
- [x] `POST/PATCH/DELETE /centers` for users (owner / coordinator)
- [x] `data/centers_osm_snapshot.json` (~3,000 hospitals / fire / police via Overpass, deduplicated) + `data/hotlines.json`
- [x] `scripts/import_osm_centers.py` (`make centers-fetch` / `make centers-load`)
- [x] Loader from snapshot into DB (replaces OSM rows only)
- [x] `make centers-export` (DB → snapshot, keeps edits), backups before overwrite, partial-fetch guard
- [x] `GET /centers` (type, bbox, status, supply), `GET /centers/{id}`
- [x] `GET /centers/nearest` (PostGIS KNN, distance) + `GET /hotlines`
- [x] Nearest hospital / shelter on the incident card (frontend calls `/centers/nearest`; dev map shows it)
- [ ] Later: BMA shelter data (check floodsupport.bangkok.go.th for a JSON feed)

## Phase 6b — Map filters and routes (backend)
- [x] Incident filters: repeatable `need_type`, `urgency`, `status`, `verified`
- [x] Center filters: repeatable `center_type`, `status`, `supply` (any of), `official`
- [x] `GET /centers/nearest/routes` (OSRM road routes, parallel, sorted by road distance, straight-line fallback, flood warning)
- [ ] Frontend: layer toggles + "Show routes" button (see FRONTEND_INTEGRATION.md)

## Phase 6c — Community board (daily use)
- [x] `community` module: posts (optional reward, details JSONB, 30-day expiry) + responses
- [x] Author-only edit / close / delete; accept one response → matched; withdraw → open again
- [x] Responses private to author + responder; contact phone only for logged-in users
- [x] Filters: category, status, has_reward, owner (my posts), bbox; expired/closed hidden
- [x] `POST /community/posts/preview` (AI draft from free text, login required)
- [x] `GET /alerts` (urgent incidents within 5 km → switch to Emergency)
- [x] Seed community posts; dev map Emergency | Community switch + alert banner
- [x] Frontend: Community tab, post form, responses inbox, alert banner

## Phase 6d — Feed (neighbourhood talk)
- [x] `feed` module: posts (topic `complaint | question | news | chat`, area name, no pin),
  comments with one level of replies, likes on posts and comments, reports
- [x] Public reading; posting / commenting / liking / reporting need login
- [x] 3 reports from different people hide a post or comment (`FEED_HIDE_AFTER_REPORTS`)
- [x] Sort New / Popular (likes + comments, last 7 days), topic filter, paging (limit + offset)
- [x] `author_id` filter ("Mine"); authors also see their own hidden posts there
- [x] Seed: 30 Bangkok feed posts with comments, replies and likes
- [ ] Later: coordinator review screen for hidden items, trending complaints per area
- [ ] Later: payments / commission (Omise or 2C2P with PromptPay), boosted posts, local business listings

## Phase 7 — Demo and deploy
- [x] `make seed` + realistic demo data across Thailand (`data/demo_seed.json`, synthetic)
- [x] Dev map at `/dev/map`
- [x] `make seed-bangkok`: busy synthetic Bangkok for testing crowded maps
- [x] Dockerfile for the backend; `docker compose up` runs API + DB (migrations on start, non-root, `make docker-*`)
- [x] Hosted Postgres URLs (Neon `sslmode`, `postgres://`) normalized for asyncpg
- [ ] Deploy (Render/Railway + Supabase/Neon), env vars, CORS origins
- [ ] Wake the backend and run the full flow before the pitch

## Stretch
- [ ] Photo input for reports
- [ ] Volunteer matching (area, vehicle, time)
- [ ] Server-sent events instead of polling
