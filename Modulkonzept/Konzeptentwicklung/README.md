# ProzessPilot — Entwicklungs-Architektur

> Dieses Verzeichnis enthält die vollständige, entwicklungsfertige Architektur von ProzessPilot.
> Jede Datei ist so gehalten, dass sie **einzeln** an Claude Code übergeben werden kann.

---

## Wie die Dokumentation aufgebaut ist

```
Konzeptentwicklung/
├── README.md                          ← diese Datei
├── 00_Architektur_Hauptdokument.md    ← Systemüberblick, Tech-Stack, n8n vs. Backend
├── 01_Datenmodell_Events.md           ← Receipt-Schema, Events, Naming, DB-Schema
├── 02_Kundenprofil_System.md          ← Kunden-DB, Web-App, Routing-Logik
├── 03_n8n_Workflows.md                ← Master-Workflow, Konventionen, Deployment
├── 04_Erweiterbarkeit_Pro.md          ← Hooks, Custom Modules, Plugin-System
├── 05_Roadmap.md                      ← Phasen, Sprintplan, kritischer Pfad
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
    └── M10_WhatsApp_Eingang.md
```

---

## Lese-Reihenfolge (für eine neue Person)

1. **`00_Architektur_Hauptdokument.md`** — verstehe die Top-Level-Architektur und die Trennung n8n / Backend.
2. **`01_Datenmodell_Events.md`** — verstehe das `Receipt`-Objekt und das Event-Format. Ohne das verstehst du die Module nicht.
3. **`02_Kundenprofil_System.md`** — das Kundenprofil ist das Herzstück. Hier wird konfiguriert, welche Module für welchen Kunden laufen.
4. **`03_n8n_Workflows.md`** — wie n8n alles orchestriert.
5. **`05_Roadmap.md`** — in welcher Reihenfolge die Module gebaut werden.
6. **`modules/M01..M10`** — Detail-Implementierungs-Specs, gelesen wenn du das jeweilige Modul baust.
7. **`04_Erweiterbarkeit_Pro.md`** — relevant ab Phase 3 oder wenn ein Pro-Kunde Custom-Bedarf hat.

---

## Wie du die Specs an Claude Code gibst

Jede Modul-Spec ist eigenständig lesbar und enthält:

- Zweck / Verantwortlichkeit / Trigger / Abhängigkeiten
- Vollständige Input-/Output-JSONs
- n8n-Workflow Node für Node
- Backend-API-Endpoints + Pseudocode
- DB-Schema-Erweiterungen (falls nötig)
- Fehlerbehandlung
- Code-Struktur + Verzeichnis-Vorschlag
- ENV-Variablen
- Acceptance Criteria

Empfohlener Prompt an Claude Code pro Modul:

```
Lies diese Architektur-Dokumente und implementiere danach das Modul:

  - docs/00_Architektur_Hauptdokument.md   (für Kontext und Konventionen)
  - docs/01_Datenmodell_Events.md          (Schemas, Events, API-Konventionen)
  - docs/02_Kundenprofil_System.md         (wie das Profil aussieht)
  - docs/04_Erweiterbarkeit_Pro.md         (Hook-Points, die das Modul implementieren muss)
  - docs/modules/M0X_<Name>.md             (die eigentliche Modul-Spec)

Generiere danach exakt:
  1. DB-Migration (falls in der Spec gefordert) unter backend/prisma/migrations/
  2. Backend-Modul unter backend/src/modules/m0X-<slug>/ (komplett: routes, handlers, services, schemas, tests)
  3. JSON Schemas
  4. n8n-Workflow JSON unter n8n/workflows/WF-M0X.json (nach Konvention aus docs/03_n8n_Workflows.md)
  5. README in backend/src/modules/m0X-<slug>/README.md
  6. Unit + Integration Tests
```

---

## Wichtigste Konventionen auf einen Blick

| Thema                     | Festlegung                                                              |
|---------------------------|-------------------------------------------------------------------------|
| Workflow-Engine           | n8n self-hosted (Docker)                                                 |
| Backend                   | Node.js 20 + TypeScript + Fastify                                        |
| DB                        | PostgreSQL 16 + Prisma                                                   |
| Cache / Events            | Redis 7 Streams                                                          |
| Object Storage            | MinIO (S3-kompatibel)                                                    |
| OCR                       | Google Vision API (Phase 1), Mindee (optional Phase 3)                   |
| KI                        | Claude API (Sonnet 4.6)                                                  |
| WhatsApp                  | WhatsApp Business Cloud API (direkt, nicht Twilio)                       |
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
| Cron-Jobs (DATEV, Reporting)             | ✓   | ✓       |    |
| PDF-Erzeugung                            |     | ✓       |    |
| Mail-Versand                             |     | ✓       |    |

---

## Modul-Übersicht (Quick-Reference)

| ID  | Modul                                   | Paket          | Phase | Trigger                    | Status-Übergang                 |
|-----|-----------------------------------------|----------------|-------|----------------------------|----------------------------------|
| M01 | Belegerfassung & OCR                    | Basic+         | 1     | Sub-Workflow               | `received → extracted`           |
| M02 | Belegarchivierung (GoBD)                | Basic+         | 1     | Sub-Workflow               | `extracted/categorized → archived` |
| M03 | Kategorisierung & Buchungsvorbereitung | Standard+      | 2     | Sub-Workflow               | `extracted → categorized`        |
| M04 | DATEV-Export                            | Pro            | 3     | Cron monatlich             | (separater Lifecycle)            |
| M05 | Lexoffice-Integration                   | Standard+      | 2     | Sub-Workflow               | `archived/categorized → exported`|
| M06 | sevDesk-Integration                     | Standard+      | 2     | Sub-Workflow               | `archived/categorized → exported`|
| M07 | Excel/Google Sheets Export              | Basic+         | 1     | Sub-Workflow               | `archived/categorized → exported`|
| M08 | Monatsreporting                         | Standard+      | 2     | Cron monatlich             | (eigene Reports-DB)              |
| M09 | Lieferanten-Kommunikation              | Pro            | 3     | Event/Cron/Manual          | (eigene Comms-DB)                |
| M10 | WhatsApp Eingang                        | Basic+         | 1     | Webhook                    | `→ received`                     |

---

## Endziel

Mit dieser Architektur ist sichergestellt:

1. **Module können einzeln entwickelt werden** — jede Spec ist eigenständig.
2. **n8n Workflows können automatisch erstellt werden** — die Konventionen in `03_n8n_Workflows.md` sind so eng, dass eine Workflow-Generierung aus den Modul-Specs deterministisch ist.
3. **Kunden können individuell konfiguriert werden** — über `customer_profiles.modules_enabled` + `integrations` + `routing` + `custom`.
4. **Pro-Anpassungen ohne Umbau** — über das Hook-System und Custom-Module-Plugins (siehe `04_Erweiterbarkeit_Pro.md`).
5. **Skalierbarkeit** — durch Trennung n8n ↔ Backend ↔ DB; jedes Modul ist horizontal skalierbar.

---

## Versionsstand

- Stand: 2026-04-29
- Architektur-Version: **2.0** (Entwicklungs-Architektur)
- Vorgänger: ProzessPilot Modul-Konzept v1.0 (HTML/DOCX Vorlage)
