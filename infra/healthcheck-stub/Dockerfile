# Healthcheck-Stub-Container
#
# Minimaler Container auf Basis caddy:2-alpine (<50 MB).
# Wird als Platzhalter für setup.prozesspilot.net und chat.prozesspilot.net
# verwendet, bis die echten Services implementiert sind.
#
# Wird ersetzt durch:
#   setup.* → Onboarding-Wizard (T016)
#   chat.*  → Web-Chat-Widget (spätere Task)

FROM caddy:2-alpine

COPY healthcheck.html /usr/share/caddy/index.html
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
