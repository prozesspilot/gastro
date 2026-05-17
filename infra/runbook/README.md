# ProzessPilot Runbook

Betriebsdokumentation fuer den Produktivbetrieb von ProzessPilot.
Letzte Aktualisierung: 2026-05-01

## Dokumente

| Datei                      | Inhalt                                         | Lesezeit |
|----------------------------|------------------------------------------------|----------|
| [01_deployment.md](01_deployment.md)           | Erstinstallation, Docker-Compose, SSL          | 15 Min   |
| [02_rollback.md](02_rollback.md)               | DB-Rollback, Code-Rollback, n8n-Rollback       | 10 Min   |
| [03_oncall_playbook.md](03_oncall_playbook.md) | Symptom → Diagnose → Loesung (6 Szenarien)     | 20 Min   |
| [04_tenant_onboarding.md](04_tenant_onboarding.md) | Checkliste fuer neue Kunden               | 10 Min   |
| [05_monitoring_checks.md](05_monitoring_checks.md) | Taegliche + woechentliche Checks          | 5 Min    |

## Schnellreferenz

### System-Status pruefen

```bash
# Backend-Prozess
pm2 status
# oder bei Docker
docker-compose ps

# Datenbank
pg_isready -h localhost -p 5432 -U prozesspilot

# n8n
curl -s http://localhost:5678/healthz | jq .
```

### Wichtige Log-Dateien

| Dienst     | Log-Pfad                                    |
|------------|---------------------------------------------|
| Backend    | `pm2 logs pp-backend` / Docker: `docker-compose logs backend` |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log`      |
| n8n        | `pm2 logs n8n` / `~/.n8n/logs/`            |
| Nginx      | `/var/log/nginx/access.log` + `error.log`   |
| Backup     | `/var/log/pp-backup.log`                    |

### Notfall-Kontakte

| Rolle              | Kontakt         |
|--------------------|-----------------|
| Technischer Lead   | (siehe internes Wiki) |
| DB-Admin           | (siehe internes Wiki) |
| Hosting-Provider   | (siehe internes Wiki) |

## On-Call Rotation

Das On-Call Playbook ([03_oncall_playbook.md](03_oncall_playbook.md)) deckt alle
bekannten Ausfallszenarien ab. Jedes Szenario folgt dem Format:

> **Symptom** -> **Diagnose-Befehle** -> **Loesung** -> **Eskalation**

Bei neuen Vorfaellen: Symptom + Diagnose-Output + Loesung dokumentieren und
als neues Szenario in `03_oncall_playbook.md` ergaenzen.
