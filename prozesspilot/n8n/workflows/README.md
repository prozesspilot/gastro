# n8n Workflows — ProzessPilot

## Naming-Konvention

```
WF-{TYPE}-{MODULE}.json
```

| Typ     | Bedeutung                                  |
|---------|--------------------------------------------|
| `INPUT` | Eingangskanal (WhatsApp, E-Mail)           |
| `MASTER`| Haupt-Orchestrierungs-Workflow             |
| `M01..M10` | Modul-Sub-Workflow                     |
| `CRON`  | Geplanter Job (Monatsreporting, Erinnerung)|
| `ERROR` | Fehler-Handler                             |
| `PLUGIN`| Plugin-Dispatcher                          |

## Workflow-Übersicht

| Datei                        | Typ      | Status   | Beschreibung                              |
|------------------------------|----------|----------|-------------------------------------------|
| `WF-INPUT-WHATSAPP.json`     | Input    | Aktiv    | WhatsApp Business API Eingang             |
| `WF-MASTER-RECEIPT.json`     | Master   | Aktiv    | Haupt-Pipeline: Trigger → M01..M08        |
| `WF-M01.json`                | Modul    | Aktiv    | Belegerfassung & OCR                      |
| `WF-M02.json`                | Modul    | Aktiv    | Belegarchivierung (Google Drive/Dropbox)   |
| `WF-M03.json`                | Modul    | Aktiv    | KI-Kategorisierung (Claude API)           |
| `WF-M04.json`                | Modul    | Aktiv    | DATEV-Export (CSV)                        |
| `WF-M05.json`                | Modul    | Aktiv    | Lexoffice-Integration                     |
| `WF-M06.json`                | Modul    | Aktiv    | sevDesk-Integration                       |
| `WF-M07.json`                | Modul    | Aktiv    | Excel/Google-Sheets-Export                |
| `WF-M08.json`                | Modul    | Aktiv    | Monatsreporting (Build + Deliver)         |
| `WF-M09-SUPPLIER-COMM.json`  | Modul    | Aktiv    | Lieferanten-Kommunikation                 |
| `WF-CRON-M08.json`           | Cron     | Inaktiv* | Monatsbericht am 1. jeden Monats          |
| `WF-CRON-M09-EXPECTED.json`  | Cron     | Inaktiv* | Lieferanten-Erinnerung (wöchentlich Mo)   |
| `WF-ERROR-HANDLER.json`      | Error    | Aktiv    | Zentraler Fehler-Handler                  |
| `WF-PLUGIN-DISPATCHER.json`  | Plugin   | Aktiv    | Plugin-System Dispatcher                  |

*Muss in der n8n-Instanz manuell aktiviert werden.

## Setup & Deployment

### Erstinstallation

```bash
# Workflows in n8n importieren
bash n8n/deploy.sh import

# Oder manuell: n8n-CLI nutzen
n8n import:workflow --input=n8n/workflows/WF-MASTER-RECEIPT.json
```

### ENV-Variablen in n8n

Folgende ENV-Variablen müssen in der n8n-Instanz gesetzt sein:

| Variable          | Wert (Beispiel)                  | Beschreibung                  |
|-------------------|----------------------------------|-------------------------------|
| `BACKEND_URL`     | `http://backend:3000`            | Backend-URL (intern)          |
| `PP_HMAC_SECRET`  | `<32-Byte-Secret>`               | HMAC-Signatur-Secret          |
| `N8N_WEBHOOK_URL` | `https://n8n.example.com`        | n8n Public URL                |

### Versionierung

Jede Änderung an einem Workflow muss:
1. In der n8n-Instanz gespeichert werden
2. Über n8n-CLI exportiert werden: `n8n export:workflow --id=<id> --output=n8n/workflows/WF-XYZ.json`
3. Im Git-Repo committed werden

```bash
# Export und Commit
n8n export:workflow --all --output=n8n/workflows/
git add n8n/workflows/*.json
git commit -m "chore(n8n): update WF-M01 — add retry logic"
```

## Architektur-Prinzip

```
Input (WhatsApp/E-Mail/Upload)
  ↓
WF-MASTER-RECEIPT (Orchestrierung)
  ↓
WF-M01 (OCR) → WF-M02 (Archiv) → WF-M03 (KI) → WF-M04..M07 (Export)
  ↓
WF-M08 (Reporting) — via CRON
  ↓
Backend API (Persistenz, Business-Logik)
```

Kein Business-Code im n8n — alle Entscheidungen, Validierungen und DB-Zugriffe
liegen im Backend. n8n übernimmt nur Trigger, Routing und externe API-Calls.
