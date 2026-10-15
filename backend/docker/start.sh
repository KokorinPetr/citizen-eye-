#!/bin/sh
# Container entrypoint: bring the database schema up to date, then serve the API.
# Runs on every start/deploy, so new migrations are applied automatically.
set -e

echo "Applying database migrations…"
alembic upgrade head

echo "Starting API on port ${PORT:-8000}"
# ROOT_PATH: the URL prefix when served behind a proxy (production: /api), so /docs works.
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --root-path "${ROOT_PATH:-}" \
    --proxy-headers \
    --forwarded-allow-ips="*"
