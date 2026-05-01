# 05 — Monitoring Checks

Regelmaessige Checks zur Sicherstellung des stabilen Produktivbetriebs.

---

## Taegliche Checks (~5 Minuten)

Jeden Morgen ausfuehren — idealerweise zwischen 08:00 und 09:00 Uhr.

### Check 1: Backup-Status pruefen

```bash
# Letztes Backup-Log auf Fehler pruefen
tail -50 /var/log/pp-backup.log | grep -E "ERROR|WARN|SUCCESS|FAIL"

# Backup-Datei von heute vorhanden?
ls -lh /backup/ | grep "$(date +%Y%m%d)"

# Alternativ: S3-Backup pruefen
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY \
aws s3 ls s3://prozesspilot-receipts/backups/ \
  --endpoint-url $S3_ENDPOINT | tail -5
```

Erwartetes Ergebnis: Mindestens eine Backup-Datei vom heutigen Tag, keine ERROR-Eintraege.

### Check 2: Fehlgeschlagene Belege in den letzten 24h

```sql
-- Fehlgeschlagene Belege zaehlen
SELECT COUNT(*) AS fehler_24h
FROM receipts
WHERE status = 'error'
  AND created_at > now() - interval '24 hours';

-- Fehler nach Typ aufschlusseln
SELECT
  error_message,
  COUNT(*) AS anzahl,
  MIN(created_at) AS erster_fehler,
  MAX(created_at) AS letzter_fehler
FROM receipts
WHERE status = 'error'
  AND created_at > now() - interval '24 hours'
GROUP BY error_message
ORDER BY anzahl DESC;

-- Haengende Belege (extracting > 10 Minuten)
SELECT COUNT(*) AS haengend
FROM receipts
WHERE status = 'extracting'
  AND updated_at < now() - interval '10 minutes';
```

Grenzwerte:
- `fehler_24h` > 10: Ursache untersuchen (Szenario 5 im Playbook)
- `haengend` > 0: Sofort beheben (Szenario 4 im Playbook)

### Check 3: n8n Executions — rote Eintraege?

```bash
# n8n API: fehlgeschlagene Executions der letzten 24h
curl -s "http://localhost:5678/api/v1/executions?status=error&limit=10" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[] | {id, workflowName, startedAt, stoppedAt}'
```

Alternativ: n8n UI oeffnen -> Executions-Tab -> Filter: `Status: Error`.

Erwartetes Ergebnis: Keine roten Executions oder bekannte, bereits behobene Fehler.

### Check 4: System-Health-Check

```bash
#!/usr/bin/env bash
# Schneller Daily Health-Check (< 60 Sekunden)
echo "=== Daily Health Check $(date) ==="

# Backend
echo -n "Backend: "
curl -sf http://localhost:3000/health | jq -r '"Status: " + .status + " | Uptime: " + (.uptime | tostring) + "s"' \
  || echo "FAIL - Backend nicht erreichbar!"

# Datenbank
echo -n "DB:      "
pg_isready -h localhost -p 5432 -U prozesspilot -q \
  && echo "OK - PostgreSQL erreichbar" \
  || echo "FAIL - PostgreSQL nicht erreichbar!"

# MinIO
echo -n "MinIO:   "
curl -sf http://localhost:9000/minio/health/live \
  && echo "OK" \
  || echo "FAIL - MinIO nicht erreichbar!"

# n8n
echo -n "n8n:     "
curl -sf http://localhost:5678/healthz | jq -r '"Status: " + .status' \
  || echo "FAIL - n8n nicht erreichbar!"

echo ""
echo "=== Check abgeschlossen ==="
```

### Check 5: Disk-Auslastung

```bash
# Disk-Nutzung pruefen (Alarm ab > 80%)
df -h | grep -E "/$|/data|/var/lib/postgresql"

# PostgreSQL-Groesse
psql $DATABASE_URL -c "
SELECT pg_size_pretty(pg_database_size('prozesspilot')) AS db_groesse;
"

# MinIO-Nutzung
du -sh /data/minio/ 2>/dev/null || docker exec $(docker-compose ps -q minio) df -h /data
```

Grenzwerte:
- Disk > 80 % belegt: Retention-Cleanup oder Volume-Erweiterung einplanen
- DB > 10 GB: Partitionierung oder Archivierung pruefen

---

## Woechentliche Checks (~15 Minuten)

Jeden Montag ausfuehren — gibt einen Ueberblick ueber die Woche.

### Check 1: Security — npm audit

```bash
cd /opt/prozesspilot/backend
npm audit --audit-level=high

# Automatisch behebbare Schwachstellen fixen
npm audit fix

# Kritische Schwachstellen anzeigen
npm audit --audit-level=critical
```

Erwartetes Ergebnis: 0 kritische Schwachstellen.
Bei `high`-Level Schwachstellen: Ticket erstellen, innerhalb 7 Tage beheben.

```bash
# Auch Webapp-Abhaengigkeiten pruefen
cd /opt/prozesspilot/webapp
npm audit --audit-level=high
```

### Check 2: Datenbank-Groesse und Wachstum

```sql
-- Gesamtgroesse der DB
SELECT pg_size_pretty(pg_database_size('prozesspilot')) AS gesamt;

-- Groesste Tabellen
SELECT
  relname AS tabelle,
  pg_size_pretty(pg_total_relation_size(oid)) AS groesse,
  pg_total_relation_size(oid) AS groesse_bytes
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY groesse_bytes DESC
LIMIT 10;

-- Anzahl Datensaetze pro Tabelle
SELECT
  relname AS tabelle,
  n_live_tup AS anzahl_zeilen
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Belege der letzten 7 Tage
SELECT
  DATE(created_at) AS tag,
  COUNT(*) AS anzahl,
  SUM(total_amount) AS gesamtbetrag
FROM receipts
WHERE created_at > now() - interval '7 days'
GROUP BY DATE(created_at)
ORDER BY tag;
```

### Check 3: Restore-Test Logs

Monatlicher Restore-Test sollte protokolliert sein.

```bash
# Letzten Restore-Test-Log anzeigen
tail -100 /var/log/pp-restore-test.log

# Falls kein Restore-Test diese Woche: jetzt ausfuehren
/opt/prozesspilot/scripts/restore-test.sh 2>&1 | tee -a /var/log/pp-restore-test.log
```

Erwartet: Restore-Test innerhalb der letzten 30 Tage erfolgreich.

### Check 4: Performance — Kurzer Load-Test

```bash
# Smoke-Load-Test: 10 VUs, 30 Sekunden
# (Nur gegen Staging, nicht Produktion!)
cd /opt/prozesspilot/infra/load-tests
BASE_URL=https://staging.prozesspilot.de \
  k6 run --vus 10 --duration 30s scenarios/api-endpoints.js

# Ergebnis: p95 sollte < 500ms sein (gut unter dem 2s-Limit)
```

### Check 5: Tenant-Aktivitaet und Anomalien

```sql
-- Aktive Tenants der letzten 7 Tage
SELECT
  t.name AS tenant,
  COUNT(r.id) AS belege_gesamt,
  COUNT(CASE WHEN r.status = 'error' THEN 1 END) AS fehler,
  ROUND(
    COUNT(CASE WHEN r.status = 'error' THEN 1 END)::numeric
    / NULLIF(COUNT(r.id), 0) * 100, 1
  ) AS fehlerrate_prozent,
  MAX(r.created_at) AS letzter_beleg
FROM tenants t
LEFT JOIN receipts r ON r.tenant_id = t.id
  AND r.created_at > now() - interval '7 days'
GROUP BY t.id, t.name
ORDER BY belege_gesamt DESC;

-- Tenants ohne Aktivitaet (evtl. Problem?)
SELECT t.name
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM receipts r
  WHERE r.tenant_id = t.id
    AND r.created_at > now() - interval '7 days'
)
ORDER BY t.name;
```

### Check 6: SSL-Zertifikate (Ablaufdatum)

```bash
# Zertifikats-Ablaufdatum pruefen
sudo certbot certificates

# Direkt gegen Domain pruefen
echo | openssl s_client -connect api.example.com:443 2>/dev/null \
  | openssl x509 -noout -dates

# Zertifikat laeuft ab in < 30 Tagen?
EXPIRY=$(echo | openssl s_client -connect api.example.com:443 2>/dev/null \
  | openssl x509 -noout -enddate | cut -d= -f2)
echo "Zertifikat laeuft ab: $EXPIRY"
```

Zertifikats-Auto-Renewal laeuft via Certbot-Timer — bei Problemen manuell: `sudo certbot renew`.

---

## Monitoring-Dashboard (Referenz)

Falls Grafana eingerichtet ist:

| Dashboard                  | URL                                   | Check-Intervall |
|----------------------------|---------------------------------------|-----------------|
| API-Latenz                 | https://grafana.example.com/d/api     | taeglich         |
| Fehlerrate                 | https://grafana.example.com/d/errors  | taeglich         |
| DB-Verbindungen            | https://grafana.example.com/d/db      | taeglich         |
| n8n Workflow-Status        | https://n8n.example.com/executions    | taeglich         |
| Disk & Memory              | https://grafana.example.com/d/system  | woechentlich     |

---

## Alert-Schwellenwerte

| Metrik                  | Warnung    | Kritisch    | Aktion                     |
|-------------------------|------------|-------------|----------------------------|
| API p95-Latenz          | > 1000ms   | > 2000ms    | Szenario 1 im Playbook     |
| Fehlerrate              | > 1 %      | > 5 %       | Szenario 5 im Playbook     |
| Disk-Nutzung            | > 70 %     | > 85 %      | Cleanup / Erweiterung      |
| DB-Verbindungen         | > 80 Max   | > 95 Max    | Connection-Pool pruefen    |
| Backup-Alter            | > 25h      | > 48h       | Backup-Skript debuggen     |
| Haengende Belege        | > 0        | > 5         | Szenario 4 im Playbook     |

---

## Automatisierung der Checks

Das taegliche Check-Skript kann via Cron automatisiert werden:

```bash
# Crontab-Eintrag fuer taeglichen Report (08:05 Uhr)
# crontab -e
5 8 * * * /opt/prozesspilot/scripts/daily-check.sh >> /var/log/pp-daily-check.log 2>&1

# Wochentlicher Report (Montag, 08:00 Uhr)
0 8 * * 1 /opt/prozesspilot/scripts/weekly-check.sh >> /var/log/pp-weekly-check.log 2>&1
```

Skript-Pfade: `/opt/prozesspilot/scripts/daily-check.sh` (noch zu erstellen, Befehle aus diesem Dokument)
