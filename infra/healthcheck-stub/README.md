# infra/healthcheck-stub

Minimaler Docker-Container als Platzhalter fuer Subdomains,
deren echte Services noch nicht implementiert sind.

## Zweck

Caddy braucht einen laufenden Upstream-Service, um Anfragen weiterzuleiten.
Solange die echten Apps nicht existieren, antwortet dieser Stub mit einer
einfachen HTML-Seite und einem `/health`-Endpoint.

## Aktueller Einsatz

| Subdomain | Port | Stub bis... |
|---|---|---|
| `setup.prozesspilot.net` | 8082 | T016 Onboarding-Wizard implementiert |
| `chat.prozesspilot.net` | 8083 | Web-Chat-Widget-Task implementiert |

## Abloesung

Sobald die echten Services fertig sind:

1. Den jeweiligen Service in `docker-compose.prod.yml` auf dem entsprechenden Port starten
2. Den Stub-Service (`setup-stub` / `chat-stub`) aus `docker-compose.prod.yml` entfernen
3. Diesen README aktualisieren

Der Stub-Container selbst bleibt im Repo als Fallback-Option.

## Lokaler Test

```bash
cd infra/healthcheck-stub

# Image bauen
docker build -t healthcheck-stub:local .

# Container starten
docker run --rm -p 8082:8080 healthcheck-stub:local

# Health-Check testen
curl http://localhost:8082/health
# Erwartet: {"status":"ok","service":"healthcheck-stub"}

# HTML-Seite testen
curl http://localhost:8082/
# Erwartet: HTML-Seite
```

## Image-Groesse

Basis-Image: `caddy:2-alpine` — ca. 40 MB.
Ziel lt. Spec: unter 50 MB.
