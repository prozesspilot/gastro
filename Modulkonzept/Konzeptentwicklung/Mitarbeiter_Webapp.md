# Mitarbeiter-Webapp — interne Verwaltung

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Steve (Frontend-Verantwortung), Andreas (Backend-APIs), zukünftige Mitarbeiter
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Architektur_Hauptdokument.md`, `Discord_Integration.md` und `M14 Auth-Spec` voraus.

---

## 1. Was die Mitarbeiter-Webapp ist

Die **Mitarbeiter-Webapp** ist das **rein interne Verwaltungs-Tool** für Steve, Andreas und zukünftige Mitarbeiter. Sie erreichbar unter `admin.prozesspilot.net` und niemals von Endkunden (Wirten) gesehen.

### 1.1 Was die Webapp NICHT ist

- **Kein Customer-Portal** — Endkunden haben keinen Zugang
- **Kein Onboarding-Tool für Wirte** — das macht der separate Onboarding-Wizard
- **Kein Live-Chat-Tool** — das macht das separate Web-Chat-Widget
- **Kein Modul** im Sinne der Kunden-Module (M01–M15) — sondern **eine Anwendung mit mehreren Komponenten**

### 1.2 Zielgruppe und Skala

- 1–3 Mitarbeiter zu Pilot-Beginn (Steve, Andreas, ggf. ein Helfer)
- Erweiterbar bis ~10 Mitarbeiter ohne Architektur-Änderung
- Bei mehr als 15 Mitarbeitern: Re-Evaluation (eventuell Migration auf Slack + dediziertes Ticket-System)

### 1.3 Kern-Funktionen

| Funktion | Wer nutzt | Wie oft |
|---|---|---|
| Tenant-Management (Kunden-Übersicht) | alle Mitarbeiter | täglich |
| Task-Dashboard (eigene + zugewiesene Tasks) | alle Mitarbeiter | mehrmals täglich |
| Beleg-Korrektur-View | alle Mitarbeiter (außer Reine-Reseller) | regelmäßig |
| Customer-Chat-Übersicht | Support + Mitarbeiter | regelmäßig |
| Provisions-Übersicht (Vertriebsagentur) | Geschäftsführer | monatlich |
| Mitarbeiter-Verwaltung (Rollen, Logins) | Geschäftsführer | selten |
| System-Einstellungen | Geschäftsführer | selten |

---

## 2. Tech-Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Frontend-Framework | React 18 + TypeScript | konsistent mit Onboarding-Wizard und Web-Chat-Widget |
| Build-Tool | Vite 5+ | schnell, einfach |
| Styling | TailwindCSS + shadcn/ui-Komponenten | wenig Custom-CSS, viele fertige Komponenten |
| State-Management | TanStack Query (Server-State) + Zustand (UI-State) | minimal-overhead |
| Routing | React Router v7 | Standard |
| API-Client | Generated TypeScript-Client aus OpenAPI-Spec | Type-safety end-to-end |
| Real-Time | Socket.io-Client | für Live-Updates Tasks + Customer-Chat |
| Forms | react-hook-form + Zod-Validation | minimal Bugs durch Type-Safety |
| Auth | Discord OAuth (siehe M14) + Notfall-Login | Standard-Setup |
| Tests | Vitest (Unit) + Playwright (E2E) | konsistent mit Backend |

### 2.1 Verzeichnisstruktur (`webapp-internal/`)

```
webapp-internal/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── DiscordLogin.tsx
│   │   │   └── EmergencyLogin.tsx
│   │   ├── dashboard/
│   │   │   └── Dashboard.tsx
│   │   ├── tenants/
│   │   │   ├── TenantList.tsx
│   │   │   ├── TenantDetail.tsx
│   │   │   └── TenantSettings.tsx
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   └── TaskDetail.tsx
│   │   ├── receipts/
│   │   │   ├── ReceiptCorrection.tsx
│   │   │   └── ReceiptDetail.tsx
│   │   ├── chat/
│   │   │   ├── ChatList.tsx
│   │   │   └── ChatThread.tsx
│   │   ├── provisions/
│   │   │   └── ProvisionsOverview.tsx
│   │   ├── employees/
│   │   │   └── EmployeeManagement.tsx
│   │   └── settings/
│   │       └── SystemSettings.tsx
│   ├── components/                # shadcn/ui-basierte Komponenten
│   │   ├── ui/
│   │   ├── tenant/
│   │   ├── task/
│   │   ├── chat/
│   │   └── layout/
│   ├── hooks/                     # custom React-Hooks
│   ├── lib/
│   │   ├── api-client.ts          # Generated aus OpenAPI
│   │   ├── auth.ts                # Discord-OAuth-Flow + Session-Mgmt
│   │   └── ws-client.ts           # Socket.io-Setup
│   └── stores/                    # Zustand-Stores
└── tests/
```

---

## 3. Komponenten-Übersicht

### 3.1 Dashboard (Startseite nach Login)

**Zweck:** Schneller Überblick auf den eigenen Arbeitstag.

**Inhalte:**
- "Hi Steve" (mit Discord-Avatar)
- Meine offenen Tasks (Anzahl, oberste 5)
- Tasks die mich blockieren (warten auf andere)
- Aktuelle Customer-Chats wo ich angesprochen wurde
- Heute fällige Aufgaben (Setup-Calls, Kunden-Termine)
- Letzte CI-Status (grün/rot)
- Discord-Notifications-Counter

**Layout:** 3-Spalten Grid auf Desktop, 1-Spalte Mobile.

### 3.2 Tenant-Management

**Zweck:** Alle Endkunden im Überblick + Detail-Verwaltung.

**TenantList:**
- Tabelle mit allen Tenants (sortier-/filterbar)
- Spalten: Tenant-Name, Paket, Status, Belege/Mt, Letzter-Beleg-Eingang, Vertriebsagentur, MRR
- Filter: Paket, Status (aktiv/Trial/gekündigt/pausiert), Vertriebsagentur
- Such-Feld (Name, USt-ID)
- "+ Neuen Tenant anlegen" Button (nur Geschäftsführer-Rolle)

**TenantDetail:**
- Stammdaten (Firma, USt-ID, Steuernummer, Adresse, Steuerberater-Kontakt)
- Aktivierte Module (Toggles, nur Geschäftsführer kann ändern)
- Eingangskanäle (WhatsApp-Nr., E-Mail, Web-Chat-Token)
- Letzte 50 Belege (Vorschau, Status, Click → Beleg-Detail)
- Letzte 20 Tasks rund um diesen Tenant
- Customer-Chat-Verlauf (Link zu Chat-View)
- Vertrags-Daten (Vertragsbeginn, Kündigungsfrist, nächste Rechnung, MRR)
- Audit-Log (alle Änderungen am Tenant)

**TenantSettings:**
- Modul-Aktivierungs-Toggles
- Steuerberater-System-Auswahl (Lexware Office / DATEV / sevDesk / Stotax-Fallback)
- API-Zugang Setup (OAuth-Flows zu Lexware, Drive, SumUp)
- Eingangs-Kanal-Konfiguration (welche WhatsApp-Nr., welche E-Mail-Forwarding)
- Beleg-Limit pro Monat (laut Paket)
- Custom-Konfiguration (Pro/Filiale: Bewirtungs-Schwellen, Lieferanten-Whitelist)

### 3.3 Task-Dashboard (Kern-Komponente)

**Zweck:** Tägliches Arbeitstool — was muss ich heute machen?

**TaskList:**
- 3 Tabs: "Meine offenen" / "Team-Tasks" / "Erledigt"
- Filter: Tenant, Typ (beleg_pruefen, datev_fehler, onboarding, ...), Priorität, Fälligkeit
- Sortierung: Default nach Fälligkeit aufsteigend
- Quick-Actions:
  - "🙋 Übernehmen" (wenn unassigned)
  - "✅ Erledigt"
  - "⏸️ Pausieren"
  - "❌ Verwerfen"
  - "👥 Helfer einladen"

**TaskDetail:**
- Vollständige Task-Beschreibung
- Verknüpfte Daten (z.B. Beleg-Vorschau wenn Task-Typ "beleg_pruefen")
- Mitarbeiter-Diskussion (interne Notizen)
- Aktivitäts-Log
- Aktionen je nach Task-Typ (z.B. "Beleg manuell kategorisieren", "Customer-Magic-Link senden")
- Discord-Thread-Link (wenn Task im Discord besprochen)

### 3.4 Beleg-Korrektur-View

**Zweck:** Manuelles Bearbeiten von Belegen mit niedriger OCR-Confidence.

**ReceiptCorrection:**
- Beleg-Bild-Vorschau links (Original-Foto, zoombar)
- Extrahierte OCR-Daten rechts (editierbar):
  - Lieferant
  - Belegnummer
  - Datum
  - Brutto / Netto / MwSt-Beträge (mit Splitting falls mehrere Sätze)
  - Pfand-Position falls erkannt
  - Kategorie / Buchungskonto
- Bei Bewirtungsbeleg: zusätzliche Felder (Anlass, Teilnehmer, Trinkgeld)
- "✅ Übernehmen + nächster Beleg" Button
- "↩️ An Wirt zurückspielen" Button (sendet Magic-Link mit Frage)
- "🗑️ Verwerfen" Button (z.B. Privat-Beleg)

### 3.5 Customer-Chat-Übersicht

**Zweck:** Mitarbeiter-View auf Customer-Konversationen, ergänzt zu Discord-Threads.

**ChatList:**
- Alle aktiven Customer-Chats (sortierbar nach letzte Aktivität)
- Spalten: Tenant-Name, Letzte Nachricht (Auszug), Wartet auf Antwort?, Owner-Mitarbeiter
- Filter: nur "wartet auf uns", Tenant, Owner
- Click → ChatThread

**ChatThread:**
- Vollständige Konversations-History dieses Tenants
- Eingabe-Feld unten zum Antworten (synchronisiert mit Discord-Thread)
- Magic-Link-Status für Customer (gültig/abgelaufen)
- Aktionen: "Magic-Link erneut senden", "Konversation als erledigt markieren"

### 3.6 Provisions-Übersicht (nur Geschäftsführer)

**Zweck:** Monatliche Berechnung + Auszahlung an Vertriebsagentur.

**ProvisionsOverview:**
- Tabelle pro Vertriebsagentur (aktuell: nur eine)
- Pro Monat:
  - Anzahl aktive Tenants (vermittelt)
  - Anzahl Setup-Fees in diesem Monat
  - Anzahl Monatsbeiträge eingegangen
  - Provisions-Berechnung (50% von eingegangenen Zahlungen)
  - Auszahlungs-Status (offen / ausgezahlt / storniert wegen Rücktritt)
- Export-Button "Provisions-Bericht PDF" für Mail an Agentur
- Quartal-Übersicht: Mindestleistungs-Performance

### 3.7 Mitarbeiter-Verwaltung (nur Geschäftsführer)

**EmployeeManagement:**
- Liste aller Mitarbeiter (Name, Discord-Username, Rolle, Aktiv?)
- "+ Neuer Mitarbeiter":
  - Discord-User-ID eingeben
  - Rolle wählen (Geschäftsführer / Mitarbeiter / Support)
  - Display-Name setzen
- Rolle ändern (nur durch anderen Geschäftsführer)
- Aktivieren / Deaktivieren
- Nur für Geschäftsführer: Notfall-Login-Setup-Link senden

### 3.8 System-Einstellungen (nur Geschäftsführer)

- Discord-Webhook-URLs konfigurieren
- API-Limits pro Tenant
- Mahn-Stufen (14 Tage / 30 / 45 / 60)
- Mahn-Mail-Templates
- Default-Onboarding-Flow-Konfig
- Subunternehmer-Liste pflegen (für AVV-Updates an Tenants)

---

## 4. Datenmodell (relevante Tabellen)

Datenmodell-Details siehe `01_Datenmodell_Events.md`. Hier nur die Webapp-spezifischen:

### 4.1 Tabelle `tasks`

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),         -- nullable: globale Tasks (z.B. Reseller-Report)
  type VARCHAR(50) NOT NULL,                     -- z.B. 'beleg_pruefen', 'datev_fehler', ...
  title VARCHAR(200) NOT NULL,
  description TEXT,
  reference_type VARCHAR(50) NULL,               -- 'receipt' / 'tenant' / 'invoice' / ...
  reference_id UUID NULL,                        -- Verknüpfung zu Beleg/Tenant/etc.
  status VARCHAR(20) DEFAULT 'offen',            -- offen / in_bearbeitung / wartet_auf_kunde / erledigt / verworfen
  priority VARCHAR(10) DEFAULT 'normal',         -- niedrig / normal / hoch / kritisch
  assigned_to UUID REFERENCES users(id) NULL,
  claimed_at TIMESTAMPTZ NULL,
  due_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  discord_message_id VARCHAR(20) NULL            -- für Discord-Sync
);

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to) WHERE status != 'erledigt';
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX idx_tasks_status_priority ON tasks(status, priority, due_at);
```

### 4.2 Tabelle `task_collaborators` (für "Helfer einladen")

```sql
CREATE TABLE task_collaborators (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  added_by UUID REFERENCES users(id),
  PRIMARY KEY (task_id, user_id)
);
```

### 4.3 Tabelle `task_activity_log`

```sql
CREATE TABLE task_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  actor UUID REFERENCES users(id) NULL,         -- NULL für system
  action VARCHAR(50) NOT NULL,                   -- 'created', 'claimed', 'commented', ...
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 Erweiterung `users` (siehe M14)

Bereits in `Discord_Integration.md` definiert. Die Webapp nutzt zusätzlich:

```sql
ALTER TABLE users ADD COLUMN avatar_url TEXT;       -- aus Discord-OAuth
ALTER TABLE users ADD COLUMN preferences JSONB;     -- UI-Vorlieben (Theme, Default-View)
```

---

## 5. Auto-Trigger-Engine für Tasks

Ein zentraler Service generiert Tasks **automatisch** bei System-Events. Verhindert dass Mitarbeiter Probleme verpassen.

### 5.1 Trigger-Tabelle

| Event | Erzeugte Task | Owner-Logik | Priorität |
|---|---|---|---|
| OCR-Confidence < 80% | "Beleg manuell prüfen" | Round-Robin verfügbare Mitarbeiter | normal |
| OCR-Confidence < 50% | "Beleg unklar — eventuell defekt" | Round-Robin | hoch |
| Bewirtungsbeleg ohne Anlass-Notiz | "Bewirtungs-Anlass nachfragen" | Mitarbeiter mit dem Tenant | normal |
| DATEV-Mapping-Fehler (Konto fehlt) | "DATEV-Mapping ergänzen" | Geschäftsführer | hoch |
| Lexware Office API-Token expired | "Lexware-Reauth bei Tenant X" | Mitarbeiter mit dem Tenant | hoch |
| SumUp API-Token expired | "SumUp-Reauth bei Tenant X" | Mitarbeiter mit dem Tenant | hoch |
| Onboarding-Wizard abgeschlossen | "Tenant X freischalten + Test-Beleg" | Geschäftsführer | hoch |
| Tenant überschreitet Belege-Limit (>90%) | "Upgrade-Vorschlag" | Geschäftsführer | normal |
| Steuerberater-Mail bounced | "Steuerberater-Mail prüfen" | Mitarbeiter mit dem Tenant | hoch |
| Customer-Chat ohne Antwort > 4h | "Customer-Chat: 4h Wartezeit überschritten" | Owner-Mitarbeiter | hoch |
| Customer-Chat ohne Antwort > 24h | "ESKALATION: Customer wartet > 24h" | Geschäftsführer | kritisch |
| Setup-Fee-Rechnung 14 Tage offen | "Erinnerung an Tenant X senden" | Geschäftsführer | normal |
| Monats-Rechnung 30 Tage offen | "1. Mahnung an Tenant X" | Geschäftsführer | hoch |
| Monats-Rechnung 60 Tage offen | "Auto-Sperrung Tenant X — bestätigen" | Geschäftsführer | kritisch |
| 1. des Monats | "Reseller-Provisions-Report versenden" | Geschäftsführer | normal |
| 25 Belege ohne Korrektur durchgelaufen | "Tenant X läuft sauber" (Info-Task, kann sofort als erledigt markiert werden) | Round-Robin | niedrig |
| CI-Pipeline rot | "CI auf Branch <name> reparieren" | Branch-Owner | hoch |

### 5.2 Implementation

- Cron-Job alle 5 Min im Backend
- Event-Listener auf Redis-Streams (`pp.receipt.extracted` etc.)
- Bei Task-Erstellung: sofort Discord-Webhook in `#tasks-neu`

---

## 6. Auto-Rechnungs-Generator

Wird von der Webapp orchestriert, Backend generiert PDFs.

### 6.1 Funktion

- Cron am 1. jedes Monats (00:01 Uhr)
- Für jeden aktiven Tenant: PDF-Rechnung generieren
- Per E-Mail an Tenant-Rechnungs-Adresse
- Status in DB: `invoices` Tabelle
- Bei manueller Bezahlung: Mitarbeiter markiert in Webapp als bezahlt
- Wenn 14 Tage offen: Auto-Task "Erinnerung senden"
- Wenn 30 Tage: Auto-Task "1. Mahnung"
- Wenn 45 Tage: Auto-Task "2. Mahnung mit Sperr-Ankündigung"
- Wenn 60 Tage: Auto-Task "Auto-Sperrung bestätigen"

### 6.2 Tabelle `invoices`

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,    -- fortlaufend, GoBD-Pflicht
  invoice_type VARCHAR(20) NOT NULL,             -- 'setup' / 'monthly'
  amount_brutto DECIMAL(10,2) NOT NULL,
  amount_netto DECIMAL(10,2) NOT NULL,
  ust_amount DECIMAL(10,2) NOT NULL,
  pdf_path VARCHAR(500),                         -- in MinIO
  status VARCHAR(20) DEFAULT 'gestellt',         -- 'gestellt' / 'bezahlt' / 'gemahnt_1' / 'gemahnt_2' / 'inkasso' / 'storniert'
  paid_at TIMESTAMPTZ NULL,
  paid_amount DECIMAL(10,2) NULL,
  reminder_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  due_at DATE NOT NULL                           -- 14 Tage nach Erstellung
);
```

### 6.3 Stripe-Migration ab ~25 Tenants

Wenn 25+ aktive Tenants: Wechsel auf Stripe-Subscriptions empfohlen. Migration:

- Bestehende Tenants laden Karte/SEPA in Wizard hoch
- Neue Tenants direkt via Stripe
- Auto-Mahn-Logik wird durch Stripe übernommen (Smart-Retries)
- Webapp zeigt nur noch Status, keine Mahn-Tasks mehr

---

## 7. Real-Time-Updates via WebSocket

### 7.1 Was live aktualisiert wird

- Task-Liste: neue Tasks, Status-Änderungen
- Customer-Chat: neue Nachrichten
- CI-Status: erfolgreiche/fehlgeschlagene Pipelines
- Tenant-Aktivität: neue Belege, Setup-Status-Änderungen

### 7.2 Implementation

- Backend: Socket.io-Server, gebunden an Auth-Session
- Frontend: Socket.io-Client subscribed auf `user:<userId>`-Channel und `tenant:*`-Channels (je nach Berechtigung)
- Backend pusht bei Events
- Frontend updatet via TanStack-Query-Cache-Invalidation

### 7.3 Fallback ohne WebSocket

- Polling alle 30 Sekunden
- Sichtbares Banner "Live-Updates getrennt — Polling aktiv"

---

## 8. Berechtigungs-Modell

| Rolle | Zugriff |
|---|---|
| **Geschäftsführer** | Alles. Tenant-CRUD, Mitarbeiter-Verwaltung, System-Einstellungen, Provisions-Übersicht, Notfall-Login. |
| **Mitarbeiter** | Tenant-Read + Begrenztes-Edit (Settings, aber keine Mitarbeiter-Verwaltung). Tasks. Beleg-Korrektur. Customer-Chat. |
| **Support** | Tasks (nur eigene + zugewiesene). Customer-Chat. Beleg-Korrektur. KEIN Tenant-Settings, KEINE Provisions-Übersicht. |

Implementiert als Middleware im Backend (Permission-Check pro Endpoint) + Frontend-UI versteckt nicht-erlaubte Aktionen.

---

## 9. UI-Design-Prinzipien

### 9.1 Konsistenz mit Discord

- Verwende Discord-Avatare wo möglich
- Erwähne andere User mit @-Notation (wie Discord)
- Discord-Status-Indikator ("Steve ist online" wenn aus Discord-Presence)

### 9.2 Geschwindigkeit > Schönheit

- Keine Animationen länger als 200ms
- Keine Lade-Spinner > 1 Sekunde sichtbar (vorher Skeleton)
- Tab-Wechsel: instantan via Cache

### 9.3 Tastatur-Shortcuts

- `cmd+k` — globale Suche
- `cmd+/` — Help-Overlay
- `g t` — Tasks
- `g k` — Kunden (Tenants)
- `g c` — Chat
- `n t` — neue Task
- `?` — alle Shortcuts anzeigen

### 9.4 Mobile

- Vollständig responsive (Mitarbeiter unterwegs reagieren auf Discord-Push, klicken Webapp-Link)
- Touch-friendly Buttons (mind. 44×44 Pixel)
- Bottom-Navigation auf Mobile (statt Sidebar)

---

## 10. Implementations-Reihenfolge

### 10.1 P1.1 (KW 21–22, Pilot-Vorbereitung)

- Auth-Flow (Discord-OAuth + Notfall-Login)
- TenantList + TenantDetail
- Beleg-Korrektur-View (manueller Upload + Korrektur, weil Steve in P1.1 selbst hochlädt)
- Basic Task-Liste

### 10.2 P1.2 (KW 23+, Pilot-Start)

- TenantSettings (Modul-Toggles, OAuth-Setups)
- TaskDetail + Auto-Trigger-Engine
- Customer-Chat-View (synchron mit Discord-Bridge)
- Real-Time-Updates via WebSocket

### 10.3 Phase 2 (M2 Reseller-Launch)

- ProvisionsOverview
- Auto-Rechnungs-Generator
- Mahn-Workflow

### 10.4 Phase 3 (M3+)

- EmployeeManagement
- SystemSettings
- Stripe-Migration

---

## 11. Tests

### 11.1 Unit-Tests (Vitest)

- Komponenten-Tests mit Testing-Library
- Hook-Tests
- Utility-Funktionen
- Coverage-Ziel: 80%

### 11.2 E2E-Tests (Playwright)

Kritische User-Flows:

- Login via Discord → Dashboard sichtbar
- Notfall-Login mit TOTP → Dashboard sichtbar
- TenantList → Tenant-Detail → Modul-Toggle ändern → Save erfolgreich
- TaskList → Task übernehmen → erledigen
- Beleg-Korrektur: Beleg öffnen → Felder ändern → speichern
- Customer-Chat: Nachricht senden → erscheint im Discord-Mock-Webhook

### 11.3 Visual Regression (optional Phase 2)

- Storybook + Chromatic für Komponenten-Snapshots

---

## 12. Bezug zu anderen Dokumenten

- `Discord_Integration.md` — Auth, Notification-Flow, Bot-Events
- `Web_Chat_Widget.md` — Customer-Chat-Backend, Magic-Link-System
- `Onboarding_Wizard.md` — Übergang Wizard → Tenant freischalten in Webapp
- `M14_User_Verwaltung_Auth.md` — Auth-Backend-Details
- `00_Vertriebsmodell.md` — Provisions-Berechnung-Logik

---

## 13. Was bewusst nicht in der Webapp ist

- **Customer-Login** — Wirte nutzen Wizard + Web-Chat-Widget, nicht die Webapp
- **Buchhaltungs-Tool** — keine eigene Buchhaltung, nur Übergabe an Steuerberater
- **Beleg-Hochladen für Customer** — geht über WhatsApp/Mail
- **Custom-Workflows pro Tenant** — kommt in Phase 3 als Hook-System (Pro-Paket)
- **Public-API für Drittanbieter** — kein API-Marketplace, kein OAuth-Provider für externe Apps

---

## 14. Zusammenfassung in einem Absatz

Die Mitarbeiter-Webapp ist das rein interne Verwaltungs-Tool für Steve, Andreas und zukünftige Mitarbeiter — erreichbar unter admin.prozesspilot.net. React + Vite + shadcn/ui, Login via Discord-OAuth (Standard) oder Notfall-Login mit TOTP (nur Geschäftsführer). Kern-Komponenten: Dashboard, Tenant-Management, Task-Dashboard mit Auto-Trigger-Engine, Beleg-Korrektur-View, Customer-Chat-Übersicht (synchron zur Discord-Bridge), Provisions-Übersicht (für Vertriebsagentur), Mitarbeiter-Verwaltung, System-Einstellungen. Real-Time-Updates via WebSocket. Berechtigungs-Modell: Geschäftsführer / Mitarbeiter / Support. Implementations-Reihenfolge: P1.1 Auth + Tenant-Basics + Beleg-Korrektur, P1.2 Volle Task-Engine + Customer-Chat + Real-Time, Phase 2 Provisions + Rechnungs-Automation, Phase 3 erweiterte Verwaltung + Stripe-Migration.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve (Frontend), Andreas (Backend-APIs)
