# Civic Eye — Backend

FastAPI + PostgreSQL/PostGIS. Python is managed with **uv**, the database runs in **Docker**.

## Requirements

- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker Desktop (running)
- `make` (preinstalled on macOS/Linux)

## How to start

### Option A — Makefile (recommended)

First time:

```bash
cd backend
make dev
```

`make dev` runs these steps in order:

1. `make env`: creates `.env` from `.env.example` with a generated `JWT_SECRET_KEY` (skipped if `.env` exists)
2. `make install`: installs dependencies (`uv sync`)
3. `make db-up`: starts Postgres + PostGIS in Docker and waits until it is healthy
4. `make migrate`: applies database migrations
5. `make run`: starts the API with auto-reload

Next time (deps and `.env` already set up):

```bash
make db-up      # 1. start the database
make run        # 2. start the API
```

Stop:

```bash
Ctrl+C          # stop the API
make db-down    # stop the database (data is kept)
```

### Option B — manual, with uv

The same steps without `make`:

```bash
cd backend
cp .env.example .env                       # 1. env file, then set JWT_SECRET_KEY:
uv run python -c "import secrets; print(secrets.token_urlsafe(64))"
uv sync                                    # 2. install dependencies
docker compose up -d --wait                # 3. start Postgres + PostGIS
uv run alembic upgrade head                # 4. apply migrations
uv run uvicorn app.main:app --reload       # 5. start the API
```

Stop: `Ctrl+C`, then `docker compose down`.

## Once it is running

| URL                                   | What                                      |
| ------------------------------------- | ----------------------------------------- |
| http://localhost:8000/docs            | Swagger UI, try endpoints in the browser  |
| http://localhost:8000/openapi.json    | OpenAPI schema; import into Postman       |
| http://localhost:8000/health          | Health check (API + database)             |
| http://localhost:8000/dev/map         | Dev map: incidents + shelters (not in production) |
| http://localhost:8000/dev/report      | Report playground: try AI preview / submit by hand |

## Demo data and the dev map

```bash
make seed           # synthetic incidents across Thailand, shelters, volunteers, merged follow-up reports
make centers-load   # ~3,000 official hospitals / fire stations / police from the OSM snapshot
make run            # then open http://localhost:8000/dev/map
```

- Seed login (coordinator, can manage everything): `demo@civiceye.dev` / `demo-password-1`.
  Re-running `make seed` replaces the previous demo data. Edit `data/demo_seed.json` to change it.
- On the map, circle size = magnitude and colour = urgency; squares are community shelters (blue)
  and supply points (green); dots are official hospitals (red), fire stations (orange) and police
  (dark blue), shown from zoom 10. Click an incident for tasks, volunteers, report history and the
  nearest hospital / shelter. Click empty map to copy a `"location": {...}` JSON for Postman.
- The map refreshes every 5 s, so anything you create in Postman shows up automatically.

### Report playground (`/dev/report`)
Try the AI flow without Postman: log in (optional; demo login is prefilled), drop a pin (or pick a
city), write a message or use a sample (Thai / English / Russian / mixed / spam), then:
- **Preview**: what the AI understood, nothing saved. Edit the JSON and **Submit confirmed preview**.
- **Submit**: the AI parses and the incident is created in one step.
The raw response, HTTP status and timing are shown; "Open on the map" jumps to the new incident.
Send the Thai sample, then **Follow-up** at the same pin: the second report is merged.

## AI (DeepSeek)

Put your key in `.env`: `AI_API_KEY=sk-...` (or `DEEPSEEK_API_KEY=sk-...`) (`AI_PROVIDER=deepseek`, `AI_MODEL=deepseek-flash` are preset).
Check it works: `make ai-check text="น้ำท่วมถึงเข่า ซอย 12 ลาดพร้าว ยายต้องการยา"`.
Without a key, `POST /reports` still works (fallback: the incident is created from the raw text)
and `/reports/preview` returns 503. `AI_PROVIDER=fake` gives a fixed answer with no network.

## Official places (OSM snapshot)

`data/centers_osm_snapshot.json` is the **source of truth** for official hospitals, fire stations and
police (cleaned + deduplicated, committed to git). The database is just a copy of it.

| Command | Does | Safety |
| --- | --- | --- |
| `make centers-load` | snapshot → DB (replaces OSM rows, keeps community places) | no network |
| `make centers-export` | DB → snapshot, **including coordinator edits** (status, phone, …) | old file backed up first |
| `make centers-fetch` | Overpass → snapshot (fresh download) | old file backed up first; refuses to save if the result is >20% smaller (partial answer); `FORCE=1 make centers-fetch` to override |

Backups go to `data/backups/centers_osm_<timestamp>.json` (git-ignored; restore by copying one back).
**Edited official places in the app? Run `make centers-export` before the next `centers-load`.**

## How merging reports works

When a report arrives, the backend looks for an incident that is:
1. **within 200 m** of the new pin (PostGIS `ST_DWithin`, `DEDUP_RADIUS_M`),
2. **active** (open / in progress) **or resolved in the last 24 h** (`REOPEN_WINDOW_HOURS`), and
3. about the **same kind of problem**, using need groups:

| Group | Needs |
| --- | --- |
| Rescue | `evacuation`, `boat` |
| Health | `medicine`, `medical` |
| Supplies | `food`, `water` |
| Shelter | `shelter` |
| `other` | matches anything |

So "water rising, need a boat" and "family must be evacuated" on the same street become **one
incident**, but "need a boat" and "need food" at the same place stay **two different problems**.

The closest match wins. Merging then:
- keeps the higher **urgency**, the larger **people** count (not the sum: same people), adds
  **task roles** that are still missing, fills in a missing contact phone;
- **reopens** the incident if it was resolved in the last 24 h (the problem is back);
- recalculates the **magnitude**: average of all reports + **8 per extra independent source**
  (max 20) + 5 if verified. One person sending 5 reports counts as **one source**; all anonymous
  reports together count as one source, so nobody can inflate a marker alone;
- marks the incident **verified** once **2 independent sources** report it.

Every report is kept. `GET /incidents/{id}/reports` shows the history (time, language, AI summary;
never the raw text or phone numbers).

## Presentation notes

Talking points for the pitch, with what to show live (`make seed`, `/dev/map`, `/dev/report`):

1. **Shared live state, not a chatbot.** Many people see and change the same map: tasks, helper
   counters ("2 / 4 going") and statuses update for everyone every few seconds.
2. **AI turns chaos into structure.** Paste the Thai sample in `/dev/report` → need type, urgency,
   people, tasks with roles, English summary, in ~10 s. Russian and mixed-language messages work too;
   spam is rejected.
3. **Duplicates become confirmation.** Send the **Follow-up** sample at the same pin: no second
   marker. The incident grows (magnitude), shows "3 reports from 3 people · ✔ verified". The Hat Yai
   demo incident already shows this.
4. **Anti-abuse built in.** One person can't inflate an incident (sources, not reports), volunteers
   can only close their own tasks, max 2 active sign-ups, and a wrongly resolved incident reopens
   when someone reports it again.
5. **Our own data layer.** ~3,000 official hospitals, fire stations and police from OpenStreetMap
   (with source links) plus community shelters and supply points. Every incident shows the nearest
   hospital and shelter with distance and phone. Hotlines: `GET /hotlines`.
6. **Privacy.** Contact phones only for logged-in users; report history shows AI summaries, never
   raw messages.
7. **Resilient.** If the AI is down, reports still reach the map with default fields; the demo
   data and official places load from saved snapshots, no live scraping on stage.

State clearly in the demo that the incident data is **synthetic**.

## Everyday commands

| Make                               | uv / docker equivalent                                 | What it does                          |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `make help`                        | —                                                      | List all commands                     |
| `make run PORT=8001`               | `uv run uvicorn app.main:app --reload --port 8001`     | API on another port                   |
| `make test`                        | `uv run pytest`                                        | Run tests (DB must be running)        |
| `make lint`                        | `uv run ruff check . && uv run ruff format --check .`  | Check code style                      |
| `make format`                      | `uv run ruff check --fix . && uv run ruff format .`    | Auto-fix and format                   |
| `make check`                       | lint + test                                            | Run before pushing                    |
| `make ai-check text="..."`         | `uv run python -m scripts.try_ai "..."`                | Try the real AI provider              |
| `make centers-fetch`               | `uv run python -m scripts.import_osm_centers fetch`    | Download OSM places into the snapshot |
| `make centers-export`              | `uv run python -m scripts.import_osm_centers export`   | Save DB places (with edits) to snapshot |
| `make centers-load`                | `uv run python -m scripts.import_osm_centers load`     | Load the OSM snapshot into the DB     |
| `make seed`                        | `uv run python -m scripts.seed_demo`                   | Load demo data                        |
| `make migrate`                     | `uv run alembic upgrade head`                          | Apply migrations                      |
| `make migration m="add incidents"` | `uv run alembic revision --autogenerate -m "..."`      | Create a migration from model changes |
| `make downgrade`                   | `uv run alembic downgrade -1`                          | Undo the last migration               |
| `make db-shell`                    | `docker exec -it civic-eye-db psql -U civic_eye -d civic_eye` | Open psql                      |
| `make db-logs`                     | `docker compose logs -f db`                            | Database logs                         |
| `make db-reset`                    | `docker compose down -v && docker compose up -d --wait && uv run alembic upgrade head` | **Delete all data** and start fresh |

## Troubleshooting

- **`Cannot connect to the Docker daemon`**: start Docker Desktop and wait until it is running.
- **Port 5432 already in use** (a local Postgres): set `POSTGRES_PORT=5433` in `.env` and change the
  port in `DATABASE_URL` / `TEST_DATABASE_URL` to `5433`.
- **Port 8000 in use**: `make run PORT=8001`.
- **Strange DB state after switching branches**: `make db-reset`.

More docs: `AGENTS.md` (rules), `ARCHITECTURE.md`, `DATA_MODEL.md`, `ROADMAP.md`.
