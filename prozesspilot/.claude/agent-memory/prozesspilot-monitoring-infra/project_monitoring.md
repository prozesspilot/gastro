---
name: Monitoring Stack — Sentry + Prometheus + Grafana
description: Vollstaendige Konfiguration des Task-501-Monitoring-Stacks: Pfade, Metriken-Schema, Docker-Setup
type: project
---

## Sentry

- SDK: `@sentry/node` + `@sentry/profiling-node` (v10.51.x)
- Initialisierung: `src/core/sentry.ts` — `initSentry()` ganz oben in `server.ts` vor allem anderen
- captureException() im Error-Handler (app.ts) fuer alle 5xx-Fehler
- Env-Vars: `SENTRY_DSN`, `APP_VERSION`
- Graceful degradation: ohne SENTRY_DSN vollstaendig deaktiviert

## Prometheus

- SDK: `prom-client` v15.x
- Konfiguration: `src/core/metrics.ts`
- Registry: eigene Instanz (`new Registry()`), `collectDefaultMetrics({ prefix: 'pp_' })`
- Endpoint: `GET /metrics` (kein Auth, Root-Level, nicht unter /api/v1)

### Metriken-Schema (Prefix: pp_)

| Name | Typ | Labels |
|------|-----|--------|
| `pp_receipts_processed_total` | Counter | status, tenant_id |
| `pp_receipt_processing_duration_seconds` | Histogram | module |
| `pp_receipts_active` | Gauge | tenant_id |
| `pp_http_request_duration_seconds` | Histogram | method, route, status_code |
| `pp_http_requests_total` | Counter | method, route, status_code |
| `pp_nodejs_*` | diverse | Default-Metriken |

- HTTP-Metriken werden in onRequest/onResponse-Hooks in app.ts gesetzt
- `/metrics` selbst wird aus der Messung ausgeschlossen

## Grafana + Docker-Compose

- Infra-Root: `/Users/donandrejo/Documents/ProzessPilot/infra/monitoring/`
- `docker-compose.yml`: Prometheus (port 9090) + Grafana (port 3001, intern 3000)
- Prometheus scraped Backend ueber `host.docker.internal:3000/metrics`
- Grafana Provisioning: datasources + dashboards als YAML/JSON in `grafana/provisioning/`
- Dashboard-UID: `pp-overview-v1`, 6 Panels

### Grafana-Zugangsdaten

- Admin-User: `admin`
- Default-Passwort: `prozesspilot` (ueber `GRAFANA_ADMIN_PASSWORD` Env ueberschreiben)
- GF_USERS_ALLOW_SIGN_UP: false

**Why:** Monitoring wurde als Task 501 (Phase 4 Hardening) implementiert.
**How to apply:** Neue business-spezifische Metriken immer in `src/core/metrics.ts` hinzufuegen und in den relevanten Modulen importieren.
