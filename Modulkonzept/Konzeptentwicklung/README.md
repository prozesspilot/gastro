# ProzessPilot — Architektur (IST-Stand 2026-05-12, post-fix)

> Dieses Verzeichnis enthält die vollständige Architektur von ProzessPilot.
> Jede Datei ist so gehalten, dass sie **einzeln** an Claude Code übergeben werden kann.

---

## Status

Implementierung **abgeschlossen** (alle Module + Webapp + Infra).
Live-Übersicht in [STATUS.html](STATUS.html).

| Bereich            | Stand                                                                 |
|--------------------|-----------------------------------------------------------------------|
| Module M01–M14     | ✅ implementiert (Code + Migration + n8n-Workflow + Tests)            |
| Webapp             | ✅ implementiert (React + Vite + Playwright, Production-Build)        |
| n8n-Workflows      | ✅ 17 Workflows produktionsbereit                                      |
| Postgres-Migrations| ✅ 33 Migrationen (inkl. 031_users_auth + 031b_bootstrap)             |
| Infra              | ✅ Runbooks, Backup, ADRs, Security-Checklist, Load-Tests              |
| Plugin-System (Pro)| ✅ implementiert                                                       |
| M11 / M12 / M13 / M14 | ✅ alle implementiert (inkl. JWT-Auth, User-CRUD, ChangePassword)  |
| Nächster Schritt   | Server-Deployment + erster Pilotkunde (siehe [05_Roadmap.md](05_Roadmap.md)) |

---

## Verzeichnisaufbau

```
Konzeptentwicklung/
├── README.md                          ← diese Datei
├── STATUS.html                        ← Live-Stand (öffnen)
├── 00_Architektur_Hauptdokument.md    ← Systemüberblick, Tech-Stack, n8n vs. Backend
├── 01_Datenmodell_Events.md           ← Receipt-Schema, Events, Naming, DB-Schema
├── 02_Kundenprofil_System.md          ← Kunden-DB, Web-App, Routing-Logik
├── 03_n8n_Workflows.md                ← Master-Workflow, Konventionen, Deployment
├── 04_Erweiterbarkeit_Pro.md          ← Hooks, Custom Modules, Plugin-System
├── 05_Roadmap.md                      ← IST-Stand + nächste Schritte
├── 06_Prompt_System.md                ← Prompt-Templates für Code-Generierung
├── Foundation_Spec.md                 ← (erfüllt — historische Referenz)
├── _archive/                          ← Sprint-Files Sprint 0 + Sprint 1 (erfüllt)
└── modules/
    ├── M01_Belegerfassung_OCR.md
    ├── M02_Belegarchivierung.md
    ├── M03_Kategorisierung.md
    ├── M04_DATEV_Export.md
    ├── M05_Lexoffice_Integration.md
    ├── M06_sevDesk_Integration.md
    ├── M07_Excel_Sheets_Export.md
    ├── M08_Monatsreporting.md
    ├── M09_Lieferanten_Kommunikation.md
    ├── M10_WhatsApp_Eingang.md
    ├── M11_IMAP_Eingang.md            ← (nachgezogen 2026-05-07)
    ├── M12_DSGVO.md                   ← (nachgezogen 2026-05-07)
    ├── M13_Steuerberater_Portal.md    ← (nachgezogen 2026-05-07)
    └── M14_User_Verwaltung_Auth.md    ← (implementiert 2026-05-12)
```

---

## Lese-Reihenfolge (für eine neue Person)

1. **`STATUS.html`** im Browser öffnen — der schnellste Überblick.
2. **`00_Architektur_Hauptdokument.md`** — Top-Level-Architektur, Trennung n8n / Backend.
3. **`01_Datenmodell_Events.md`** — `Receipt`-Objekt + Event-Format. Pflicht.
4. **`02_Kundenprofil_System.md`** — Kundenprofil als Single Source of Truth.
5. **`03_n8n_Workflows.md`** — Orchestrierungs-Layer.
6. **`05_Roadmap.md`** — was als nächstes ansteht.
7. **`modules/M01..M13`** — Detail-Specs, gelesen wenn du am Modul arbeitest.
8. **`04_Erweiterbarkeit_Pro.md`** — relevant für Custom-Pro-Anpassungen.

---

## Implementierung

Code-Repo liegt parallel unter `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/`:

```
prozesspilot/
├── backend/              ← Node 20 + TypeScript + Fastify, 57 Tests
├── webapp/               ← React + Vite + Playwright, 74 Tests
├── n8n/workflows/        ← 17 Workflows
├── migrations/           ← 30 SQL-Migrationen
├── infra/
│   ├── runbook/          ← Deployment, Rollback, Oncall, Monitoring, Onboarding
│   ├── backup/           ← Postgres + S3 Backup-Skripte + Restore-Test
│   ├── decisions/        ← ADRs (PDF-Engine, Mail-Provider, Plugin-Sandbox)
│   ├── security/         ← Security-Checklist
│   └── load-tests/       ← Locust-Config
├── docs/openapi.yaml
├── docker-compose.yml
├── docker-compose.prod.yml
└── ProzessPilot_Anleitung.docx
```

---

## Wichtigste Konventionen

| Thema                     | Festlegung                                                              |
|---------------------------|-------------------------------------------------------------------------|
| Workflow-Engine           | n8n self-hosted (Docker)                                                 |
| Backend                   | Node.js 20 + TypeScript strict + Fastify (kein ORM, pg-Treiber direkt)   |
| DB                        | PostgreSQL 16                                                            |
| Cache / Events            | Redis 7 Streams                                                          |
| Object Storage            | MinIO (S3-kompatibel)                                                    |
| OCR                       | Google Vision API (Phase 1), Mindee-Adapter vorbereitet                  |
| KI                        | Claude API (Sonnet 4.6)                                                  |
| WhatsApp                  | WhatsApp Business Cloud API (Meta direkt, optional Twilio)               |
| Buchhaltungs-Adapter      | Lexoffice + sevDesk (Standard), DATEV CSV (Pro)                          |
| Archiv                    | Google Drive (Default), Dropbox (Optional)                               |
| Auth Service-to-Service   | HMAC-SHA256 mit Shared Secret + Idempotency-Key + Trace-ID               |
| Idempotenz                | sha256(file) + customer_id im Backend; Idempotency-Key auf API-Ebene      |
| JSON-Felder               | snake_case                                                                |
| TypeScript                | camelCase                                                                  |
| DB-Tabellen               | snake_case Plural                                                         |
| Workflow-Namen            | `WF-<Domain>-<Variant>`                                                  |
| Events                    | `pp.<entity>.<verb_past>`                                                |

---

## Rollen-Trennung — was läuft wo?

| Aufgabe                                  | n8n | Backend | DB |
|------------------------------------------|-----|---------|----|
| Webhook-Empfang                          | ✓   |         |    |
| Webhook-Signaturprüfung                  |     | ✓       |    |
| Externe API-Calls (OCR, Lexoffice, etc.) | ✓   | ✓       |    |
| Idempotenz-Check                         |     | ✓       | ✓  |
| Validierung (Schema, Plausibilität)      |     | ✓       |    |
| Routing-Entscheidungen                   |     | ✓       |    |
| Sub-Workflow-Orchestrierung              | ✓   |         |    |
| Persistenz Belege/Profile/Audit          |     |         | ✓  |
| Hook-Ausführung                          |     | ✓       |    |
| Cron-Jobs (DATEV, Reporting, Comms)      | ✓   | ✓       |    |
| PDF-Erzeugung                            |     | ✓       |    |
| Mail-Versand                             |     | ✓       |    |

---

## Modul-Übersicht (Quick-Reference)

| ID  | Modul                                   | Paket          | Trigger                    | Code-Pfad                                    |
|-----|-----------------------------------------|----------------|----------------------------|----------------------------------------------|
| M01 | Belegerfassung & OCR                    | Basic+         | Sub-Workflow               | `backend/src/modules/m01-receipt-intake/`    |
| M02 | Belegarchivierung (GoBD)                | Basic+         | Sub-Workflow               | `backend/src/modules/m02-archive/`           |
| M03 | Kategorisierung & OCR-Postprocessing   | Standard+      | Sub-Workflow               | `backend/src/modules/m03-categorization/` + `m03-ocr/` |
| M04 | DATEV-Export                            | Pro            | Cron monatlich             | `backend/src/modules/m04-datev/`             |
| M05 | Lexoffice-Integration                   | Standard+      | Sub-Workflow               | `backend/src/modules/m05-lexoffice/`         |
| M06 | sevDesk-Integration                     | Standard+      | Sub-Workflow               | `backend/src/modules/m06-sevdesk/`           |
| M07 | Excel/Google Sheets Export              | Basic+         | Sub-Workflow               | `backend/src/modules/m07-spreadsheet/`       |
| M08 | Monatsreporting                         | Standard+      | Cron monatlich             | `backend/src/modules/m08-reporting/`         |
| M09 | Lieferanten-Kommunikation              | Pro            | Event/Cron/Manual          | `backend/src/modules/m09-supplier-comm/`     |
| M10 | WhatsApp Eingang                        | Basic+         | Webhook                    | `backend/src/modules/m10-whatsapp/`          |
| M11 | IMAP / E-Mail Eingang                   | Basic+         | Cron / Webhook             | `backend/src/modules/m11-imap/`              |
| M12 | DSGVO-Workflows                         | alle Pakete    | Manual / API               | `backend/src/modules/dsgvo/`                 |
| M13 | Steuerberater-Portal                    | Pro            | API (advisor.exports.read) | `backend/src/modules/m06-advisor-portal/`    |
| M14 | User-Verwaltung & Auth                      | alle Pakete | Login + REST              | `backend/src/modules/users/` + `webapp/src/auth/` |
| —   | Plugin-System                           | Pro            | Workflow-Dispatch          | `backend/src/modules/plugin-system/`         |

> Hinweis: M03 ist auf zwei Ordner aufgeteilt (`m03-categorization` für KI-Logik, `m03-ocr` für den OCR-Endpoint). Beide sind aktiv und in `app.ts` registriert. M13 lebt aus historischen Gründen unter `m06-advisor-portal/` — das ist ein separates Modul, kein sevDesk-Submodul.

---

## Was als nächstes?

Siehe [05_Roadmap.md](05_Roadmap.md). Kurz: Server-Deployment und erster Pilotkunde.

Wenn du am Code arbeitest und neue Features dazukommen, **bitte zuerst die zugehörige Modul-Spec aktualisieren** — sonst entsteht wieder ein Drift wie zuvor (Konzept hing vier Wochen hinter dem Code).
