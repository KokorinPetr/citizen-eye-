# Civic Eye API. Build: docker compose build api  (or any host that builds a Dockerfile, e.g. Render)
FROM python:3.12-slim

# uv from PyPI (no extra registry needed); same version as local development.
RUN pip install --no-cache-dir uv==0.11.2

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first: this layer is cached until pyproject.toml / uv.lock change.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project --no-cache

COPY . .
# Files stay owned by root (read-only for the app); the server runs as an unprivileged user.
RUN uv sync --frozen --no-dev --no-cache \
    && useradd --create-home --uid 1000 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", 8000)}/health')"

CMD ["./docker/start.sh"]
