.DEFAULT_GOAL := help
.PHONY: docker-up docker-down docker-logs docker-seed help install env db-up db-down db-reset db-logs db-shell migrate migration downgrade seed centers-fetch centers-load centers-export ai-check run dev test lint format check

PORT ?= 8000

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (uv sync)
	uv sync

env: ## Create .env from .env.example with a generated JWT secret (if missing)
	@test -f .env && echo ".env already exists" || (sed "s|JWT_SECRET_KEY=change-me|JWT_SECRET_KEY=$$(uv run python -c 'import secrets; print(secrets.token_urlsafe(64))')|" .env.example > .env && echo ".env created")

db-up: ## Start Postgres + PostGIS container and wait until healthy (other commands call this)
	@docker compose up -d --wait db >/dev/null 2>&1 || (echo "Could not start the database. Is Docker Desktop running?" && exit 1)

db-down: ## Stop the database container (data is kept)
	docker compose down

db-reset: ## Delete all DB data, recreate the container and apply migrations
	docker compose down -v
	docker compose up -d --wait db
	uv run alembic upgrade head

db-logs: ## Follow database logs
	docker compose logs -f db

db-shell: db-up ## Open psql in the dev database
	docker exec -it civic-eye-db psql -U civic_eye -d civic_eye

migrate: db-up ## Apply all migrations
	uv run alembic upgrade head

migration: db-up ## Autogenerate a migration: make migration m="add incidents"
	@test -n "$(m)" || (echo "Usage: make migration m=\"message\"" && exit 1)
	uv run alembic revision --autogenerate -m "$(m)"

downgrade: db-up ## Roll back the last migration
	uv run alembic downgrade -1

seed: db-up ## Load synthetic demo incidents + shelters (data/demo_seed.json), safe to re-run
	uv run python -m scripts.seed_demo

centers-fetch: ## Download hospitals / fire stations / police from OSM into the snapshot (backs up the old one)
	uv run python -m scripts.import_osm_centers fetch

centers-load: db-up ## Load the OSM snapshot into the database (no network)
	uv run python -m scripts.import_osm_centers load

centers-export: db-up ## Save OSM places from the database (with edits) back to the snapshot
	uv run python -m scripts.import_osm_centers export

ai-check: ## Parse one text with the real AI provider: make ai-check text="..."
	uv run python -m scripts.try_ai "$(text)"

run: db-up ## Run the API with auto-reload (default port 8000, override: make run PORT=8001)
	uv run uvicorn app.main:app --reload --reload-include .env --port $(PORT)

dev: env install db-up migrate run ## One command: .env + deps + DB + migrations + API

test: db-up ## Run tests (starts the DB container if needed)
	uv run pytest

lint: ## Check code with ruff
	uv run ruff check .
	uv run ruff format --check .

format: ## Auto-fix and format code with ruff
	uv run ruff check --fix .
	uv run ruff format .

check: lint test ## Lint + tests (run before pushing)

docker-up: ## Whole backend in Docker (DB + API on :8000, rebuilt from current code, migrations on start)
	docker compose up -d --build --wait

docker-down: ## Stop the Docker backend (data is kept)
	docker compose down

docker-logs: ## Follow API container logs
	docker compose logs -f api

docker-seed: ## Load demo data + official places into the Docker backend
	docker compose exec api python -m scripts.seed_demo
	docker compose exec api python -m scripts.import_osm_centers load
