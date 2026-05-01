# ProzessPilot Load Tests

k6-basierte Lasttests fuer das ProzessPilot Backend.
Ziel: **p95 < 2 Sekunden** bei 100 gleichzeitigen Benutzern.

## Voraussetzungen

### k6 installieren

```bash
# macOS (Homebrew)
brew install k6

# Linux (APT)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker
docker pull grafana/k6
```

k6-Version pruefen: `k6 version` (benoetigt >= 0.45.0)

### Test-PDF generieren

```bash
chmod +x fixtures/generate-test-pdf.sh
./fixtures/generate-test-pdf.sh
```

Alternativ: Eigene PDF-Datei als `fixtures/test-receipt.pdf` ablegen.

## Tests ausfuehren

### Upload-Test (100 gleichzeitige Uploads)

```bash
npm run test:upload
# oder direkt:
k6 run scenarios/upload-receipts.js
```

### API-Endpunkt-Test (50 VUs, GET-Requests)

```bash
npm run test:api
# oder direkt:
k6 run scenarios/api-endpoints.js
```

### Stress-Test (200 VUs)

```bash
npm run test:stress
# oder direkt:
k6 run --vus 200 --duration 60s scenarios/upload-receipts.js
```

## Gegen andere Umgebungen testen

```bash
# Staging
BASE_URL=https://staging.prozesspilot.de npm run test:upload

# Mit spezifischem Tenant
BASE_URL=https://api.prozesspilot.de TENANT_ID=tenant-uuid-hier npm run test:api

# Mit Auth-Key
BASE_URL=https://api.prozesspilot.de AUTH_KEY=mein-hmac-key npm run test:upload
```

Alle Umgebungsvariablen:

| Variable    | Default               | Bedeutung                          |
|-------------|-----------------------|------------------------------------|
| `BASE_URL`  | `http://localhost:3000` | Backend-Basis-URL                |
| `TENANT_ID` | `test-tenant-001`     | X-Tenant-ID Header-Wert            |
| `AUTH_KEY`  | `dev-hmac-key`        | HMAC-Key (fuer spaetere HMAC-Auth) |

## Ergebnisse interpretieren

Nach einem Test gibt k6 eine Zusammenfassung aus:

```
checks.........................: 98.50%  9850 / 10000
data_received..................: 45 MB   750 kB/s
data_sent......................: 12 MB   200 kB/s
http_req_duration..............: avg=450ms  min=120ms  med=380ms  max=3200ms  p(90)=900ms  p(95)=1250ms  p(99)=2100ms
http_req_failed................: 1.50%   150 out of 10000
```

### Wichtige Metriken

| Metrik              | Beschreibung                                   | Zielwert    |
|---------------------|------------------------------------------------|-------------|
| `p(95)`             | 95 % aller Requests schneller als dieser Wert  | **< 2000ms** |
| `p(99)`             | 99 % aller Requests schneller als dieser Wert  | < 5000ms    |
| `http_req_failed`   | Anteil fehlgeschlagener Requests               | **< 1 %**   |
| `upload_errors`     | Fehlgeschlagene Uploads (kein 201 / kein id)   | 0           |
| `processing_time_ms`| End-to-End Upload-Latenz                       | p95 < 2000  |

### Thresholds

Die Tests schlagen fehl (Exit-Code != 0), wenn:
- `p(95)` der `http_req_duration` >= 2000ms
- `http_req_failed` rate >= 1 %

Im CI kann damit ein Build blockiert werden, wenn Performance-Regressionen auftreten.

### Bottleneck-Identifikation

Wenn p95 zu hoch ist, typische Ursachen:

1. **n8n-Workflow zu langsam**: n8n Executions-Log pruefen, ggf. Workflow parallelisieren
2. **DB-Queries nicht indiziert**: `EXPLAIN ANALYZE` auf die langsamsten Queries
3. **Claude API Rate-Limit**: Kategorisierungs-Queue pruefen, Retry-Delays reduzieren
4. **S3/MinIO Upload-Latenz**: Direkten Upload testen (`aws s3 cp test.pdf s3://bucket/`)
5. **Connection-Pool erschoepft**: `pg_stat_activity` auf wartende Verbindungen pruefen

## Szenario-Beschreibung

### upload-receipts.js

- Executor: `ramping-vus` (Ramp-Up → Hold → Ramp-Down)
- Phase 1: 0 → 100 VUs in 30 Sekunden
- Phase 2: 100 VUs fuer 60 Sekunden (Steady State)
- Phase 3: 100 → 0 VUs in 20 Sekunden
- Gesamt-Laufzeit: ~110 Sekunden

### api-endpoints.js

- Executor: Fixed VUs (50)
- Dauer: 60 Sekunden
- Testet: List → Detail → Stats (in Reihenfolge)
- Misst separate Latenz-Metriken je Endpunkt

## CI/CD Integration

```yaml
# .github/workflows/load-test.yml (Beispiel)
- name: Run Load Tests (Smoke)
  run: |
    k6 run --vus 10 --duration 30s scenarios/upload-receipts.js
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
    TENANT_ID: ${{ secrets.LOAD_TEST_TENANT }}
```
