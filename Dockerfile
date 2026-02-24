FROM caddy:2.8-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html /srv/index.html

EXPOSE 8080
