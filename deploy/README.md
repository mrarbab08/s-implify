# S-Implify — VPS deployment

Two containers, one origin:

```
internet ──:80──> nginx (Angular build)
                    │
                    └─ /api/* ──> api:8080 (Express + SQLite)
```

The frontend bundle uses a relative `/api` base URL, so there is no CORS,
no hardcoded domain, and no separate API hostname to manage.

## 1. Prepare the VPS

- Ubuntu 22.04/24.04, 2 GB RAM, Docker Engine + Compose plugin.
- Open port 80 (and 443 if you terminate TLS here).
- Clone the repo **with the committed `backend/data/simplify.db`** — that is
  the seeded application database.

## 2. Configure

```bash
cp .env.example .env
```

At minimum, leave `API_PORT=8080` (nginx hardcodes `api:8080`). Set `AI_*`
values only if you use the in-app AI assistant. Never commit `.env`.

To publish the site on another host port, set `WEB_PORT` in `.env`, e.g.
`WEB_PORT=8080` if something else already uses port 80.

## 3. Build and start

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

The root `docker-compose.yml` is the default compose file.
`docker-compose.prod.yml` is kept as an alias for older deployment scripts:
`docker compose -f docker-compose.prod.yml up -d --build` does the same thing.

First visit: <http://YOUR_VPS_IP/>.

## 4. Data and backups

`./backend/data` is bind-mounted into the API container. It contains:

- `simplify.db` — SQLite database
- `uploads/` — spreadsheet uploads
- `uploads/logos/` — district logos

Back it up before any rebuild or upgrade:

```bash
tar czf s-implify-data-$(date +%F).tar.gz backend/data
```

Restore: stop the stack, unpack, start it again.

## 5. HTTPS (recommended)

Terminate TLS on the host with Caddy or nginx, then proxy to `localhost:80`.
Example Caddyfile:

```caddyfile
s-implify.example.com {
    reverse_proxy localhost:80
}
```

Or put Cloudflare in front and keep only port 80 open to Cloudflare IPs.
The app itself is fully same-origin, so no cookie/domain rewrites are needed.

## 6. Useful commands

```bash
# restart one service
docker compose restart api

# check API from the VPS
curl http://127.0.0.1:8080/health          # only if you publish API_PORT

# rebuild just the web image after a frontend change
docker compose up -d --build web

# stop without deleting data
docker compose down
```

## 7. Local development (unchanged)

```bash
cd backend && npm install && npm start     # http://localhost:8080
cd S-implify-web-prod && npm ci --legacy-peer-deps && npm start   # :4200
```

Dev mode still uses `environment.ts` (`http://localhost:8080/api`). The
production image uses `environment.prod.ts` (`/api`).

## Troubleshooting

- **404 on deep links** (`/dashboard/...`): nginx `try_files` must be present
  (`S-implify-web-prod/nginx.conf`).
- **API requests return nginx 404**: confirm the web container can resolve the
  compose service name `api`, and that `API_PORT=8080` on the API container.
- **Upload fails with 413**: `client_max_body_size` in nginx.conf is 64 MB;
  the API itself accepts 50 MB files.
- **"Provided value cannot be bound to SQLite parameter"**: fixed by
  `normalizeParams()` in `backend/src/db.js` — booleans/undefined are
  converted to 1/0/null before binding.
