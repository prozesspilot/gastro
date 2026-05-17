# 03 — On-Call Playbook

Jedes Szenario folgt dem Format:
**Symptom** -> **Diagnose** -> **Loesung** -> **Eskalation**

Ziel: jedes Szenario in < 15 Minuten loesen, ohne den Lead zu wecken.

---

## Szenario 1: Backend antwortet nicht (502 / 504)

### Symptom
- Nginx gibt 502 Bad Gateway oder 504 Gateway Timeout zurueck
- Health-Check schlaegt fehl: `curl https://api.example.com/health`
- Nutzer melden "API nicht erreichbar"

### Diagnose

```bash
# 1. Prozess-Status pruefen
pm2 status
# oder Docker:
docker-compose ps backend

# 2. Port 3000 belegt?
netstat -tlnp | grep :3000
# oder:
ss -tlnp | grep :3000

# 3. Backend-Logs anschauen
pm2 logs pp-backend --lines 100
# oder Docker:
docker-compose logs --tail=100 backend

# 4. Fehlerursache identifizieren
pm2 logs pp-backend --lines 200 | grep -i "error\|fatal\|crash"

# 5. Speicher pruefen (OOM?)
free -h
dmesg | tail -20 | grep -i oom
```

### Loesung

```bash
# Option A: PM2-Neustart (einfachster Fall)
pm2 restart pp-backend
pm2 logs pp-backend --lines 30  # Neustart-Logs pruefen

# Option B: Docker-Neustart
docker-compose restart backend
docker-compose logs --tail=30 backend

# Option C: Vollstaendiger Neustart (wenn OOM oder Deadlock)
pm2 stop pp-backend
sleep 2
pm2 start pp-backend

# Option D: Container neu aufbauen (bei Image-Problemen)
docker-compose stop backend
docker-compose up -d --no-deps backend

# Verification
curl -f https://api.example.com/health
```

### Eskalation
Wenn Backend nach 3 Neustartversuchen nicht stabil bleibt (immer wieder crasht):
- Log-Output sichern: `pm2 logs pp-backend --lines 500 > /tmp/backend-crash.log`
- Lead anrufen
- Ggf. Rollback auf letzte stabile Version (siehe 02_rollback.md)

---

## Szenario 2: Datenbank-Verbindung verloren

### Symptom
- Backend-Logs: `Error: connect ECONNREFUSED 127.0.0.1:5432`
- Health-Check: `{"status":"error","db":"disconnected"}`
- Alle Endpunkte geben 500 zurueck

### Diagnose

```bash
# 1. PostgreSQL-Prozess pruefen
pg_isready -h localhost -p 5432 -U prozesspilot
# Erwartete Antwort: "localhost:5432 - accepting connections"

# 2. PostgreSQL-Service-Status
sudo systemctl status postgresql
# oder Docker:
docker-compose ps db

# 3. PostgreSQL-Logs
sudo tail -50 /var/log/postgresql/postgresql-16-main.log
# oder Docker:
docker-compose logs --tail=50 db

# 4. Aktive Verbindungen pruefen
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE datname='prozesspilot';"

# 5. Connection-Pool Erschoepfung?
psql $DATABASE_URL -c "SHOW max_connections;"
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# 6. Disk voll? (haeufige Ursache bei PostgreSQL-Crash)
df -h /var/lib/postgresql/
```

### Loesung

```bash
# Option A: PostgreSQL-Dienst neu starten
sudo systemctl restart postgresql
sleep 3
pg_isready -h localhost -p 5432

# Option B: Docker-DB-Container neu starten
docker-compose restart db
docker-compose logs --tail=20 db

# Option C: Connection-Pool im Backend zuruecksetzen
# Backend neu starten schliesst alle Pool-Verbindungen:
pm2 restart pp-backend

# Option D: Zombie-Verbindungen manuell beenden (wenn Pool erschoepft)
psql $DATABASE_URL -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'prozesspilot'
  AND pid <> pg_backend_pid()
  AND state = 'idle'
  AND state_change < now() - interval '10 minutes';
"

# Verification
pg_isready -h localhost -p 5432 -U prozesspilot
curl -f https://api.example.com/health
```

### Eskalation
Wenn PostgreSQL nicht startet oder Datenbankdateien beschaedigt sind:
- SOFORT Lead anrufen
- Kein weiteres Schreiben auf DB-Volume
- Backup-Restore vorbereiten (siehe 02_rollback.md, Abschnitt 2)

---

## Szenario 3: n8n Workflow laeuft nicht durch

### Symptom
- Belege bleiben in Status `received` oder `extracting` haengen
- n8n UI zeigt rote Executions
- Nutzer melden: Belege werden nicht verarbeitet

### Diagnose

```bash
# 1. n8n-Service-Status
pm2 status n8n
# oder Docker:
docker-compose ps n8n

# 2. n8n erreichbar?
curl -s http://localhost:5678/healthz | jq .

# 3. Letzten Fehler in der UI anschauen:
#    n8n UI -> Executions -> Filter: "Error" -> letzten Fehler anschauen
#    URL: https://n8n.example.com/executions

# 4. n8n-Logs
pm2 logs n8n --lines 100
# oder Docker:
docker-compose logs --tail=100 n8n

# 5. Webhook erreichbar?
curl -X POST https://api.example.com/webhook/receipt-upload \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# 6. Haengende Belege zaehlen
psql $DATABASE_URL -c "
SELECT status, COUNT(*)
FROM receipts
WHERE updated_at > now() - interval '2 hours'
GROUP BY status;
"
```

### Loesung

```bash
# Option A: Workflow manuell triggern
#    n8n UI -> Workflow oeffnen -> "Execute Workflow" klicken

# Option B: n8n-Dienst neu starten
pm2 restart n8n
# oder Docker:
docker-compose restart n8n
sleep 10
curl -s http://localhost:5678/healthz | jq .

# Option C: Webhook-URL pruefen und ggf. aktualisieren
#    n8n UI -> Webhook-Node -> Webhook-URL kopieren
#    Backend .env pruefen: N8N_WEBHOOK_URL=...

# Option D: Haengende Belege manuell re-triggern
psql $DATABASE_URL -c "
UPDATE receipts
SET status = 'received', updated_at = now()
WHERE status = 'extracting'
  AND updated_at < now() - interval '10 minutes';
"
# Danach n8n Workflow erneut aktivieren

# Verification: Beleg durch Pipeline schicken
# Einen echten Test-Beleg als WhatsApp-Nachricht senden
# Dann Status pruefen:
psql $DATABASE_URL -c "
SELECT id, status, updated_at
FROM receipts
ORDER BY updated_at DESC
LIMIT 5;
"
```

### Eskalation
Wenn Workflow-Fehler auf fehlendem Claude API-Key oder Lexoffice-Problem beruhen:
- Claude API-Key im Backend `.env` pruefen: `ANTHROPIC_API_KEY=sk-ant-...`
- Rate-Limit pruefen: Claude Dashboard -> Usage
- Lead informieren bei anhaltendem API-Ausfall

---

## Szenario 4: Beleg steckt in Status "extracting" fest

### Symptom
- Spezifische Belege verbleiben dauerhaft in Status `extracting`
- Kein Fehler in n8n Executions sichtbar
- Betroffen: einzelne oder mehrere Belege

### Diagnose

```bash
# 1. Haengende Belege identifizieren
psql $DATABASE_URL -c "
SELECT id, tenant_id, status, created_at, updated_at,
       (now() - updated_at) AS haengt_seit
FROM receipts
WHERE status = 'extracting'
  AND updated_at < now() - interval '10 minutes'
ORDER BY updated_at ASC;
"

# 2. Letzten Verarbeitungsversuch fuer spezifischen Beleg pruefen
psql $DATABASE_URL -c "
SELECT id, status, error_message, processing_attempts, updated_at
FROM receipts
WHERE id = 'RECEIPT_UUID_HIER'
"

# 3. n8n Execution fuer diesen Beleg suchen
#    n8n UI -> Executions -> Suche nach der Receipt-ID

# 4. S3-Datei vorhanden?
aws s3 ls s3://prozesspilot-receipts/RECEIPT_UUID --endpoint-url http://localhost:9000
```

### Loesung

```bash
# Option A: Beleg zurueck auf "received" setzen (loest Re-Trigger aus)
psql $DATABASE_URL -c "
UPDATE receipts
SET status = 'received',
    updated_at = now(),
    processing_attempts = COALESCE(processing_attempts, 0) + 1
WHERE id = 'RECEIPT_UUID_HIER'
  AND status = 'extracting';
"

# Option B: Alle haengenden Belege auf einmal zuruecksetzen
psql $DATABASE_URL -c "
UPDATE receipts
SET status = 'received', updated_at = now()
WHERE status = 'extracting'
  AND updated_at < now() - interval '15 minutes';
"

# Option C: Beleg manuell auf 'error' setzen (wenn nicht mehr bergbar)
psql $DATABASE_URL -c "
UPDATE receipts
SET status = 'error',
    error_message = 'Manuell auf error gesetzt nach haengendem extracting-Status',
    updated_at = now()
WHERE id = 'RECEIPT_UUID_HIER';
"

# Verification
psql $DATABASE_URL -c "
SELECT id, status, updated_at FROM receipts WHERE id = 'RECEIPT_UUID_HIER';
"
```

### Eskalation
Wenn > 10 Belege gleichzeitig haengen: systematisches Problem.
- n8n komplett neu starten
- Ggf. Claude API-Verfuegbarkeit pruefen
- Lead informieren

---

## Szenario 5: Hohe Fehlerrate bei Kategorisierung

### Symptom
- Viele Belege in Status `error` mit Kategorisierungs-Fehlern
- Nutzer melden: Belege werden falsch oder gar nicht kategorisiert
- Alerting schlaegt an: error rate > threshold

### Diagnose

```bash
# 1. Fehlertypen analysieren
psql $DATABASE_URL -c "
SELECT error_type, COUNT(*) AS anzahl,
       MAX(created_at) AS letzter_fehler
FROM receipt_errors
WHERE created_at > now() - interval '24 hours'
GROUP BY error_type
ORDER BY anzahl DESC;
"

# Falls keine receipt_errors-Tabelle:
psql $DATABASE_URL -c "
SELECT error_message, COUNT(*) AS anzahl
FROM receipts
WHERE status = 'error'
  AND updated_at > now() - interval '24 hours'
GROUP BY error_message
ORDER BY anzahl DESC;
"

# 2. Claude API Status pruefen
curl -s https://status.anthropic.com/api/v2/status.json | jq .status.description

# 3. Rate-Limit pruefen (Backend-Logs)
pm2 logs pp-backend --lines 200 | grep -i "rate.limit\|429\|anthropic"

# 4. API-Key gueltig?
curl -s https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" | jq .
```

### Loesung

```bash
# Option A: Fehlerhafte Belege zum Re-Versuch freigeben
psql $DATABASE_URL -c "
UPDATE receipts
SET status = 'received',
    error_message = NULL,
    updated_at = now()
WHERE status = 'error'
  AND updated_at > now() - interval '24 hours'
  AND error_message ILIKE '%rate_limit%'
;"

# Option B: API-Key erneuern
# 1. Neuen Key in Anthropic Console erstellen
# 2. .env aktualisieren: ANTHROPIC_API_KEY=sk-ant-NEW-KEY
# 3. Backend neu starten:
pm2 restart pp-backend

# Option C: Rate-Limit abwarten
# Claude API Rate-Limits: typischerweise 1-5 Minuten warten
# Dann haengende Belege wie Option A freigeben

# Option D: Kategorisierungs-Prompt pruefen
#    n8n UI -> Kategorisierungs-Workflow -> Claude-Node -> Prompt anschauen
#    Haeufige Fehler: Prompt zu lang, ungueltiges JSON-Format erwartet

# Verification
psql $DATABASE_URL -c "
SELECT status, COUNT(*)
FROM receipts
WHERE updated_at > now() - interval '30 minutes'
GROUP BY status;
"
```

### Eskalation
Bei anhaltendem Claude API-Ausfall (> 30 Min):
- Anthropic Status-Page pruefen: https://status.anthropic.com
- Fallback-Kategorisierung aktivieren (einfaches Keyword-Matching als Notloesung)
- Nutzer per Status-Page informieren
- Lead anrufen

---

## Szenario 6: S3 / MinIO nicht erreichbar

### Symptom
- Upload-Endpunkt gibt 500 zurueck: "Storage-Fehler"
- Backend-Logs: `Error: connect ECONNREFUSED` oder `S3ServiceException`
- Belege koennen nicht gespeichert oder abgerufen werden

### Diagnose

```bash
# 1. MinIO-Dienst pruefen
docker-compose ps minio
# oder PM2:
pm2 status minio

# 2. MinIO-Endpunkt direkt testen
curl -s http://localhost:9000/minio/health/live
# Erwartete Antwort: HTTP 200

# 3. AWS CLI Bucket-Zugriff testen
aws s3 ls s3://prozesspilot-receipts \
  --endpoint-url http://localhost:9000 \
  --no-sign-request 2>&1 | head -5

# Mit Credentials:
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY \
aws s3 ls s3://prozesspilot-receipts \
  --endpoint-url http://localhost:9000

# 4. MinIO-Logs
docker-compose logs --tail=50 minio

# 5. Disk-Platz auf MinIO-Volume pruefen
df -h /data/minio
docker exec $(docker-compose ps -q minio) df -h /data

# 6. MinIO-Credentials in .env korrekt?
grep S3_ /opt/prozesspilot/backend/.env
```

### Loesung

```bash
# Option A: MinIO-Container neu starten
docker-compose restart minio
sleep 5
curl -s http://localhost:9000/minio/health/live

# Option B: Vollstaendiger MinIO-Neustart
docker-compose stop minio
docker-compose up -d minio
docker-compose logs --tail=20 minio

# Option C: Bucket existiert nicht mehr (nach erneutem Container-Start)
docker exec $(docker-compose ps -q minio) \
  mc alias set local http://localhost:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
docker exec $(docker-compose ps -q minio) \
  mc mb --ignore-existing local/prozesspilot-receipts

# Option D: Credentials falsch — .env aktualisieren
# S3_ACCESS_KEY und S3_SECRET_KEY pruefen und ggf. korrigieren
# Dann Backend neu starten:
pm2 restart pp-backend

# Option E: Disk voll
# Alten/unnoetigen MinIO-Content loeschen
docker exec $(docker-compose ps -q minio) \
  mc rm --recursive --force local/prozesspilot-receipts/tmp/

# Oder: Retention-Policy pruefen und alte Dateien aufraeumen

# Verification
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY \
aws s3 ls s3://prozesspilot-receipts \
  --endpoint-url $S3_ENDPOINT

# Test-Upload
echo "test" > /tmp/test-upload.txt
AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=$S3_SECRET_KEY \
aws s3 cp /tmp/test-upload.txt s3://prozesspilot-receipts/test-upload.txt \
  --endpoint-url $S3_ENDPOINT
echo "Upload erfolgreich"
```

### Eskalation
Bei korruptem MinIO-Volume oder dauerhaftem Storage-Ausfall:
- SOFORT alle Uploads stoppen (Nginx-Rule hinzufuegen)
- Lead anrufen
- Ggf. auf AWS S3 als temporaeren Fallback umschalten (`.env` anpassen)
- Daten-Integritaet des MinIO-Volumes pruefen

---

## Eskalations-Matrix

| Schweregrad | Situation                              | Aktion                    |
|-------------|----------------------------------------|---------------------------|
| P1 (kritisch) | Datenverlust, Auth-Bypass, kompletter Ausfall > 10 Min | Lead sofort anrufen |
| P2 (hoch)     | Fehlerrate > 10 %, DB nicht erreichbar, alle Uploads fehlschlagen | Lead per Slack, 15 Min warten dann anrufen |
| P3 (mittel)   | Einzelne Tenants betroffen, n8n instabil | Lead per Slack, im naechsten Stand-up besprechen |
| P4 (niedrig)  | Einzelne haengende Belege, Kategorisierungs-Fehler < 5% | Selbst beheben, im Daily erwaehnen |
