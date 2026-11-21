# ── S-Implify API (Express + node:sqlite) ──────────────────────────────────
# node:sqlite is built into Node 22.5+, so there is no native module to compile.
FROM node:22-alpine

ENV NODE_ENV=production \
    API_PORT=8080 \
    SIMPLIFY_DB_PATH=/app/data/simplify.db

WORKDIR /app

# Dependencies first for layer caching.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code only — data/ is provided by a volume at runtime.
COPY src ./src

# SQLite database + uploaded files live here; mount a volume on /app/data.
RUN mkdir -p /app/data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
