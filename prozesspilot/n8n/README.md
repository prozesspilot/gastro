# ProzessPilot n8n Workflows

Dieses Verzeichnis enthaelt alle n8n-Workflow-Exports fuer ProzessPilot.

## Voraussetzungen

- n8n >= 1.0.0 (empfohlen: aktuellste Version)
- ProzessPilot Backend laeuft und ist erreichbar
- SMTP-Credentials in n8n konfiguriert (fuer Benachrichtigungen)

## Import-Anleitung

### Einzelner Workflow

1. n8n-UI oeffnen (Standard: http://localhost:5678)
2. "Workflows" -> "Import from File" auswaehlen
3. Gewuenschte `.json`-Datei aus diesem Verzeichnis auswaehlen
4. Workflow aktivieren (Toggle oben rechts)

### Alle Workflows auf einmal (CLI)

```bash
# n8n CLI verwenden
n8n import:workflow --input=./workflows/

# Oder via Docker:
docker exec -it <n8n-container> n8n import:workflow --input=/workflows/
```

## Credentials konfigurieren

### Backend URL + HMAC Secret

Alle Workflows benoetigen folgende Environment-Variablen in n8n:

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `BACKEND_URL` | URL des ProzessPilot-Backends | `http://backend:3000` |
| `PP_TENANT_ID` | UUID des Standard-Mandanten | `550e8400-e29b-41d4-a716-446655440000` |
| `PP_HMAC_SECRET` | HMAC-Secret fuer API-Signierung | `your-32-char-secret` |

Diese Variablen in n8n unter **Settings > Environment Variables** setzen.

### SMTP-Credentials (fuer Benachrichtigungen)

1. n8n-UI: **Credentials > New Credential > SMTP**
2. Name: `SMTP Credentials`
3. Host, Port, User, Password aus `.env.prod` uebernehmen
4. Credential-ID `smtp-cred` vergeben (oder Workflows entsprechend anpassen)

## Workflow-Uebersicht

### Haupt-Pipeline

| Datei | Beschreibung | Trigger |
|---|---|---|
| `WF-MASTER-RECEIPT.json` | Haupt-Belegverarbeitung: M01 → M03 → M02 → M07 | Webhook |
| `WF-INPUT-WHATSAPP.json` | WhatsApp-Eingang → Backend | Meta Webhook |
| `WF-ERROR-HANDLER.json` | Fehler klassifizieren + Benachrichtigungen | Von anderen Workflows |

### Modul-Workflows

| Datei | Modul | Beschreibung |
|---|---|---|
| `WF-M01.json` | M01 Eingang | Belegempfang und initiale Verarbeitung |
| `WF-M02.json` | M02 Archiv | Archivierung in MinIO/S3 |
| `WF-M03.json` | M03 OCR | Google Vision OCR + Extraktion |
| `WF-M04.json` | M04 DATEV | DATEV-Export-Workflow |
| `WF-M05.json` | M05 Lexoffice | Lexoffice-Export-Workflow |
| `WF-M06.json` | M06 sevDesk | sevDesk-Export-Workflow |
| `WF-M07.json` | M07 Benachrichtigung | WhatsApp/E-Mail-Bestaetigungen |
| `WF-M08.json` | M08 Reporting | Monatsbericht-Generierung (Cron) |

### Neue Workflows (Phase 4)

| Datei | Beschreibung | Trigger |
|---|---|---|
| `WF-M09-SUPPLIER-COMM.json` | Lieferanten-Kommunikation bei requires_review | Webhook POST `/webhook/m09-supplier-comm` |
| `WF-PLUGIN-DISPATCHER.json` | Plugin-Fehler-Monitoring und -Benachrichtigung | Cron stuendlich |
| `WF-CRON-M09-EXPECTED.json` | Woechentlicher Expected-Check fuer alle Kunden | Cron Montag 09:00 |

## Aktivierungs-Reihenfolge

Aktiviere die Workflows in dieser Reihenfolge, um Abhaengigkeiten zu vermeiden:

1. `WF-ERROR-HANDLER` (wird von anderen aufgerufen)
2. `WF-M01` (Basis-Eingang)
3. `WF-M02` (Archivierung)
4. `WF-M03` (OCR)
5. `WF-MASTER-RECEIPT` (Haupt-Orchestrator)
6. `WF-INPUT-WHATSAPP` (Eingangskanal)
7. `WF-M07` (Benachrichtigungen)
8. `WF-M08` (Reporting, Cron)
9. `WF-M09-SUPPLIER-COMM` (Lieferanten-Komm.)
10. `WF-PLUGIN-DISPATCHER` (Plugin-Monitoring, Cron)
11. `WF-CRON-M09-EXPECTED` (Expected-Check, Cron)

## Webhook-URLs

Nach dem Aktivieren sind folgende Webhook-URLs aktiv:

| Workflow | Webhook-Pfad |
|---|---|
| WF-MASTER-RECEIPT | `/webhook/master-receipt` |
| WF-INPUT-WHATSAPP | `/webhook/whatsapp-input` |
| WF-M09-SUPPLIER-COMM | `/webhook/m09-supplier-comm` |

Die vollstaendige URL hat das Format: `http://n8n:5678/webhook/<pfad>`

## Fehlerbehebung

- **Workflow startet nicht**: Pruefen ob Credentials korrekt konfiguriert sind
- **HTTP 401 vom Backend**: HMAC-Secret oder Timestamp-Skew pruefen
- **HTTP 404**: BACKEND_URL und Route-Prefix pruefen
- **SMTP-Fehler**: SMTP-Credentials in n8n pruefen; Port 587 + STARTTLS empfohlen
