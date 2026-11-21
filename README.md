# S-Implify

Angular 21 + Express/SQLite analytics portal for district, campus, teacher and
student performance. Deployed as a single Docker Compose stack (nginx frontend +
Node API) on Coolify.

## Run locally

```bash
cd backend && npm install && npm start          # API on :8080
cd S-implify-web-prod && npm ci --legacy-peer-deps && npm start   # web on :4200
```

Login: `admin@s-implify.local` / `Admin@123` → select a role (SuperAdmin).

## Deploy

The root `docker-compose.yml` defines two services:

- `web` — Angular production build served by nginx, public via Coolify proxy
- `api` — Express + SQLite on port 8080, reachable from nginx as `api:8080`

In Coolify: Build pack = **Docker Compose**, Compose file = `/docker-compose.yml`,
Base directory = `/`. Add a domain pointing to service `web`, port `80`.

Pushes to `main` trigger `.github/workflows/coolify-deploy.yml`, which calls the
Coolify deploy webhook using the repository secrets `COOLIFY_WEBHOOK` and
`COOLIFY_TOKEN`.
