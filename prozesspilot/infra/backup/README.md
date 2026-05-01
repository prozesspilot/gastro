# ProzessPilot Backup-Strategie

## Voraussetzungen

- `pg_dump` (PostgreSQL-Client)
- AWS CLI (`aws`) — fuer S3-Upload / MinIO
- Genug Speicherplatz in `$BACKUP_DIR` (Standard: `/backups/postgres`)
- Env-Variablen (siehe unten)

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `DATABASE_URL` | `postgresql://localhost:5432/prozesspilot` | PostgreSQL-Verbindung |
| `BACKUP_DIR` | `/backups/postgres` | Lokales Backup-Verzeichnis |
| `RETENTION_DAYS` | `90` | Aufbewahrungsdauer in Tagen |
| `AWS_BACKUP_BUCKET` | *(leer)* | S3-Bucket fuer Backup-Upload (optional) |
| `PP_S3_BUCKET` | `prozesspilot-receipts` | Quell-Bucket fuer S3-Archiv-Sync |
| `PP_S3_ENDPOINT` | *(leer)* | MinIO-Endpunkt (leer = AWS S3) |
| `TEST_DB_URL` | `postgresql://localhost:5432/prozesspilot_restore_test` | Test-DB fuer Restore-Tests |

## Cron-Setup

```bash
# Als root oder postgres-User einrichten:
crontab -e

# Inhalte:
0 2 * * * /infra/backup/backup-postgres.sh >> /var/log/pp-backup.log 2>&1
0 3 * * * /infra/backup/backup-s3.sh >> /var/log/pp-backup.log 2>&1
0 4 1 * * /infra/backup/restore-test.sh >> /var/log/pp-restore-test.log 2>&1
```

Skripte ausfuehrbar machen:
```bash
chmod +x /infra/backup/*.sh
```

## Restore-Anleitung (Schritt fuer Schritt)

1. Letzte Backup-Datei ermitteln:
   ```bash
   ls -lth $BACKUP_DIR/*.sql.gz | head -5
   ```

2. Ziel-Datenbank vorbereiten:
   ```bash
   psql postgresql://localhost:5432/ -c "DROP DATABASE IF EXISTS prozesspilot_restore;"
   psql postgresql://localhost:5432/ -c "CREATE DATABASE prozesspilot_restore;"
   ```

3. Backup wiederherstellen:
   ```bash
   gunzip -c /backups/postgres/prozesspilot_YYYYMMDD_HHMMSS.sql.gz | \
     psql postgresql://localhost:5432/prozesspilot_restore
   ```

4. Sanity-Check:
   ```bash
   psql postgresql://localhost:5432/prozesspilot_restore \
     -c "SELECT COUNT(*), status FROM receipts GROUP BY status;"
   ```

5. Wenn OK: DNS/Verbindungsstring umstellen oder DB umbenennen.

## S3-Versioning aktivieren

S3-Versioning muss in der AWS Console (oder MinIO-Config) manuell aktiviert werden:

**AWS Console:**
1. S3 > Bucket auswaehlen > Properties > Bucket Versioning > Enable

**AWS CLI:**
```bash
aws s3api put-bucket-versioning \
  --bucket $AWS_BACKUP_BUCKET \
  --versioning-configuration Status=Enabled
```

**MinIO:**
```bash
mc version enable myminio/$BACKUP_BUCKET
```

## Retention-Policy

- **PostgreSQL-Backups:** 90 Tage lokal (konfigurierbar via `RETENTION_DAYS`)
- **S3-Archiv-Sync:** Per S3-Versioning behalten (kein automatisches Loeschen)
- **Empfehlung:** S3 Lifecycle-Rule fuer Versionen aelter als 1 Jahr auf GLACIER verschieben

## Monitoring

Backup-Logs pruefen:
```bash
tail -100 /var/log/pp-backup.log
tail -100 /var/log/pp-restore-test.log
```

Alerting: Cron-Jobs in ein Monitoring-System eintragen (z.B. Prometheus Pushgateway, Healthchecks.io)
