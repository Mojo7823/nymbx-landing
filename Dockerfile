# ── Build stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Cache the npm download cache across builds: repeat builds reuse tarballs
# instead of re-downloading ~1 GB, which also shrinks the window for
# transient registry network failures. (Requires BuildKit, which Zeabur uses.)
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────
FROM caddy:alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Zeabur injects PORT; keep a local default.
ENV PORT=8080
EXPOSE 8080
