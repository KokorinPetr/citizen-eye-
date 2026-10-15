# Deploying Civic Eye (one server + Cloudflare)

```
Browser ──HTTPS──► Cloudflare ──► server :80 (Flexible) or :443 (Full strict)
                                   └─ web (nginx): app + /api ──► api (FastAPI) ──► db (PostGIS)
```
Only the `web` container is reachable from outside. Images are **built on the server** from the
repo (native architecture, no registry). Files: `docker-compose.prod.yml`, `.env.prod` (secrets,
only on the server), `deploy/certs/` (optional origin certificate), root `Makefile` (`prod-*`).

## 1. Server (once)

Any Ubuntu 22.04/24.04 or Amazon Linux 2023 EC2 instance, x86 or ARM (Graviton).
**2 GB RAM recommended**; with 1 GB add swap (step 1c). ~5 GB free disk.

**a) AWS Security Group (inbound)**
| Port | Source | Why |
| --- | --- | --- |
| 22 | **your IP only** | SSH |
| 80 | Cloudflare IP ranges (or 0.0.0.0/0 to start) | site (Flexible) |
| 443 | Cloudflare IP ranges (or 0.0.0.0/0 to start) | site (Full strict) |

Cloudflare IP ranges: https://www.cloudflare.com/ips/ (limiting to them stops people bypassing
Cloudflare by using the raw IP).

**b) Docker + git + make**
```bash
# Ubuntu
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y git make
# Amazon Linux 2023
sudo dnf install -y docker git make && sudo systemctl enable --now docker
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
sudo curl -SL "https://github.com/docker/buildx/releases/latest/download/buildx-v0.17.1.linux-$( [ "$(uname -m)" = aarch64 ] && echo arm64 || echo amd64)" \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx

# Both: run docker without sudo (log out and in again afterwards)
sudo usermod -aG docker $USER
docker compose version   # check
```

**c) Swap (only if the server has ≤ 1 GB RAM: the web build needs ~1.5 GB)**
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Code

**Public repo:** `git clone https://github.com/<you>/citizen-eye-.git && cd citizen-eye-`

**Private repo** (read-only deploy key):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/civic_eye_deploy -N ""
cat ~/.ssh/civic_eye_deploy.pub   # GitHub → repo → Settings → Deploy keys → Add (read-only)
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/civic_eye_deploy
EOF
git clone git@github.com:<you>/citizen-eye-.git && cd citizen-eye-
```

## 3. Settings

```bash
cp deploy/.env.prod.example .env.prod
openssl rand -base64 32 | tr -d '=+/'   # → POSTGRES_PASSWORD
openssl rand -base64 48 | tr -d '=+/'   # → JWT_SECRET_KEY
nano .env.prod                          # DOMAIN, the two secrets, AI_API_KEY
chmod 600 .env.prod
```
`POSTGRES_PASSWORD` is used when the database is created the first time. Changing it later needs
the database password changed too, so pick it once.

## 4. Cloudflare

1. **DNS** → Add record: type `A`, name = your subdomain (e.g. `civiceye`), IPv4 = server IP,
   **Proxied (orange cloud) on**.
2. **SSL/TLS → Overview**, choose one:
   - **Full (strict)** (recommended): SSL/TLS → Origin Server → **Create Certificate** (RSA, your
     subdomain, 15 years). Save the certificate as `deploy/certs/origin.pem` and the private key as
     `deploy/certs/origin.key` on the server (`chmod 644` both). HTTPS on :443 turns on
     automatically at the next start (log: `origin certificate found`).
   - **Flexible** (quickest): nothing to do on the server; Cloudflare talks to it over port 80.
   - Don't use plain "Full" without a certificate.
3. **SSL/TLS → Edge Certificates → Always Use HTTPS**: on.
4. **Speed → Optimization**: **Rocket Loader off** (it can break the React app).
5. **Caching → Cache Rules**: add "URI Path starts with `/api/`" → **Bypass cache**.

## 5. Start

```bash
make prod-up      # first build takes a few minutes; migrations run automatically
make prod-ps      # db, api, web: healthy
curl -s http://localhost/api/health   # {"status":"ok","database":"ok"}
make prod-seed    # demo data (Thailand + busy Bangkok + official places)
```
Open `https://<your subdomain>`. API docs: `https://<your subdomain>/api/docs`.
Containers restart automatically after a reboot (`restart: unless-stopped`).

## 6. Update to a new version

```bash
git pull
make prod-up      # rebuilds what changed, applies new migrations, keeps the data
```

## 7. Backups

```bash
make prod-backup                                 # backups/civic_eye_<date>.sql.gz (keeps last 14)
make prod-restore file=backups/civic_eye_X.sql.gz  # REPLACES the current data
```
Nightly at 03:00 (`crontab -e`):
```
0 3 * * * cd /home/ubuntu/citizen-eye- && make prod-backup >> backups/cron.log 2>&1
```
Copy backups off the server now and then (`scp`), e.g. before the demo.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Cloudflare **521** | Server not reachable: containers down (`make prod-ps`) or port 80/443 closed in the Security Group |
| Cloudflare **522** | Timeout: Security Group blocks Cloudflare, or the server is overloaded |
| Cloudflare **525 / 526** | SSL mode "Full (strict)" but no / wrong origin certificate in `deploy/certs/` |
| Redirect loop | "Flexible" plus something redirecting HTTP → HTTPS on the server: use Full (strict) |
| **502** on `/api/...` | API still starting or crashed: `make prod-logs` |
| Build killed / very slow | Not enough RAM: add swap (step 1c) |
| AI parsing doesn't work | `AI_API_KEY` empty or wrong in `.env.prod` → fix → `make prod-up` |
| Login works but GPS / "Add to home screen" don't | Site not opened via `https://` |

Logs: `make prod-logs` · Stop: `make prod-down` · Status: `make prod-ps`
