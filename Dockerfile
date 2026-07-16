# ── Build stage ──────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────
FROM caddy:alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Zeabur injects PORT; keep a local default.
ENV PORT=8080
EXPOSE 8080
