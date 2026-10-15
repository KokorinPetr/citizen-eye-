# Whole app in Docker (database + API + web). Backend development: see backend/Makefile.
.DEFAULT_GOAL := help
.PHONY: help up down restart seed seed-small seed-bangkok logs ps reset check-ports \
	prod-up prod-down prod-logs prod-ps prod-seed prod-backup prod-restore

# Use backend/.env (AI key, JWT secret) for the containers when it exists.
ENV_FILE := $(if $(wildcard backend/.env),--env-file backend/.env,)
COMPOSE := docker compose $(ENV_FILE)

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

up: check-ports ## Build and start everything: web http://localhost:3000, API http://localhost:8000
	$(COMPOSE) up -d --build --wait
	@echo ""
	@echo "  Web app:  http://localhost:$${WEB_PORT:-3000}"
	@echo "  API docs: http://localhost:$${API_PORT:-8000}/docs"
	@echo "  First time? Run: make seed"

# Another server (e.g. `cd backend && make run`) on the same port would answer some requests
# instead of Docker, with a different database. Refuse to start in that case.
check-ports:
	@for port in $${API_PORT:-8000} $${WEB_PORT:-3000}; do \
		owner=$$(lsof -nP -iTCP:$$port -sTCP:LISTEN 2>/dev/null | awk 'NR>1 && $$1 !~ /^com.docke/ {print $$1" (pid "$$2")"; exit}'); \
		if [ -n "$$owner" ]; then \
			echo "Port $$port is already used by $$owner."; \
			echo "Stop it first (backend dev server: Ctrl+C in its terminal), or use other ports:"; \
			echo "  API_PORT=8090 WEB_PORT=3090 make up"; \
			exit 1; \
		fi; \
	done

down: ## Stop everything (data is kept)
	$(COMPOSE) down

restart: down up ## Stop and start again (rebuilds from current code)

seed: seed-small seed-bangkok ## Full demo: Thailand demo + busy Bangkok + official places (safe to re-run)

seed-small: ## Only the small demo set (10 reports across Thailand) + official places
	$(COMPOSE) exec api python -m scripts.seed_demo
	$(COMPOSE) exec api python -m scripts.import_osm_centers load

seed-bangkok: ## Only the busy Bangkok data (70 reports, 40 posts, 15 shelters)
	$(COMPOSE) exec api python -m scripts.seed_bangkok

logs: ## Follow logs of all containers
	$(COMPOSE) logs -f

ps: ## Show container status
	$(COMPOSE) ps

reset: ## Delete all data of the Docker setup and start fresh
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build --wait

# ---------------------------------------------------------------------------------------------
# Production (on the server). Settings in .env.prod; see deploy/README.md.
PROD := docker compose -f docker-compose.prod.yml --env-file .env.prod

.env.prod:
	@echo ".env.prod is missing. Create it: cp deploy/.env.prod.example .env.prod (then edit it)"; exit 1

prod-up: .env.prod ## [server] Build from the current code and start (migrations run automatically)
	$(PROD) up -d --build --wait
	@docker image prune -f >/dev/null
	@echo "Running. Check: curl -s http://localhost/api/health"

prod-down: .env.prod ## [server] Stop (data is kept)
	$(PROD) down

prod-logs: .env.prod ## [server] Follow logs
	$(PROD) logs -f --tail=100

prod-ps: .env.prod ## [server] Container status
	$(PROD) ps

prod-seed: .env.prod ## [server] Load the full demo data + official places
	$(PROD) exec api python -m scripts.seed_demo
	$(PROD) exec api python -m scripts.seed_bangkok
	$(PROD) exec api python -m scripts.import_osm_centers load

prod-backup: .env.prod ## [server] Database dump to backups/ (keeps the last 14)
	@mkdir -p backups
	$(PROD) exec -T db pg_dump -U civic_eye -d civic_eye | gzip > backups/civic_eye_$$(date +%Y%m%d_%H%M%S).sql.gz
	@ls -1t backups/civic_eye_*.sql.gz | tail -n +15 | xargs -r rm --
	@ls -lh backups | tail -n 3

prod-restore: .env.prod ## [server] Restore a dump: make prod-restore file=backups/xxx.sql.gz (REPLACES data)
	@test -n "$(file)" || (echo "Usage: make prod-restore file=backups/xxx.sql.gz" && exit 1)
	$(PROD) exec -T db psql -U civic_eye -d postgres -c "DROP DATABASE IF EXISTS civic_eye WITH (FORCE);" -c "CREATE DATABASE civic_eye;"
	gunzip -c $(file) | $(PROD) exec -T db psql -U civic_eye -d civic_eye -q
	$(PROD) restart api
