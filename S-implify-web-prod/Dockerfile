# ── S-Implify web (Angular 21 → static files → nginx) ──────────────────────
# Stage 1: build the production bundle.
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
# The Angular 21 dependency graph needs legacy peer resolution (see README).
RUN npm ci --legacy-peer-deps && npm cache clean --force

COPY . .
RUN npm run build -- --configuration production

# Stage 2: serve the static bundle and proxy /api to the backend container.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
