# Backend Agent Guide — Civic Eye

We work **only in `/backend`**. Do not edit `/frontend` or other folders unless explicitly asked.

## Project context

Civic Eye is a hackathon web app (U Hackathon, AI track) for coordinating flood response in Thailand.

- Covers **all of Thailand** (north, south and Bangkok are the most affected).
- Two parts in one app: **Emergency** (incidents, volunteers, shelters, hospitals) and **Community**
  (everyday board: lost/found pets and items, help wanted/offered, optional reward). Community keeps
  people using the app daily, so it is installed and trusted when a disaster happens. `GET /alerts`
  tells the Community screen to switch to Emergency when something urgent is nearby.
- People report problems in free text (Thai, English or Russian), optionally with a photo.
- An AI model (through our connector layer) turns each report into a structured incident: location, need type
  (evacuation, food, medicine, boat, other), urgency, people needed and tasks with roles.
- Reports about the same place and need are merged (deduplication) into one incident.
- Volunteers see incidents on a live map, tap "I'm going", and the helper counter updates for everyone (frontend polls).
- Incidents move through `open` → `in_progress` → `resolved`.
- A centers layer: **users can add their own shelters and supply points** (with the supplies they
  offer), and official ones (OpenStreetMap / BMA) are imported into the same table with `source_url`.

Out of scope: in-app chat, push notifications, official warning system integration.

### Stack

- **FastAPI** (Python) — the backend web framework; served with `uvicorn`.
- **PostgreSQL** (Supabase or Neon in production).
- **AI via connectors** (`app/integrations/ai/`): provider-agnostic, chosen by env. Never import a vendor SDK outside `providers/`.
- API keys live only in environment variables (`.env`, never committed). CORS must be enabled.

### API

| Method & path                            | Purpose                                                   |
| ---------------------------------------- | --------------------------------------------------------- |
| `POST /reports`                          | Free text/photo in → AI parses → create or merge incident |
| `GET /incidents`                         | List incidents. Filters: status, type, bounding box       |
| `GET /incidents/{id}`                    | Incident card with tasks and volunteers                   |
| `POST /incidents`                        | Manual creation                                           |
| `PATCH /incidents/{id}`                  | Change status or details                                  |
| `DELETE /incidents/{id}`                 | Remove an incident                                        |
| `POST /incidents/{id}/volunteers`        | "I'm going" sign-up                                       |
| `DELETE /incidents/{id}/volunteers/{vid}`| Cancel sign-up                                            |
| `GET /centers`                           | Emergency centers. Filters: type, bounding box            |
| `POST /seed`                             | Load demo data (demo only)                                |

### Data model

- `incidents`: id, title, type, urgency, lat, lng, status, needed_people, tasks (JSON), raw_text, created_at
- `volunteers`: id, name, incident_id, has_vehicle, created_at
- `centers`: id, name, type, district, lat, lng, phone, capacity, status, source_url, retrieved_at

The frontend generates a typed client from our OpenAPI schema, so keep request/response models
explicit and accurate (always set `response_model` / return type annotations).

## Local setup

Use the `Makefile` (`make help` lists all commands). `make dev` does everything below in one go.

```bash
cp .env.example .env                      # then set JWT_SECRET_KEY
docker compose up -d --wait               # Postgres 17 + PostGIS on :5432 (dbs: civic_eye, civic_eye_test)
uv sync
uv run alembic upgrade head               # apply migrations
uv run uvicorn app.main:app --reload      # http://localhost:8000/docs
uv run pytest                             # tests use the civic_eye_test db
```

- The DB image is `imresamu/postgis` (a multi-arch build of `postgis/postgis`, which has no arm64 image).
- Reset the DB completely: `docker compose down -v && docker compose up -d --wait`.
- Migrations: change models → `uv run alembic revision --autogenerate -m "..."` → review the file →
  `uv run alembic upgrade head`. Register new module models in `app/models.py`. Alembic ignores DB
  tables we don't define (PostGIS/tiger), so dropping one of ours needs a manual `op.drop_table`.
- DB sessions: services call `await session.commit()` explicitly; repositories only `flush()`.
- Docker: `Dockerfile` + `docker/start.sh` (runs migrations, then uvicorn). New runtime files must
  not be excluded by `.dockerignore`; new env vars must be added to `docker-compose.yml` (api) and `.env.example`.

## Python tooling: use `uv` only

All Python runs through **uv**. Never use `pip`, `pip install`, `python -m venv`, `poetry` or bare `python`.

```bash
uv sync                                   # install dependencies from pyproject.toml / uv.lock
uv add <package>                          # add a dependency
uv add --dev <package>                    # add a dev dependency (pytest, ruff, ...)
uv remove <package>                       # remove a dependency
uv run uvicorn app.main:app --reload      # run the API locally
uv run pytest                             # run tests
uv run ruff check . && uv run ruff format . # lint and format
uv run python -m scripts.scrape_centers   # run a script
uv run alembic upgrade head               # run migrations
```

Commit both `pyproject.toml` and `uv.lock`.

## Architecture and roadmap

- **`ARCHITECTURE.md`**: the modular monolith layout, auth design, coordinates/map, and report pipeline. Read it before adding code.
- **`DATA_MODEL.md`**: tables, enums, merging rules and incident magnitude.
- **`../FRONTEND_INTEGRATION.md`**: the API contract for the frontend. Update it when endpoints or response fields change.
- **`ROADMAP.md`**: the phased task list. Tick items `[x]` when they are done and keep the list current.

Short version: each feature is its own folder in `app/modules/<feature>/` with `router.py`,
`schemas.py`, `models.py`, `repository.py`, `service.py` and `dependencies.py`. Shared infrastructure goes in
`app/core/`, shared helpers in `app/shared/`, and external APIs in `app/integrations/`. Modules use each
other only through `service.py` (importing another module's `enums.py` / `schemas.py` is fine). Routers stay thin. All DB queries go in repositories.

## Naming and style

Follow PEP 8 and modern typed Python (3.12+).

- **Classes**: `PascalCase` — `Incident`, `IncidentCreate`, `IncidentRead`, `AnthropicConnector`.
- **Functions and variables**: `snake_case`, verbs for functions — `create_incident`, `find_nearby_incidents`, `parse_report_text`.
- **Constants**: `UPPER_SNAKE_CASE` — `DEFAULT_SEARCH_RADIUS_M`.
- **Modules/files**: `snake_case.py`, named after what they contain.
- **Pydantic schemas**: `<Entity>Create`, `<Entity>Update`, `<Entity>Read`.
- **Enums** for fixed value sets (`IncidentStatus`, `NeedType`, `Urgency`, `CenterType`) — subclass `StrEnum`.
- Type hints on every function signature. Prefer `async def` for I/O-bound endpoints and clients.
- Small, single-purpose functions. Docstrings on public services and non-obvious logic only.

## Reusability

- **If logic is used in more than one place, extract it** into a function in the appropriate module
  (the module's `service.py`, `app/shared/` or `app/integrations/`) and import it. Do not copy-paste code.
- Shared query filters (status, type, bounding box) live in one helper used by both
  `GET /incidents` and `GET /centers`.
- AI prompts live in the module that uses them (e.g. `app/modules/reports/prompts.py`), never inline
  in routers. `app/integrations/ai` stays generic.
- Tests never call a real AI: they use the `fake` provider or override `get_ai_connector`.
- Configuration values come from `core/config.py`; never hardcode keys, URLs or magic numbers.
- Before writing a new helper, check whether one already exists.
