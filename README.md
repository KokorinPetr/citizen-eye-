# Civic Eye

Neighbourhood help for Thailand: a live map where people ask for help during floods, volunteers
sign up for tasks, and everyone sees shelters, hospitals and routes. A Community board (lost & found
pets and items, help wanted/offered) keeps people using the app every day, so it is already
installed and trusted when a disaster happens.

## Run everything (Docker only)

Needs Docker Desktop. From the repo root:

```bash
make up        # build + start database, API and web app
make seed      # first time: full demo (Thailand + busy Bangkok) + official places
```

| What | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |

```bash
make down          # stop everything (data is kept)
make restart       # rebuild from the current code and start again
make logs          # follow all logs
make reset         # delete the Docker data and start fresh
```

- Settings and secrets (DeepSeek `AI_API_KEY`, `JWT_SECRET_KEY`) are read from `backend/.env` when
  it exists (`make up` passes it to Docker). Without it the app still runs; AI parsing falls back.
- Ports busy? `API_PORT=8090 WEB_PORT=3090 make up`.
- Demo logins (password `demo-password-1`): `demo@civiceye.dev` (coordinator),
  `volunteer1@civiceye.dev` … `volunteer3@civiceye.dev`.
- The Docker setup has its own database, separate from the backend development database.

## Deploy (one server + Cloudflare)

Built on the server with `docker-compose.prod.yml`: only nginx is public (app + `/api` proxy),
HTTPS via Cloudflare (Flexible, or Full strict with an origin certificate in `deploy/certs/`).
Step by step: **`deploy/README.md`**. On the server: `make prod-up`, `make prod-seed`,
`make prod-backup`; update with `git pull && make prod-up`.

## Develop

| Part | Folder | Start | Docs |
| --- | --- | --- | --- |
| Backend (FastAPI, PostGIS) | `backend/` | `cd backend && make run` (hot reload) | `backend/README.md`, `backend/ARCHITECTURE.md` |
| Frontend (Vite, React, TS) | `frontend/` | `cd frontend && npm run dev` → http://localhost:5173 | `frontend/ARCHITECTURE.md` |
| API contract | | | `FRONTEND_INTEGRATION.md` |

Don't run `make up` (Docker API on :8000) and `cd backend && make run` at the same time on the same port.
