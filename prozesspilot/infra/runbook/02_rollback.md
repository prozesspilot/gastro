# 02 — Rollback-Anleitung

Vorgehen bei einem notwendigen Rollback nach einem fehlgeschlagenen Deployment
oder kritischem Produktionsfehler.

---

## Wann ist ein Rollback noetig?

Rollback sofort einleiten, wenn:

- [ ] Health-Check schlaegt nach Deployment fehl (`curl /health` gibt != 200)
- [ ] Fehlerrate > 5 % in den ersten 10 Minuten nach Deployment
- [ ] Kritischer Bug in der Produktion entdeckt (Datenverlust, Auth-Bypass, etc.)
- [ ] Migration schlaegt fehl oder beschaedigt Daten
- [ ] p95-Latenz > 5 Sekunden ueber mehr als 2 Minuten

**Entscheidungsgrundlage**: Wenn unklar, ob Rollback noetig — immer den Lead
kontaktieren, bevor ein DB-Rollback ausgefuehrt wird.

---

## 1. Code-Rollback (Backend)

### Via Docker-Compose (empfohlen)

```bash
# Aktuelles Image-Tag pruefen
docker-compose images backend

# Auf letztes stabiles Image zurueckwechseln
# DECISION: Image-Tags im Format YYYY-MM-DD-GITHASH verwalten
docker-compose stop backend
docker-compose pull backend:stable   # oder: backend:2026-04-30-abc1234
docker-compose up -d backend

# Oder: explizites Image-Tag setzen
IMAGE_TAG=2026-04-30-abc1234 docker-compose up -d backend

# Status pruefen
docker-compose ps backend
docker-compose logs --tail=30 backend
```

### Via PM2 (ohne Docker)

```bash
# Letzten stabilen Release-Stand pruefen
git log --oneline -10

# Auf letzten stabilen Commit wechseln
git fetch origin
git checkout COMMIT_HASH

# Backend neu bauen und starten
cd backend
npm ci --omit=dev
npm run build
pm2 restart pp-backend

# Logs pruefen
pm2 logs pp-backend --lines 50
```

### Smoke-Test nach Code-Rollback

```bash
# 1. Health-Check
curl -f https://api.example.com/health

# 2. Version pruefen
curl https://api.example.com/health | jq .version

# 3. Kurzer API-Test
curl -H "X-Tenant-ID: test" https://api.example.com/api/v1/receipts
```

---

## 2. Datenbank-Rollback

**WARNUNG**: DB-Rollbacks koennen zu Datenverlust fuehren. Immer zuerst
ein aktuelles Backup erstellen, bevor eine Migration rueckgaengig gemacht wird.

### Vor jedem Deployment: Backup erstellen

```bash
# Manuelles Backup vor Deployment (IMMER ausfuehren!)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL -Fc -f /backup/pre-deploy-${TIMESTAMP}.dump
echo "Backup erstellt: /backup/pre-deploy-${TIMESTAMP}.dump"
ls -lh /backup/pre-deploy-${TIMESTAMP}.dump
```

### Rollback via pg_dump Restore

```bash
# 1. Backend stoppen (verhindert neue DB-Schreibzugriffe)
docker-compose stop backend
# oder: pm2 stop pp-backend

# 2. Aktuelles Backup erstellen (fuer den Fall, dass Restore fehlschlaegt)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL -Fc -f /backup/rollback-start-${TIMESTAMP}.dump

# 3. Datenbank wiederherstellen
pg_restore --clean --if-exists -d $DATABASE_URL /backup/pre-deploy-TIMESTAMP.dump

# 4. Verify: Tabellen-Struktur pruefen
psql $DATABASE_URL -c "\dt"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM receipts;"

# 5. Backend wieder starten
docker-compose start backend
# oder: pm2 start pp-backend

# 6. Health-Check
curl -f https://api.example.com/health
```

### Migration rueckgaengig machen (Down-Migration)

Falls eine Migration eine `-- down:` Sektion hat:

```bash
# Migration-Datei anschauen
cat backend/migrations/017_neue_migration.sql

# Falls Down-Migration vorhanden, manuell ausfuehren:
psql $DATABASE_URL <<SQL
-- Beispiel Down-Migration:
ALTER TABLE receipts DROP COLUMN IF EXISTS new_column;
DROP TABLE IF EXISTS new_table;
SQL
```

**Wichtig**: ProzessPilot-Migrationen sind aktuell nur Up-Migrations.
Bei Schema-Aenderungen immer eine neue Migration erstellen, nicht rueckwaerts.

### Notfall: Vollstaendiger DB-Reset (nur Dev/Staging!)

```bash
# ACHTUNG: Alle Daten werden geloescht!
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run migrate  # Migrationen neu ausfuehren
```

---

## 3. n8n Workflow-Rollback

### Workflow-Version wiederherstellen

n8n speichert Workflow-Versionen intern. Vorgehen:

1. n8n UI oeffnen (`https://n8n.example.com`)
2. Betroffenen Workflow oeffnen
3. Oben rechts: `...` → `Versions` klicken
4. Letzte stabile Version auswaehlen → `Restore this version`
5. Workflow speichern und aktivieren

### Via n8n API (falls UI nicht erreichbar)

```bash
# Alle Workflows auflisten
curl -s http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.data[].name'

# Spezifischen Workflow exportieren (Backup)
WORKFLOW_ID=123
curl -s http://localhost:5678/api/v1/workflows/$WORKFLOW_ID \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > workflow-backup-$WORKFLOW_ID.json

# Workflow-JSON importieren (Restore)
curl -X PUT http://localhost:5678/api/v1/workflows/$WORKFLOW_ID \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @workflow-backup-$WORKFLOW_ID.json
```

### n8n Daten-Rollback (n8n DB)

```bash
# n8n nutzt PostgreSQL (falls so konfiguriert)
# n8n-Datenbank separat sichern
pg_dump postgresql://prozesspilot:PASSWORT@localhost:5432/n8n -Fc \
  -f /backup/n8n-pre-deploy-${TIMESTAMP}.dump
```

---

## 4. Smoke-Tests nach Rollback

Alle Tests muessen gruenen Haken haben, bevor der Rollback als erfolgreich gilt:

```bash
#!/usr/bin/env bash
# smoke-test.sh — nach jedem Rollback ausfuehren
set -e

BASE_URL="${BASE_URL:-https://api.example.com}"
TENANT_ID="${TENANT_ID:-test-tenant-uuid}"

echo "=== ProzessPilot Smoke Tests nach Rollback ==="

# 1. Health-Check
echo -n "1. Health-Check ... "
STATUS=$(curl -sf "$BASE_URL/health" | jq -r .status)
[ "$STATUS" = "ok" ] && echo "OK" || (echo "FAIL: $STATUS" && exit 1)

# 2. Datenbank erreichbar
echo -n "2. DB-Verbindung ... "
pg_isready -h localhost -p 5432 -U prozesspilot && echo "OK" || (echo "FAIL" && exit 1)

# 3. API-Endpunkt erreichbar
echo -n "3. API /receipts ... "
HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" \
  -H "X-Tenant-ID: $TENANT_ID" "$BASE_URL/api/v1/receipts")
[ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] && echo "OK ($HTTP_CODE)" || (echo "FAIL: $HTTP_CODE" && exit 1)

# 4. n8n erreichbar
echo -n "4. n8n Health ... "
N8N_STATUS=$(curl -sf http://localhost:5678/healthz | jq -r .status 2>/dev/null || echo "unknown")
[ "$N8N_STATUS" = "ok" ] && echo "OK" || echo "WARN: n8n Status = $N8N_STATUS"

echo ""
echo "=== Alle Smoke Tests bestanden ==="
```

Ausfuehren:
```bash
chmod +x smoke-test.sh
./smoke-test.sh
```

---

## Rollback-Checkliste

```
Vor dem Rollback:
[ ] Lead informiert (Slack/Telefon)
[ ] Backup erstellt: pg_dump -Fc -f /backup/rollback-start-$(date +%Y%m%d_%H%M%S).dump
[ ] Rollback-Grund dokumentiert (Incident-Log)

Waehrend des Rollbacks:
[ ] Backend gestoppt (verhindert neue Schreibzugriffe)
[ ] Code-Rollback ausgefuehrt
[ ] DB-Rollback ausgefuehrt (falls Migration betroffen)
[ ] Backend neu gestartet

Nach dem Rollback:
[ ] Smoke-Tests alle grueen
[ ] Health-Check stabil fuer 5 Minuten
[ ] Fehlerrate < 1 % (Monitoring pruefen)
[ ] Nutzer informiert (falls sichtbarer Ausfall)
[ ] Post-Mortem eingeplant
```
