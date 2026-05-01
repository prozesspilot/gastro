# infra/

Infrastruktur-Konfigurationen für ProzessPilot.

## Geplante Inhalte (folgen in späteren Deliverables)

| Verzeichnis    | Inhalt                                   | Deliverable |
|----------------|------------------------------------------|-------------|
| `caddy/`       | Caddyfile für TLS-Terminierung + Routing | Phase 2     |
| `grafana/`     | Dashboards für Loki + Metriken           | Phase 4     |
| `prometheus/`  | Scrape-Konfiguration                     | Phase 4     |

## Jetzt genutzt

`../docker-compose.yml` im Repo-Root startet die lokale Dev-Infrastruktur:
- Postgres 16 auf `:5432`
- Redis 7 auf `:6379`
- MinIO auf `:9000` (Konsole: `:9001`)
- n8n auf `:5678`
