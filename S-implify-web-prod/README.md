# S-Implify Web

S-Implify is an Angular dashboard for district, campus, teacher, and student
performance analytics. It includes growth, attendance, CCMR, standards,
administrative setup, and data-upload workflows.

## Technology

- Angular 21 and TypeScript
- Tailwind CSS
- ApexCharts
- RxJS
- Docker Compose for local development

## Prerequisites

- Node.js 22+
- npm
- An S-Implify API instance (the local configuration expects port `8080`)
- Docker and Docker Compose (optional)

## Local development

Install dependencies:

```bash
npm ci --legacy-peer-deps
```

Start the development server:

```bash
npm start
```

Open <http://localhost:4200>. The application reloads when source files
change.

## Production deployment

Build a single-origin production stack (nginx + API) instead:

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

The Angular bundle is built into an nginx image, served on port 80, and
`/api/*` is proxied to the backend container. `environment.prod.ts` uses the
relative `/api` base and real APIs (no mocks). See `deploy/README.md` for VPS
setup, TLS, backups, and troubleshooting.

## Docker development

Build and start the development container:

```bash
docker compose up -d --build
```

The application is available at <http://localhost:4200>. Source files are
mounted into the container and watched for changes.

Useful commands:

```bash
docker compose logs -f web
docker compose down
```

## API configuration

API and authentication URLs are configured in:

- `src/environments/environment.ts` for local development
- `src/environments/environment.prod.ts` for production builds

The default local endpoints are:

```text
API:  http://localhost:8080/api
Auth: http://localhost:8080/api/auth
```

Set `mockBusinessApis` to `true` only when working on the UI without a
backend. Do not commit credentials or access tokens to environment files.

## Available scripts

```bash
npm start       # Start the development server and open the browser
npm run build   # Create a production build in dist/
npm run watch   # Continuously build using the development configuration
npm test        # Run the Karma/Jasmine test suite
```

## Main application areas

- District growth dashboard with category, campus, teacher, and student drill-downs
- Campus and individual attendance analytics
- CCMR and student standards reporting
- Student records with filtering and export
- Data uploads and upload-history management
- Administrative setup for districts, campuses, categories, grades, and cut scores

## Project structure

```text
src/app/core/       API models, services, guards, and shared state
src/app/features/   Feature pages and feature routes
src/app/layouts/    Header, sidebar, and application layout
src/app/shared/     Shared modules, components, and icons
src/environments/   Development and production configuration
```

## Production build

```bash
npm run build
```

The optimized output is written to `dist/`. Production deployments must
support Angular client-side route fallback to `index.html`.
