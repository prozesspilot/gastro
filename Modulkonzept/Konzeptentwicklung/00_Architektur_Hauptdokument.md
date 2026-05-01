# ProzessPilot — Architektur-Hauptdokument

> Version: 2.0 (Entwicklungs-Architektur)
> Status: Entwicklungsfertig
> Zielgruppe: Senior Software Engineers, n8n Operators, Claude Code

---

## 1. Systemüberblick

ProzessPilot ist ein modulares Automationssystem für Buchhaltungsprozesse. Das System nimmt Belege (WhatsApp, E-Mail) entgegen, extrahiert die Daten per OCR, kategorisiert sie KI-gestützt, archiviert sie GoBD-konform und exportiert sie in das vom Kunden genutzte Buchhaltungssystem.

Zentrale Designprinzipien:

1. **Modularität** — Jedes Modul (M01–M10) ist eigenständig generierbar, einzeln deploybar und über ein einheitliches Daten-/Eventformat angebunden.
2. **Kundenprofil = Single Source of Truth** — Jeder Workflow-Schritt liest aus dem Kundenprofil, welche Module aktiv sind, welche Integrationen, welche API-Keys, welche Parameter.
3. **Trennung Workflow- vs. Business-Logik** — n8n orchestriert (Trigger, Routing, externe API-Calls). Ein dediziertes Backend hält Business-Logik (Validierung, Persistenz, Idempotenz, Domain-Regeln).
4. **Erweiterbar ohne Umbau** — Pro-Kunden bekommen Custom Hooks und Custom Modules, ohne dass der Kern-Code angefasst werden muss.
5. **Bestehende Kundensoftware wird nie ersetzt** — Archivierung und Buchhaltung laufen immer auf den vom Kunden bereits genutzten Systemen.

---

## 2. Hochlevel-Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INPUT-KANÄLE                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐           │
│  │ WhatsApp     │  │ E-Mail       │  │ Web-Upload       │           │
│  │ Business API │  │ (IMAP/Webhook)│  │ (Customer Portal)│           │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘           │
└─────────┼─────────────────┼───────────────────┼─────────────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW-LAYER                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WF-MASTER: Receipt Pipeline                                │    │
│  │  Trigger → Profile-Lookup → M01 → M03 → M02 → M04..M07 → M08│    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WF-INPUT-WHATSAPP / WF-INPUT-EMAIL / WF-INPUT-WEB          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Sub-Workflows: ein Workflow pro Modul (M01..M10)           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WF-CRON: Monatsreporting, DATEV-Export, Aufräumjobs        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  HTTP / REST
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PROZESSPILOT BACKEND (Node/TS)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Customer-    │  │ Receipt-     │  │ Categorization-Service   │   │
│  │ Profile-API  │  │ Service      │  │ (Claude API Wrapper)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ OCR-Adapter  │  │ Export-      │  │ Reporting-Service        │   │
│  │ (Vision API) │  │ Adapters     │  │                          │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Hook-System / Plugin-Loader (Pro-Pakete)                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────┬──────────────────────────────────────────────────┬───────────┘
       │                                                  │
       ▼                                                  ▼
┌──────────────────┐                    ┌──────────────────────────────┐
│ DATA LAYER       │                    │ EXTERNAL APIs                │
│ • Postgres       │                    │ • Google Vision              │
│ • Redis (Streams)│                    │ • Claude API                 │
│ • S3/MinIO       │                    │ • Lexoffice / sevDesk        │
│ (Original-Belege)│                    │ • Google Drive / Dropbox     │
└──────────────────┘                    │ • DATEV (CSV/Mail)           │
                                        └──────────────────────────────┘
```

---

## 3. Technologie-Stack (verbindlich)

| Schicht                     | Technologie                                      | Zweck                                                 |
|-----------------------------|--------------------------------------------------|-------------------------------------------------------|
| Workflow-Orchestrierung     | **n8n** (self-hosted, Docker)                    | Trigger, Routing, externe API-Calls, Cron-Jobs         |
| Backend-Service             | **Node.js 20 + TypeScript + Fastify**            | Business-Logik, persistente API, Validierung, Hooks    |
| Datenbank                   | **PostgreSQL 16**                                | Kundenprofile, Belege (Metadata), Buchungen, Audit-Log  |
| Cache / Event-Bus           | **Redis 7** (Streams + Pub/Sub)                  | Idempotenz, Event-Bus zwischen Modulen, Rate-Limiting   |
| Object Storage              | **MinIO** (oder S3-kompatibel)                   | Original-Belege (PDF/JPG), Reporting-PDFs               |
| OCR (Phase 1)               | **Google Cloud Vision API**                      | Texterkennung auf Beleg-Bildern                         |
| KI-Kategorisierung          | **Claude API (Sonnet 4.6)**                      | Strukturierte Extraktion + Kategorisierung              |
| Eingangskanal               | **WhatsApp Business Cloud API** (Meta direkt)    | Input von Belegfotos                                    |
| Buchhaltungs-APIs           | Lexoffice REST, sevDesk REST, DATEV CSV          | Export-Ziele                                            |
| Archiv-APIs                 | Google Drive API, Dropbox API, ggf. WebDAV      | GoBD-konforme Belegablage                               |
| Reverse Proxy               | **Caddy** oder **Traefik**                       | TLS-Termination, Routing zwischen n8n und Backend      |
| Container-Runtime           | **Docker + Docker Compose** (Phase 1) → K8s      | Deployment                                              |
| Logging / Monitoring        | **Loki + Grafana**, **Sentry**                   | Observability, Alerting                                 |
| CI/CD                       | GitHub Actions                                   | Build, Test, Deploy                                     |

**Verbindliche Entscheidungen** (im bestehenden Konzept noch offen):

- **WhatsApp:** WhatsApp Business Cloud API direkt (nicht Twilio). Begründung: günstiger im Dauerbetrieb, Meta ist die Quelle, weniger Lock-in.
- **OCR:** Google Vision (Phase 1). Mindee als optionaler zweiter Adapter in Phase 3 für Pro-Kunden mit Spezialbelegen. Adapter-Pattern macht den Wechsel folgenlos.
- **Hosting:** n8n self-hosted auf VPS (Hetzner CX31 reicht für die ersten 50 Kunden). n8n Cloud kommt nicht in Frage, weil wir Workflows versionieren und CI-deployen wollen.
- **Archiv-Default:** Google Drive. Dropbox als zweiter Adapter ab Standard-Paket. Beides per Kundenprofil wählbar.
- **Kundenprofil-Verwaltung:** Eigene Postgres-DB, gepflegt über interne Web-App (Next.js Admin-UI). Nicht Notion, nicht n8n-intern. Begründung: Audit, Versionierung, API-Zugriff, Berechtigungen.

---

## 4. Trennung n8n vs. Backend (verbindliche Regel)

Diese Trennung ist die wichtigste Architektur-Entscheidung. Sie verhindert, dass n8n-Workflows zu Spaghetti-JSON werden und Business-Logik in JavaScript-Code-Nodes verschwindet.

### 4.1 Was läuft in n8n

- **Trigger:** Webhook (WhatsApp, E-Mail), Cron, Manual Trigger.
- **Routing-Decisions:** „Hat der Kunde Lexoffice aktiv? Dann zu WF-M05, sonst zu WF-M07."
- **Externe API-Calls** (Google Vision, Lexoffice, sevDesk, Google Drive, WhatsApp), wo n8n bereits einen fertigen Node hat.
- **Branching/Parallelität** zwischen Modulen.
- **Retry-Logik** für externe API-Calls (n8n built-in).

### 4.2 Was läuft im Backend

- **Validierung** des Beleg-JSONs (Schema, Pflichtfelder, Plausibilität).
- **Persistenz** (Belege, Buchungen, Audit-Log, Idempotenz-Keys) in Postgres.
- **Business-Regeln** wie "Beleg gilt als verarbeitet, wenn Status = `exported`" oder "Bei Beträgen über 1000 € muss menschliche Freigabe erfolgen".
- **Idempotenz**: jeder eingehende Beleg bekommt einen `receipt_id` (UUIDv7); Backend prüft Duplikate über Hash der Original-Datei.
- **Datenanreicherung** (Lieferanten-Stammdaten, Kontenrahmen, Steuersätze).
- **Hook-Ausführung** für Custom-Logik (Pro).
- **Reporting-Berechnungen** (Aggregationen, PDF-Erzeugung).

### 4.3 Daumenregel

> Wenn der Code länger als 20 Zeilen JavaScript in einem n8n-Function-Node wäre — gehört er ins Backend.
> Wenn ein Workflow mehr als ein "if" über Kundenkonfiguration enthält — der Routing-Entscheid passiert im Backend, n8n bekommt nur das Ergebnis.

---

## 5. Modul-Index (M01–M10)

| ID  | Modul                                  | Paket           | Phase | Spec-Datei                                  |
|-----|----------------------------------------|-----------------|-------|---------------------------------------------|
| M01 | Belegerfassung & OCR                   | Basic+          | 1     | `modules/M01_Belegerfassung_OCR.md`        |
| M02 | Belegarchivierung (GoBD)               | Basic+          | 1     | `modules/M02_Belegarchivierung.md`         |
| M03 | Kategorisierung & Buchungsvorbereitung | Standard+       | 2     | `modules/M03_Kategorisierung.md`           |
| M04 | DATEV-Export                           | Pro             | 3     | `modules/M04_DATEV_Export.md`              |
| M05 | Lexoffice-Integration                  | Standard+       | 2     | `modules/M05_Lexoffice_Integration.md`     |
| M06 | sevDesk-Integration                    | Standard+       | 2     | `modules/M06_sevDesk_Integration.md`       |
| M07 | Excel / Google Sheets Export           | Basic+          | 1     | `modules/M07_Excel_Sheets_Export.md`       |
| M08 | Monatsreporting                        | Standard+       | 2     | `modules/M08_Monatsreporting.md`           |
| M09 | Lieferanten-Kommunikation              | Pro             | 3     | `modules/M09_Lieferanten_Kommunikation.md` |
| M10 | WhatsApp Eingang                       | Basic+          | 1     | `modules/M10_WhatsApp_Eingang.md`          |

Jede Modul-Spec ist in sich abgeschlossen und kann einzeln an Claude Code übergeben werden. Sie folgt einem standardisierten Aufbau (siehe `01_Datenmodell_Events.md` für die einheitlichen Schemata).

---

## 6. Verzeichnisstruktur (Repository)

```
prozesspilot/
├── backend/                       # Node.js + TypeScript Backend
│   ├── src/
│   │   ├── modules/
│   │   │   ├── m01-receipt-intake/
│   │   │   ├── m02-archive/
│   │   │   ├── m03-categorization/
│   │   │   ├── m04-datev/
│   │   │   ├── m05-lexoffice/
│   │   │   ├── m06-sevdesk/
│   │   │   ├── m07-spreadsheet/
│   │   │   ├── m08-reporting/
│   │   │   ├── m09-supplier-comm/
│   │   │   └── m10-whatsapp/
│   │   ├── core/
│   │   │   ├── customer-profile/  # Kernstück
│   │   │   ├── events/            # Event-Bus (Redis Streams)
│   │   │   ├── hooks/             # Pro-Hook-System
│   │   │   ├── adapters/          # OCR, Storage, Booking-System Adapter
│   │   │   └── schemas/           # JSON Schemas (Receipt, Profile, Events)
│   │   ├── api/                   # Fastify Routes
│   │   └── infra/                 # DB, Redis, MinIO Clients
│   ├── prisma/                    # Postgres Schema + Migrationen
│   └── tests/
├── n8n/
│   ├── workflows/                 # Exportierte Workflow-JSONs (versioniert)
│   │   ├── WF-INPUT-WHATSAPP.json
│   │   ├── WF-INPUT-EMAIL.json
│   │   ├── WF-MASTER-RECEIPT.json
│   │   ├── WF-M01.json … WF-M10.json
│   │   └── WF-CRON-MONTHLY.json
│   ├── credentials/               # nur Templates, echte Keys aus Vault
│   └── deploy.sh                  # Sync-Script Repo → n8n-Instanz
├── webapp/                        # Next.js Admin-UI (Kundenprofil-Verwaltung)
│   ├── app/
│   ├── components/
│   └── lib/
├── infra/
│   ├── docker-compose.yml
│   ├── caddy/
│   └── grafana/
└── docs/                          # → diese Konzept-Dokumente
    ├── 00_Architektur_Hauptdokument.md
    ├── 01_Datenmodell_Events.md
    ├── 02_Kundenprofil_System.md
    ├── 03_n8n_Workflows.md
    ├── 04_Erweiterbarkeit_Pro.md
    ├── 05_Roadmap.md
    └── modules/
        └── M01..M10
```

---

## 7. Cross-cutting concerns

Die folgenden Themen werden modulübergreifend gelöst und sind in jedem Modul verfügbar.

### 7.1 Idempotenz

Jeder eingehende Beleg bekommt einen deterministischen Hash (`SHA256(file_bytes + customer_id)`). Vor jeder Verarbeitung prüft das Backend in Postgres, ob dieser Hash bereits existiert. Falls ja → Modul gibt das bestehende Receipt-Objekt zurück, kein Re-Processing.

### 7.2 Audit-Log

Jeder Statuswechsel eines Belegs wird in `audit_log` (Postgres) geschrieben: `receipt_id`, `from_status`, `to_status`, `actor` (system/user/customer), `timestamp`, `payload_diff`. Pflicht für GoBD-Compliance.

### 7.3 Fehlerbehandlung

Drei Fehlerklassen, einheitlich gehandhabt:

- **Recoverable** (Netzwerk, Rate-Limit) → n8n Retry mit Exponential Backoff (3×, 5s/30s/3min).
- **Validation** (fehlende Felder, ungültiger Beleg) → Status `requires_review`, optional Lieferanten-Rückfrage via M09 (nur Pro).
- **Fatal** (Auth, Konfigurationsfehler) → Sentry-Alert + Slack/Mail an ProzessPilot-Operator. Beleg bleibt im Status `error`, kein automatischer Retry.

### 7.4 Sicherheit / Geheimnisse

- API-Keys (Lexoffice, sevDesk, OCR) liegen verschlüsselt in Postgres (`pgcrypto`). Backend entschlüsselt nur on-demand.
- n8n bekommt **keine** API-Keys aus Kundenprofilen direkt — n8n ruft das Backend auf, das den Call mit den richtigen Credentials weiterleitet.
- Kommunikation n8n ↔ Backend per mTLS oder mindestens shared-secret HMAC-Header.
- Kundenfiles in MinIO werden client-seitig pro Kunde mit eigenem Key verschlüsselt.

### 7.5 Multi-Tenancy

Jede DB-Tabelle hat eine `customer_id`-Spalte. Backend-Middleware setzt RLS (Row-Level Security) in Postgres. Jeder API-Request muss mit einem Customer-Context laufen (JWT mit `customer_id` claim, oder API-Key gebunden an Customer).

---

## 8. Bezug zu den weiteren Architektur-Dokumenten

| Dokument                              | Inhalt                                                                                  |
|---------------------------------------|-----------------------------------------------------------------------------------------|
| `01_Datenmodell_Events.md`            | Einheitliche JSON-Schemata (Receipt, Customer, Event), Status-Lifecycle, Naming         |
| `02_Kundenprofil_System.md`           | Datenmodell, Web-App-API, Beispiel-JSONs, Routing-Logik                                 |
| `03_n8n_Workflows.md`                 | Master-Workflow & Sub-Workflows, Konventionen, Versionierung                            |
| `04_Erweiterbarkeit_Pro.md`           | Hook-System, Custom Modules, kundenindividuelle Anpassungen                             |
| `05_Roadmap.md`                       | MVP-Plan, Sprints, Reihenfolge der Modul-Implementierung                                |
| `modules/M01..M10`                    | Detail-Spezifikationen pro Modul (Input/Output/Workflow/Fehler/Code-Hinweise)           |

---

## 9. Glossar (verbindliche Begriffe)

- **Receipt** = ein Beleg, vom Eingang bis zum Export. Wird im System als JSON-Objekt mit eindeutiger `receipt_id` repräsentiert.
- **Customer** = ein zahlender Kunde von ProzessPilot. Hat genau ein **Customer-Profile**.
- **Module** = funktionale Einheit (M01..M10). Besteht aus n8n-Sub-Workflow + Backend-Service + ggf. DB-Schema.
- **Master-Workflow** = der zentrale n8n-Workflow, der alle Module orchestriert (`WF-MASTER-RECEIPT`).
- **Hook** = Erweiterungspunkt, an dem Pro-Kunden Custom-Code einklinken können (siehe `04_Erweiterbarkeit_Pro.md`).
- **Adapter** = austauschbare Implementierung einer Schnittstelle (z. B. OCR-Adapter Vision/Mindee, Booking-Adapter Lexoffice/sevDesk).
- **Event** = strukturierte Nachricht in Redis Streams, gefolgt von Subscribern. Format `pp.<domain>.<verb>` (z. B. `pp.receipt.extracted`).
