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

## Demo data and the dev map

```bash
make seed       # 10 synthetic incidents across Thailand + 5 shelters/supply points
make run        # then open http://localhost:8000/dev/map
```

- Seed login (coordinator, can manage everything): `demo@civiceye.dev` / `demo-password-1`.
  Re-running `make seed` replaces the previous demo data. Edit `data/demo_seed.json` to change it.
- On the map, circle size = magnitude and colour = urgency; squares are shelters (blue) and supply
  points (green). Click a marker for details. Click empty map to copy a `"location": {...}` JSON for Postman.
- The map refreshes every 5 s, so anything you create in Postman shows up automatically.

## Everyday commands

| Make                               | uv / docker equivalent                                 | What it does                          |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `make help`                        | —                                                      | List all commands                     |
| `make run PORT=8001`               | `uv run uvicorn app.main:app --reload --port 8001`     | API on another port                   |
| `make test`                        | `uv run pytest`                                        | Run tests (DB must be running)        |
| `make lint`                        | `uv run ruff check . && uv run ruff format --check .`  | Check code style                      |
| `make format`                      | `uv run ruff check --fix . && uv run ruff format .`    | Auto-fix and format                   |
| `make check`                       | lint + test                                            | Run before pushing                    |
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
