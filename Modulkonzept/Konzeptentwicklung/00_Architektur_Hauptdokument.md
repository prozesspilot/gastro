# Gastro — Architektur-Hauptdokument

> **Version:** 3.1 (Mai 2026 — Gastro-Fokus, Discord-Integration, Internal-Webapp-Architektur, Brand-Code-Split)
> **Status:** Verbindlich
> **Zielgruppe:** Geschäftsführung, Senior Software Engineers, n8n Operators, Claude Code, externe Stakeholder
>
> **Naming:** "Gastro" = System-/Code-Name (intern, im Repo). "ProzessPilot" = Firma + Brand (außen, Marketing, AGB, Customer-Touchpoints).

---

## 1. Systemüberblick

**Gastro** ist ein modulares Automationssystem für Buchhaltungsprozesse, **fokussiert auf deutsche Gastronomie-Kleinunternehmer** — vertrieben unter dem Brand **ProzessPilot** der Firma Steve Bernhardt. Das System nimmt Belege (WhatsApp, E-Mail, später Web-Upload) entgegen, extrahiert die Daten per OCR, kategorisiert sie KI-gestützt mit Gastro-Spezialfällen (Bewirtung, MwSt-Splitting, Pfand), archiviert sie GoBD-konform und übergibt sie aufbereitet an den Steuerberater des Wirts (DATEV, Lexware Office, sevDesk).

### Zentrale Designprinzipien

1. **Modularität** — Jedes Kunden-Modul (M01–M15) ist eigenständig generierbar, einzeln deploybar und über ein einheitliches Daten-/Eventformat angebunden.
2. **Kundenprofil = Single Source of Truth** — Jeder Workflow-Schritt liest aus dem Kundenprofil, welche Module aktiv sind, welche Integrationen, welche API-Keys, welche Parameter.
3. **Trennung Workflow- vs. Business-Logik** — n8n orchestriert (Trigger, Routing, externe API-Calls). Ein dediziertes Backend hält Business-Logik (Validierung, Persistenz, Idempotenz, Domain-Regeln).
4. **Mitarbeiter-Webapp ist rein intern** — Endkunden (Wirte) sehen die Webapp nie. Sie kommunizieren ausschließlich über WhatsApp, E-Mail und das Web-Chat-Widget mit Magic-Link-Auth.
5. **Discord ist Mitarbeiter-Backbone** — Authentifizierung, Notifications, Task-Claim und Customer-Bridge laufen über einen internen Discord-Server.
6. **Erweiterbar ohne Umbau** — Pro-Kunden bekommen Custom Hooks und Custom Modules, ohne dass der Kern-Code angefasst werden muss.
7. **Bestehende Kundensoftware wird nie ersetzt** — Archivierung und Buchhaltung laufen immer auf den vom Kunden bereits genutzten Systemen.

### Wichtige Klärung: Was "Modul" bedeutet

Im ProzessPilot-Konzept ist ein **Modul** ein **kunden-aktivierbares Funktions-Paket** (mit n8n-Workflow + Backend-Code + DB-Migrations + Spec). Pro Tenant togglebar, einem Paket zugeordnet (Solo / Standard / Pro / Filiale).

Interne Werkzeuge wie Tenant-Management, Task-Dashboard, Provisions-Tracking sind **keine Module**, sondern **Komponenten der Mitarbeiter-Webapp** bzw. Backend-Subsysteme. Diese Trennung ist konzeptionell wichtig.

---

## 2. Hochlevel-Architektur

```
┌────────────────────────────────────────────────────────────────────────┐
│                       INPUT-KANÄLE (Endkunde)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐    │
│  │ WhatsApp     │  │ E-Mail       │  │ Web-Chat-Widget            │    │
│  │ (Twilio→Meta)│  │ (IMAP/Webh.) │  │ chat.prozesspilot.net/c/.. │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────────────┘    │
└─────────┼─────────────────┼───────────────────┼────────────────────────┘
          │                 │                   │
          ▼                 ▼                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW-LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  WF-MASTER: Receipt Pipeline                                │       │
│  │  Trigger → Profile-Lookup → M01 → M03 → M02 → M04..M07 → M08│       │
│  └─────────────────────────────────────────────────────────────┘       │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  WF-INPUT-WHATSAPP / WF-INPUT-EMAIL / WF-INPUT-WEB-CHAT     │       │
│  └─────────────────────────────────────────────────────────────┘       │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  Sub-Workflows: ein Workflow pro Modul (M01..M15)           │       │
│  └─────────────────────────────────────────────────────────────┘       │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │  WF-CRON: Monatsreporting, DATEV-Export, Aufräumjobs        │       │
│  └─────────────────────────────────────────────────────────────┘       │
└──────────────────────────┬─────────────────────────────────────────────┘
                           │  HTTP / REST
                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  PROZESSPILOT BACKEND (Node/TS, EU-Hetzner)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐      │
│  │ Customer-    │  │ Receipt-     │  │ Categorization-Service   │      │
│  │ Profile-API  │  │ Service      │  │ (Claude API Wrapper +    │      │
│  │              │  │              │  │  Gastro-Hooks: Bewirtung,│      │
│  │              │  │              │  │  MwSt-Split, Pfand)      │      │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐      │
│  │ OCR-Adapter  │  │ Export-      │  │ Reporting-Service        │      │
│  │ (Vision API) │  │ Adapters     │  │ (M08 + Spar-Counter)     │      │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐      │
│  │ GoBD-Doku-   │  │ Chat-        │  │ Auth-Service             │      │
│  │ Generator    │  │ Service      │  │ (Discord-OAuth +         │      │
│  │              │  │ (Web-Chat-   │  │  Notfall-Login)          │      │
│  │              │  │  Backend)    │  │                          │      │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘      │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │ Hook-System / Plugin-Loader (Pro-Pakete)                    │       │
│  └─────────────────────────────────────────────────────────────┘       │
└──────┬───────────────┬───────────────┬─────────────────────┬───────────┘
       │               │               │                     │
       ▼               ▼               ▼                     ▼
┌──────────────┐ ┌────────────┐ ┌──────────────┐  ┌──────────────────┐
│ DATA LAYER   │ │ DISCORD    │ │ FRONTENDS    │  │ EXTERNAL APIs    │
│ • Postgres   │ │ • Bot      │ │ • Mitarbeiter│  │ • Google Vision  │
│ • Redis      │ │ • Webhooks │ │   Webapp     │  │ • Claude API     │
│ • S3/MinIO   │ │ • Channels │ │ • Web-Chat   │  │ • Lexware Office │
│ (alles EU)   │ │ • Threads  │ │ • Onboarding │  │ • DATEV (CSV/    │
│              │ │            │ │   Wizard     │  │   später DUO)    │
└──────────────┘ └────────────┘ └──────────────┘  │ • sevDesk        │
                                                  │ • Google Drive   │
                                                  │ • SumUp API      │
                                                  │ • Twilio (Phase) │
                                                  │ • Meta WhatsApp  │
                                                  └──────────────────┘
```

---

## 3. Drei Frontends — strikte Trennung

ProzessPilot hat **drei separate Frontends**, jeweils mit klar abgegrenztem Zweck:

### 3.1 Mitarbeiter-Webapp (`admin.prozesspilot.net`)

- **Zielgruppe:** ProzessPilot-interne Mitarbeiter (1–10 Personen anfangs)
- **Login:** Discord OAuth (Standard) + Notfall-Login mit Email+TOTP (nur Geschäftsführer)
- **Funktionen:** Tenant-Management, Task-Dashboard, Beleg-Korrektur, Provisions-Übersicht, Mitarbeiter-Verwaltung, Customer-Chat-Mitarbeiter-View
- **Spec:** `Mitarbeiter_Webapp.md`

### 3.2 Onboarding-Wizard (`setup.prozesspilot.net`)

- **Zielgruppe:** Endkunden (Wirte) während der einmaligen Setup-Phase
- **Login:** Magic-Link aus Setup-E-Mail nach Vertragsabschluss (kein dauerhafter Account)
- **Funktionen:** Stammdaten erfassen, Steuerberater-Setup, OAuth-Verbindungen (Lexware/Drive/SumUp), Test-Beleg
- **Spec:** `Onboarding_Wizard.md`

### 3.3 Customer-Web-Chat-Widget (`chat.prozesspilot.net/c/{token}` bzw. `prozesspilot.net/c/{token}`)

- **Zielgruppe:** Endkunden (Wirte) bei Klärungs-Bedarf während des laufenden Betriebs
- **Login:** Magic-Link aus WhatsApp/Mail bei Bedarf, Browser-Session 24h
- **Funktionen:** Chat-Widget mit Konversations-History, Quick-Reply-Buttons, Beleg-Vorschau
- **Spec:** `Web_Chat_Widget.md`

### 3.4 Marketing-Website (`prozesspilot.net`)

- **Zielgruppe:** Interessenten, Vertriebsagentur-Material
- **Login:** Keiner (statische Seiten)
- **Funktionen:** Produkt-Erklärung, Pricing-Übersicht, Spar-Rechner, Sales-Kontakt
- **Aufbau:** Phase 2, nicht im MVP-Scope

---

## 4. Technologie-Stack (verbindlich)

| Schicht | Technologie | Zweck |
|---|---|---|
| Workflow-Orchestrierung | **n8n** (self-hosted, Docker) | Trigger, Routing, externe API-Calls, Cron-Jobs |
| Backend-Service | **Node.js 20 + TypeScript + Fastify** | Business-Logik, persistente API, Validierung, Hooks |
| Frontend Webapp | **React + Vite + TailwindCSS** | Mitarbeiter-Webapp, Onboarding-Wizard, Chat-Widget |
| Real-Time | **Socket.io** oder native WebSocket | Chat-Widget, Task-Dashboard-Live-Updates |
| Datenbank | **PostgreSQL 16** | Kundenprofile, Belege, Buchungen, Audit-Log, Tasks, Chat-Messages |
| Cache / Event-Bus | **Redis 7** (Streams + Pub/Sub) | Idempotenz, Event-Bus, Rate-Limiting |
| Object Storage | **MinIO** (S3-kompatibel, EU) | Original-Belege, Reporting-PDFs |
| OCR (Phase 1) | **Google Vision API** (EU-Region `europe-west3`) | Texterkennung |
| KI-Kategorisierung | **Anthropic Claude API (Sonnet 4.6)** | Strukturierte Extraktion + Kategorisierung |
| Eingangskanal P1.2 | **Twilio WhatsApp Sandbox** | Übergangs-WhatsApp bis Meta freigegeben |
| Eingangskanal P1.3+ | **WhatsApp Business Cloud API** (Meta direkt) | Produktiver WhatsApp-Eingang |
| Buchhaltungs-APIs | Lexware Office REST, DATEV CSV (später DUO), sevDesk REST | Steuerberater-Übergabe |
| Archiv-APIs | Google Drive API, Dropbox API | GoBD-konforme Belegablage |
| Kassen-Connector | SumUp API (MVP), später orderbird/Lightspeed/ready2order | M15 Kassensystem-Integration |
| Reverse Proxy | **Caddy** | TLS-Termination, Routing zwischen Diensten |
| Container-Runtime | **Docker + Docker Compose** | Deployment |
| Logging / Monitoring | **Loki + Grafana**, **Sentry** | Observability, Alerting → Discord |
| CI/CD | **GitHub Actions** | Build, Test, Deploy → Discord-Notification |
| **Mitarbeiter-Auth** | **Discord OAuth 2.0** + JWT-Sessions | Standard-Login |
| **Mitarbeiter-Notfall-Auth** | **Email + Argon2id + TOTP** | Notfall-Login Geschäftsführer |
| **Mitarbeiter-Komm.** | **Discord-Server + eigener Bot** (discord.js) | Channels, Webhooks, Buttons, Slash-Commands, Customer-Bridge |
| **Customer-Auth** | **Magic-Link** mit Token in DB | Kein Customer-Account, Token-basiert |
| **Zahlung Phase 1** | Manuelle Rechnung per E-Mail | Bis ~25 Tenants |
| **Zahlung Phase 2** | **Stripe-Subscriptions** mit SEPA + Karte | Ab ~25 Tenants |

---

## 5. Trennung n8n vs. Backend (verbindliche Regel)

Diese Trennung ist die wichtigste Architektur-Entscheidung. Sie verhindert, dass n8n-Workflows zu Spaghetti-JSON werden und Business-Logik in JavaScript-Code-Nodes verschwindet.

### 5.1 Was läuft in n8n

- **Trigger:** Webhook (WhatsApp, E-Mail), Cron, Manual Trigger.
- **Routing-Decisions:** "Hat der Kunde Lexware Office aktiv? Dann zu WF-M05, sonst zu WF-DATEV-CSV."
- **Externe API-Calls** (Google Vision, Lexware Office, sevDesk, Google Drive, WhatsApp), wo n8n bereits einen fertigen Node hat.
- **Branching/Parallelität** zwischen Modulen.
- **Retry-Logik** für externe API-Calls (n8n built-in).

### 5.2 Was läuft im Backend

- **Validierung** des Beleg-JSONs (Schema, Pflichtfelder, Plausibilität).
- **Persistenz** (Belege, Buchungen, Audit-Log, Idempotenz-Keys, Tasks, Chat-Messages) in Postgres.
- **Business-Regeln** wie "Beleg gilt als verarbeitet, wenn Status = `exported`" oder "Bei Bewirtungsbelegen ohne Anlass-Notiz wird Task erzeugt + Customer-Chat-Magic-Link verschickt".
- **Idempotenz**: jeder eingehende Beleg bekommt einen `receipt_id` (UUIDv7); Backend prüft Duplikate über Hash der Original-Datei.
- **Datenanreicherung** (Lieferanten-Stammdaten, Kontenrahmen, Steuersätze).
- **Hook-Ausführung** für Custom-Logik (Pro).
- **Reporting-Berechnungen** (Aggregationen, PDF-Erzeugung, Spar-Counter pro Wirt).
- **Discord-Bridge-Logik** (Webhooks raus, Bot-Events rein).
- **GoBD-Verfahrensdokumentations-Generator** (pro Tenant individuell).

### 5.3 Daumenregel

> Wenn der Code länger als 20 Zeilen JavaScript in einem n8n-Function-Node wäre — gehört er ins Backend.
>
> Wenn ein Workflow mehr als ein "if" über Kundenkonfiguration enthält — der Routing-Entscheid passiert im Backend, n8n bekommt nur das Ergebnis.

---

## 6. Modul-Index (Stand Mai 2026)

| ID | Modul | Paket | Phase | MVP? | Spec-Datei |
|----|-------|-------|-------|------|------------|
| M01 | Belegerfassung & OCR | Basic+ | 1 | ja | `modules/M01_Belegerfassung_OCR.md` |
| M02 | Belegarchivierung (GoBD) | Basic+ | 1 | ja | `modules/M02_Belegarchivierung.md` |
| M03 | Kategorisierung & Buchungsvorbereitung (mit Gastro-Hooks) | Standard+ | 2 | ja, erweitern | `modules/M03_Kategorisierung.md` |
| M04 | DATEV-Export | Pro | 3 | ja | `modules/M04_DATEV_Export.md` |
| M05 | Lexware Office Integration | Standard+ | 2 | ja (Pilot) | `modules/M05_Lexoffice_Integration.md` |
| M06 | sevDesk-Integration | Standard+ | 2 | später | `modules/M06_sevDesk_Integration.md` |
| M07 | Excel / Google Sheets Export | Basic+ | 1 | optional | `modules/M07_Excel_Sheets_Export.md` |
| M08 | Monatsreporting (mit Steuerberater-Übergabe + Spar-Bericht) | Standard+ | 2 | ja, erweitern | `modules/M08_Monatsreporting.md` |
| M09 | Lieferanten-Kommunikation | Pro | 3 | später | `modules/M09_Lieferanten_Kommunikation.md` |
| M10 | WhatsApp Eingang | Basic+ | 1 | ja (P1.2) | `modules/M10_WhatsApp_Eingang.md` |
| M11 | IMAP / E-Mail Eingang | Basic+ | 1 | ja | `modules/M11_IMAP_Eingang.md` |
| M12 | DSGVO-Workflows (mit GoBD-Doku-Generator) | alle | 1 | ja, erweitern | `modules/M12_DSGVO.md` |
| M13 | Steuerberater-Portal | Pro | 3 | später | `modules/M13_Steuerberater_Portal.md` |
| M14 | User-Verwaltung & Auth (Discord OAuth + Notfall-Login) | alle | 1 | ja, erweitern | `modules/M14_User_Verwaltung_Auth.md` |
| **M15** | **Kassensystem-Connector (SumUp first)** | Standard+ | 1 | **ja, neu** | `modules/M15_Kassensystem_Connector.md` |

Jede Modul-Spec ist in sich abgeschlossen und kann einzeln an Claude Code übergeben werden.

---

## 7. Mitarbeiter-Webapp + Backend-Subsysteme (keine Module)

Folgende Komponenten sind **keine Kunden-Module**, sondern interne Werkzeuge:

| Komponente | Zweck | Spec |
|---|---|---|
| Tenant-Management-Konsole | Multi-Tenant-Admin-View, Modul-Toggles | `Mitarbeiter_Webapp.md` |
| Task-Dashboard | Eigene + zugewiesene Tasks, Auto-Trigger-Engine | `Mitarbeiter_Webapp.md` |
| Beleg-Korrektur-View | Belege mit niedriger OCR-Confidence | `Mitarbeiter_Webapp.md` |
| Provisions-Übersicht | Vertriebsagentur-Tracking, Auszahlungs-Reports | `Mitarbeiter_Webapp.md` |
| Customer-Chat-Mitarbeiter-View | Alle Tenant-Konversationen | `Mitarbeiter_Webapp.md` |
| Discord-Bot-Service | Webhooks, Buttons, Slash-Commands, Customer-Bridge | `Discord_Integration.md` |
| Web-Chat-Widget-Service | Backend für Customer-Web-Chat, WebSocket-Server | `Web_Chat_Widget.md` |
| Auto-Rechnungs-Generator | Monatliche Rechnungen pro Tenant, Mahn-Workflow | `Mitarbeiter_Webapp.md` |
| Spar-Counter-Service | Monatliche Spar-Berechnung pro Wirt | Erweiterung von M08 |
| GoBD-Doku-Generator | PDF pro Tenant individuell | Erweiterung von M12 |

---

## 8. Verzeichnisstruktur (Repository)

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
│   │   │   ├── m10-whatsapp/
│   │   │   ├── m11-imap/
│   │   │   ├── m12-dsgvo/
│   │   │   ├── m13-advisor-portal/
│   │   │   ├── m14-auth/
│   │   │   └── m15-pos-connector/  # NEU SumUp first
│   │   ├── core/
│   │   │   ├── customer-profile/   # Kernstück
│   │   │   ├── events/             # Event-Bus (Redis Streams)
│   │   │   ├── hooks/              # Pro-Hook-System
│   │   │   ├── adapters/           # OCR, Storage, Booking-System
│   │   │   ├── auth/               # Discord OAuth + Notfall-Login
│   │   │   ├── chat/               # Web-Chat-Backend + WebSocket-Server
│   │   │   ├── discord-bridge/     # Discord-Webhook-Handlers
│   │   │   └── schemas/            # JSON Schemas
│   │   ├── api/                    # Fastify Routes
│   │   └── infra/                  # DB, Redis, MinIO Clients
│   ├── migrations/
│   └── tests/
├── discord-bot/                    # NEU separater Service
│   ├── src/
│   │   ├── bot.ts                  # Bot-Initialisierung mit discord.js
│   │   ├── commands/               # Slash-Command-Handler
│   │   ├── interactions/           # Button-Handler (Claim, Helfer)
│   │   ├── threads/                # Customer-Bridge-Thread-Logik
│   │   └── handlers/               # Webhook-Empfänger vom Backend
│   ├── package.json
│   └── Dockerfile
├── webapp-internal/                # Mitarbeiter-Webapp (React + Vite)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── tenants/
│   │   │   ├── tasks/
│   │   │   ├── chat/
│   │   │   ├── provisions/
│   │   │   └── settings/
│   │   ├── auth/                   # Discord-OAuth-Frontend
│   │   └── components/
│   └── tests/
├── chat-widget/                    # NEU Customer-Web-Chat (React + Vite)
│   ├── src/
│   │   ├── App.tsx                 # Magic-Link-Validation + Chat-UI
│   │   ├── ChatWindow.tsx
│   │   ├── QuickReplies.tsx
│   │   └── ws-client.ts            # WebSocket-Verbindung
│   └── tests/
├── onboarding-wizard/              # NEU Customer-Setup-Wizard (React + Vite)
│   ├── src/
│   │   ├── steps/                  # Stammdaten / StB / Drive / SumUp / Test
│   │   └── App.tsx
│   └── tests/
├── n8n/
│   ├── workflows/                  # Exportierte Workflow-JSONs
│   ├── credentials/                # Templates
│   └── deploy.sh
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── caddy/
│   ├── grafana/
│   ├── runbook/
│   ├── backup/
│   └── decisions/                  # ADRs
└── Modulkonzept/
    └── Konzeptentwicklung/         # Konzept-Doku (dies hier)
```

---

## 9. Cross-cutting Concerns

### 9.1 Idempotenz

Jeder eingehende Beleg bekommt einen deterministischen Hash (`SHA256(file_bytes + tenant_id)`). Vor jeder Verarbeitung prüft das Backend in Postgres, ob dieser Hash bereits existiert.

### 9.2 Audit-Log

Jeder Statuswechsel eines Belegs wird in `audit_log` (Postgres) geschrieben. Pflicht für GoBD-Compliance. **Erweitert:** auch Auth-Events (Login, Notfall-Login, Logout) werden geloggt.

### 9.3 Fehlerbehandlung

Drei Fehlerklassen, einheitlich gehandhabt:

- **Recoverable** (Netzwerk, Rate-Limit) → n8n Retry mit Exponential Backoff (3×, 5s/30s/3min).
- **Validation** (fehlende Felder, ungültiger Beleg) → Status `requires_review`, **Task in Mitarbeiter-Dashboard** + Discord-Ping in `#tasks-neu`, optional Customer-Magic-Link.
- **Fatal** (Auth, Konfigurationsfehler) → **Sentry-Alert + Discord-Ping in `#alerts-critical`**. Beleg bleibt im Status `error`, kein automatischer Retry.

### 9.4 Sicherheit / Geheimnisse

- API-Keys (Lexware Office, sevDesk, OCR, SumUp) liegen verschlüsselt in Postgres (`pgcrypto`).
- n8n bekommt **keine** API-Keys aus Kundenprofilen direkt — n8n ruft das Backend auf.
- Kommunikation n8n ↔ Backend per HMAC-Header.
- Kundenfiles in MinIO werden client-seitig pro Kunde mit eigenem Key verschlüsselt.
- Discord-Bot-Token in `.env.prod`, niemals im Repo.
- Notfall-Login-Passwörter mit Argon2id gehasht, TOTP zwingend für 2FA.

### 9.5 Multi-Tenancy

Jede DB-Tabelle hat eine `tenant_id`-Spalte. Backend-Middleware setzt RLS (Row-Level Security) in Postgres. Jeder API-Request muss mit einem Tenant-Context laufen.

### 9.6 Authentifizierung

- **Endkunde:** Magic-Link mit Token (Web-Chat-Widget) oder Onboarding-Token (Wizard) — kein Account
- **Mitarbeiter:** Discord OAuth 2.0 als Standard
- **Geschäftsführer:** zusätzlicher Notfall-Login (Email + Argon2id + TOTP)
- **n8n ↔ Backend:** HMAC-Header (kein User-Auth)
- **Vertriebsagentur:** kein direkter System-Zugriff (Provisions-Reports per Mail/PDF)

### 9.7 DSGVO / Drittland-Transfer

- **EU-Hosting** (Hetzner Falkenstein/Nürnberg) als Default
- **Google Vision** EU-Region `europe-west3`, sonst Standardvertragsklauseln
- **Anthropic Claude:** US-Region, SCCs gemäß DPA
- **Discord Inc.:** US-Region, SCCs + DPA, im AVV als Subunternehmer genannt
- **Customer-Daten** bleiben in EU-DB (Variante B Web-Chat-Bridge), Discord ist nur Spiegelung

---

## 10. Bezug zu den weiteren Architektur-Dokumenten

| Dokument | Inhalt |
|---|---|
| `00_Strategie_Gastro.md` | Persona, Pricing, Konkurrenz, Spar-Rechnung, USP-Positionierung |
| `00_Vertriebsmodell.md` | Vertriebsagentur, Provisionsmodell, Vertragsklauseln, Sales-Material |
| `00_Pilot_Strategie.md` | Pilot-Wirt-Setup, Sub-Phasen P1.1–P1.3, Erfolgskriterien |
| `01_Datenmodell_Events.md` | Einheitliche JSON-Schemata (Receipt, Customer, Event), Status-Lifecycle |
| `02_Kundenprofil_System.md` | Datenmodell Tenant, Routing-Logik |
| `03_n8n_Workflows.md` | Master-Workflow & Sub-Workflows, Konventionen, Versionierung |
| `04_Erweiterbarkeit_Pro.md` | Hook-System, Custom Modules, kundenindividuelle Anpassungen |
| `05_Roadmap.md` | Aktuelle Roadmap mit Pilot-Phasen, Reseller-Launch, Skalierung |
| `06_Prompt_System.md` | Prompt-Templates für Code-Generierung |
| `Mitarbeiter_Webapp.md` | Internes Tool — Tenant-Mgmt, Task-Dashboard, Provisions-Übersicht |
| `Onboarding_Wizard.md` | Customer-Setup-Frontend, Self-Service vs. Premium-Setup |
| `Web_Chat_Widget.md` | Customer-facing Chat mit Magic-Link-Auth + Discord-Bridge |
| **`Discord_Integration.md`** | Discord-Server-Setup, Bot, OAuth, Webhooks, Customer-Bridge |
| `modules/M01..M15` | Detail-Spezifikationen pro Modul |
| `legal/AGB_Endkunden.md` | SaaS-AGB für Endkundenvertrag (vom Anwalt zu finalisieren) |
| `legal/AVV_Vorlage.md` | Auftragsverarbeitungsvertrag |
| `legal/Subunternehmer.md` | Lebende Liste der Subunternehmer (Hetzner, Google, Anthropic, Discord, Twilio) |

---

## 11. Glossar (verbindliche Begriffe)

- **Receipt** = ein Beleg, vom Eingang bis zum Export. Wird als JSON-Objekt mit eindeutiger `receipt_id` repräsentiert.
- **Tenant** = ein zahlender Endkunde von ProzessPilot. Hat genau ein **Customer-Profile**.
- **Modul** = funktionale Einheit (M01..M15). Besteht aus n8n-Sub-Workflow + Backend-Service + ggf. DB-Schema. **Pro Tenant aktivierbar.**
- **Mitarbeiter** = ProzessPilot-internes Personal mit Discord-Login. Rollen: Geschäftsführer / Mitarbeiter / Support.
- **Master-Workflow** = der zentrale n8n-Workflow, der alle Module orchestriert (`WF-MASTER-RECEIPT`).
- **Hook** = Erweiterungspunkt, an dem Pro-Kunden Custom-Code einklinken können.
- **Adapter** = austauschbare Implementierung einer Schnittstelle (OCR, Storage, Booking-System, POS).
- **Event** = strukturierte Nachricht in Redis Streams. Format `pp.<domain>.<verb>` (z. B. `pp.receipt.extracted`).
- **Magic-Link** = einmaliger Token-basierter Zugang für Endkunden, ohne Account-System.
- **Discord-Bridge** = Verbindung zwischen ProzessPilot-Backend und internem Discord-Server.
- **Customer-Touchpoint** = nur WhatsApp, E-Mail, Web-Chat-Widget, Onboarding-Wizard. **Niemals die Mitarbeiter-Webapp.**
- **Vertriebsagentur** = Handelsvertreter-Partner, vermittelt Endkunden, erhält Provision aus Zahlungseingängen.

---

## 12. Was bewusst nicht im Konzept steht

- **Customer-Self-Service-Portal** (über Wizard hinaus) — Wirte sollen WhatsApp und Web-Chat nutzen, nichts weiter
- **Mobile App für Wirt** — WhatsApp deckt die Use-Cases ab
- **Eigene Buchhaltungs-Software** — wir sind Vorprodukt, kein Ersatz
- **Multi-Region-Hosting** — DSGVO + initiale Kundenmenge, ein EU-Standort genügt
- **Eigener OCR-Service** — Google Vision + Mindee (Phase 2) reichen
- **Affiliate-Programm Steuerberater** — würde dem USP "Steuerberater-Kosten senken" widersprechen

---

**Letzte Aktualisierung:** 2026-05-15 (Version 3.0 — Gastro-Fokus, Discord, Internal-Webapp)
**Verantwortlich:** Steve Bernhardt (Geschäftsführung) + Andreas (Technik)
