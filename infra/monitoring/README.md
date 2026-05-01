# ProzessPilot Monitoring Stack

Prometheus + Grafana fuer lokale Entwicklung und Staging.

## Starten

```bash
cd /Users/donandrejo/Documents/ProzessPilot/infra/monitoring
docker-compose up -d
```

## Zugriff

- Grafana: http://localhost:3001 (Benutzer: `admin` / Passwort: `prozesspilot`)
- Prometheus: http://localhost:9090

## Voraussetzungen

- Backend laeuft auf Port 3000 und exponiert `/metrics`
- Docker Desktop mit aktiviertem `host.docker.internal` (macOS/Windows: automatisch)
- Linux: `extra_hosts: ["host.docker.internal:host-gateway"]` in docker-compose.yml ergaenzen

## Produktion: Passwort setzen

```bash
# .env Datei im infra/monitoring/ Verzeichnis anlegen:
GRAFANA_ADMIN_PASSWORD=sicheres-passwort-hier
```

## Alerting

Grafana Alerting ueber die UI konfigurieren:

1. Grafana oeffnen > Alerting > Alert Rules
2. Neue Regel: Fehlerrate > 5% fuer 5 Minuten
3. Notification Channel konfigurieren (E-Mail, Slack, PagerDuty)

Empfohlene Alert-Regeln:
- `rate(pp_http_requests_total{status_code=~"5.."}[5m]) / rate(pp_http_requests_total[5m]) > 0.05` — Fehlerrate > 5%
- `histogram_quantile(0.95, rate(pp_http_request_duration_seconds_bucket[5m])) > 2` — p95 Latenz > 2s
- `pp_nodejs_heap_size_used_bytes > 400000000` — Heap > 400MB

## Metriken-Schema

Alle Custom-Metriken nutzen das Prefix `pp_` (ProzessPilot):

| Metrik | Typ | Beschreibung |
|--------|-----|--------------|
| `pp_receipts_processed_total` | Counter | Verarbeitete Belege (Labels: status, tenant_id) |
| `pp_receipt_processing_duration_seconds` | Histogram | Verarbeitungszeit pro Beleg (Labels: module) |
| `pp_receipts_active` | Gauge | Belege aktuell in Verarbeitung (Labels: tenant_id) |
| `pp_http_request_duration_seconds` | Histogram | HTTP Request Dauer (Labels: method, route, status_code) |
| `pp_http_requests_total` | Counter | Anzahl HTTP Requests (Labels: method, route, status_code) |
| `pp_nodejs_*` | diverse | Node.js Default-Metriken (via collectDefaultMetrics) |
