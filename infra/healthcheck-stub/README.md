# infra/healthcheck-stub

Minimaler Docker-Container als Platzhalter fuer Subdomains,
deren echte Services noch nicht implementiert sind.

## Zweck

Caddy braucht einen laufenden Upstream-Service, um Anfragen weiterzuleiten.
Solange die echten Apps nicht existieren, antwortet dieser Stub mit einer
einfachen HTML-Seite und einem `/health`-Endpoint.

## Aktueller Einsatz

Ein einziger Container (`stubs`-Service in `docker-compose.prod.yml`) hört
auf Port 8080 und bekommt zwei Port-Bindings:

| Subdomain | Host-Port | Stub bis... |
|---|---|---|
| `setup.prozesspilot.net` | 127.0.0.1:8082 → :8080 | T016 Onboarding-Wizard implementiert |
| `chat.prozesspilot.net` | 127.0.0.1:8083 → :8080 | Web-Chat-Widget-Task implementiert |

## Abloesung

Sobald die echten Services fertig sind:

1. Den jeweiligen Service in `docker-compose.prod.yml` auf dem entsprechenden Port starten
2. Das entsprechende Port-Binding aus dem `stubs`-Service entfernen
   (oder den ganzen Service löschen, falls beide echten Services existieren)
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
