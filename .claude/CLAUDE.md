# Gastro — Master-Context für Claude Code

> Dieses Dokument wird bei **jeder Claude-Code-Session** automatisch geladen.
> Es liefert dir den Kontext, den du brauchst, um in diesem Repo sinnvoll zu arbeiten.

---

## 0. Namensgebung — Wichtig

In diesem Projekt unterscheiden wir zwei Namen:

| Name | Bedeutung |
|---|---|
| **Gastro** | Code-/System-/Produkt-Name. So heißt das System intern, im Repo, in technischer Doku, in ENV-Variablen, in DB-Namen, im Discord-Team-Server. |
| **ProzessPilot** | Firmenname + Marken-Brand für die Außen-Kommunikation. So heißt die Firma (Einzelunternehmen Steve Bernhardt) auf AGB, Rechnungen, Verträgen, Marketing-Website, im Sales-Pitch zum Wirt. |

**Beispiel-Sätze:**
- ✅ "Das Gastro-Backend läuft auf IONOS."
- ✅ "Die ProzessPilot-AGB sind im legal/-Ordner."
- ✅ "Der Wirt sieht 'ProzessPilot' im Web-Chat-Widget."
- ✅ "Das Discord-Team heißt 'Gastro Team'."
- ❌ "Das Gastro-Logo steht auf der AGB." (Falsch — Brand ist ProzessPilot)
- ❌ "ProzessPilot-Repo auf GitHub" (Falsch — Repo heißt `gastro`)

In **technischer Doku, Code-Kommentaren, Test-Beschreibungen, internen Notizen** schreibst du immer "Gastro".
In **Customer-facing-Texten, AGB, Sales-Material, Marketing-Inhalten** schreibst du "ProzessPilot".

---

## 1. Was Gastro ist

Gastro ist ein modulares SaaS-System für deutsche **Gastronomie-Kleinunternehmer**, das deren Steuerberater-Kosten senkt. Wirte schicken Belege per WhatsApp / E-Mail / Web-Chat, Gastro extrahiert per OCR + KI, kategorisiert mit Gastro-Spezialfällen (Bewirtung, MwSt-Splitting, Pfand), archiviert GoBD-konform und übergibt monatlich aufbereitet an den Steuerberater (DATEV / Lexware Office / sevDesk).

**USP (Außen-Kommunikation):** "ProzessPilot senkt deine Steuerberater-Kosten um 60–80 %, 3–5 Stunden Belegarbeit pro Monat sparen."

**Vertriebsmodell:** Eine externe Vertriebsagentur als Handelsvertreter im Namen der Firma ProzessPilot, 50 % Provision (Setup + recurring).

**Pricing:** 4 Pakete (Solo €39 / Standard €79 / Pro €149 / Filiale €299 pro Monat) plus Setup-Fee (€299 / €499 / €799 / €1499). 30 Tage Geld-zurück-Garantie, monatlich kündbar.

---

## 2. Wer wir sind

Gastro wird entwickelt von:

- **Steve Bernhardt** (Geschäftsführer, Vertrieb, Frontend-Verantwortung) — Inhaber der Firma ProzessPilot
- **Andreas** (Mit-Gründer, Backend, Infrastructure, Module-Verantwortung)

Beide haben **kaum Coding-Erfahrung**. Wir entwickeln **vollständig mit Claude Code**, ohne manuell Code zu schreiben. Dein Output muss daher:

- **Sehr hohe Qualität** haben (wir können Bugs nicht durch Code-Lesen finden)
- **Vollständig getestet** sein (Tests sind unser Beweis dass es funktioniert)
- **Sehr gut dokumentiert** sein (wir müssen das in 6 Monaten noch verstehen)
- **Sicherheits- und DSGVO-konform** sein (wir arbeiten mit Buchhaltungs-Daten von Endkunden)

---

## 3. Aktueller Stand — die WAHRHEIT (verifiziert 2026-06-06)

> Dieser Abschnitt ist der **Realitäts-Anker**. Erstellt am 2026-06-06 durch beweisgestützte Code-Verifikation (Read-only-Agenten, je Befund mit Datei:Zeile + Migration-Abgleich) gegen `main`.
> **Anker-Logik:** `Modulkonzept/` = **Ziel-Zustand** · dieser Abschnitt = **was WIRKLICH läuft** · `/start-task` = **der Weg dazwischen**.
> Wenn eine Modul-Spec und dieser Abschnitt sich widersprechen, gilt für „was geht" **dieser Abschnitt**. Specs beschreiben das Ziel, nicht den Ist-Zustand.

### 3.1 Zwei-Welten-Realität (Wurzel des Drifts)

Es gab einen Schema-Reboot auf die **`tenants`/`belege`-Welt**. Real existieren genau **14 Tabellen** (`CREATE TABLE` in `backend/migrations/`, angewendet von `backend/src/core/db/migrate.ts`):
`tenants` · `tenant_settings` · `users` · `auth_sessions` · `auth_audit_log` · `belege` · `kasse_integrations` · `kasse_transactions` · `pos_credentials` · `export_log` · `audit_log` · `ocr_cost_log` · `dsgvo_requests` · `booking_credentials`.

Die **alte Welt** (`receipts`, `customers`, `customer_profiles`, `categories`, `suppliers_global`, `monthly_reports`, `communications`, `customer_credentials`, `customer_hooks`, … 20+ „Geister-Tabellen") existiert **nirgends** — kein `CREATE TABLE` im ganzen Repo (die `CREATE TABLE IF NOT EXISTS` in `Modulkonzept/.../prompts/terminal-tasks/*.txt` sind Prompt-Text, werden nie ausgeführt). **Jeder Code-Pfad, der eine Geister-Tabelle anfasst, wirft zur Laufzeit HTTP 500.**

In `backend/src/app.ts` sind **beide Welten gleichzeitig registriert**:
- **LIVE-Block** (≈ Z. 224–257): lebende belege-Welt + Auth + M15 + Health/SSE/Docs/Webhooks.
- **Toter `apiApp`-Block** (≈ Z. 263–313): ~30 Routen auf `/receipts`- und `/customers`-Prefixen gegen Geister-Tabellen → 500. **Alle n8n-Workflows rufen genau diese toten Pfade** → die n8n-Pipeline bringt nichts durch.

### 3.2 Was WIRKLICH läuft (LIVE-Kern, beweisgestützt)

| Bereich | Status | Beweis |
|---|---|---|
| Belege-Upload + OCR (M01, belege-Pfad) | ✅ LIVE | `belege.routes.ts` → `app.ts:233` `/api/v1/belege/*`; OCR läuft **async via Queue/Worker** (`ocr-worker.ts`) beim Upload + `/belege/:id/reprocess` — es gibt **keinen** `/extract`-Endpoint |
| Lexware-Office-Export (M05, belege-Pfad) | ✅ LIVE | `belege-routes.ts` → `app.ts:236` `/api/v1/belege/:id/exports/lexware` + `/exports/lexware/batch` (`booking_credentials`/`export_log`) |
| DSGVO (M12, **v2**) | ✅ LIVE | `dsgvoV2Routes` → `app.ts:240` `/api/v1/dsgvo` (`dsgvo_requests`/`belege`/`audit_log`) |
| Auth (M14, **Discord-OAuth + Notfall-TOTP**) | ✅ LIVE | `m14-auth/` → `app.ts:224-225` (`users`/`auth_sessions`/`auth_audit_log`) |
| SumUp / Kasse (M15) | ✅ LIVE | `app.ts:228/230` `/api/v1/m15/*` (`kasse_*`/`pos_credentials`) — vollständig live |
| Multi-Tenancy / RLS-Fundament | ✅ LIVE | RLS-GUC `app.current_tenant` (T041); Tabellen `tenants`/`tenant_settings` |
| GoBD-Basics auf belege-Pfad | ✅ LIVE | zentrales `logAuditEvent` (richtige Spalten), Idempotenz-Hash, Soft-Delete |

### 3.3 Die EINE offene Bau-Lücke (Pilot-Blocker)

**Kategorisieren auf belege fehlt (M03 = Schritt F2).** Die M03-Logik existiert nur auf der toten `/receipts`-Welt (5 Geister-Tabellen: `receipts`, `categories`, `customer_categories`, `suppliers_global`, `categorization_cache` + `audit_log`-Spalten-Mismatch). Es gibt **keinen** `POST /api/v1/belege/:id/categorize`. Das ist die **einzige** funktionale Bruchstelle im sauberen Pilot-Pfad. (Nur `GET /categories` funktioniert — liefert eine In-Memory-Konstante.)

### 3.4 Tote Hülle — eingefroren, NICHT anfassen

**Spec'd, aber nicht lauffähig** (laufen gegen Geister-Tabellen → 500). Einfrieren ≠ Löschen — bleiben für Post-Pilot-Reaktivierung:

- **Komplett tot:** M02 (Archiv) · M04 (DATEV) · M06 (sevDesk) · M07 (Excel/Sheets) · M08 (Reporting) · M09 (Lieferanten-Komm.) · M10 (WhatsApp) · M11 (IMAP) · M13 (Steuerberater-Portal, Ordner `m06-advisor-portal`).
- **Tote Legacy-Module:** `customers` · `profiles` · `receipts` · `_shared/receipts` · `_shared/customers` · `plugin-system` · `routing` · `core/hooks` · das **`users`-Modul** (Email+Passwort, Token-Refresh — **gefährlich im LIVE-Block** `app.ts:241-243`, aber gegen Geister `refresh_tokens`/`auth_events` + falsche `users`-Spalten → 500).
- **Halbtot (lebender Kern + tote Alt-Routen am selben Modul):** M01 (`/receipts/:id/extract` tot) · M05 (`/receipts`+`/customers`-Routen tot) · M12 (alt-`dsgvoRoutes` tot) · **`/tenants`-Management-Route** (Spalten-Drift `name`/`active` → 500, vgl. Memory `legacy-welt-schema-drift`).

### 3.5 Restliche Bestandsaufnahme

| Bereich | Stand |
|---|---|
| **Konzept** | Ziel-Zustand, dokumentiert in `Modulkonzept/Konzeptentwicklung/` |
| **Code-Repo / Firma** | Repo `gastro`; Firma ProzessPilot (Einzelunternehmen Steve Bernhardt, Schneverdingen) |
| **Webapp** | Existiert, Umbau zu rein-internem Mitarbeiter-Tool |
| **Onboarding-Wizard / Web-Chat-Widget / Discord-Integration** | Noch nicht gebaut (eingefroren bis der Pilot zahlt) |
| **CI/CD** | Aktiv (`.github/workflows/ci-backend.yml`). ⚠️ DB-Tests **skippen still** ohne `PP_E2E=1` → „grün" verbirgt toten Code |
| **Pilot-Wirt** | Lexware-Office-Steuerberaterin, SumUp Lite Kasse |

### 3.6 Pilot-Scope — das EINZIGE bis zum ersten zahlenden Kunden

Ein Pilotkunde. Der Pilot wird **durch Streichen** fertig, nicht durch Bauen.

```
Beleg rein (1 Kanal: Foto/Upload)
  → OCR            (M01, belege — async via OCR-Worker, KEIN /extract-Endpoint)
  → Kategorisieren (M03, auf belege — DIE Bau-Lücke F2)
  → Lexware-Export (M05, belege → Lexware Office)
  → sichtbar, dass es geklappt hat (Smoke-Test)
```

- Eingangsbelege (Ausgaben) **und** täglicher Z-Bon/Tagesabschluss (Einnahmen) gehen denselben Upload-Weg; der Wirt lädt den Z-Bon manuell hoch.
- **M15/SumUp-Auto-Connector ist NICHT im Pilot-Kern** (Z-Bon manuell). Code läuft, bleibt liegen — kein kritischer Pfad.
- Multi-Tenancy/RLS läuft mit — nicht ausbauen, nur nicht anfassen.
- **Keine** Pilot-Hardcodes (`if tenant == pilot`); alles Kundenabhängige in Tenant-Config/Profil → Kunde 2 = neue Tenant-Zeile, kein Rewrite.

**Offene Pilot-Schritte (Reihenfolge):** **F1** Legacy-Routen/-Module aus `app.ts` entfernen → **F2** `POST /belege/:id/categorize` bauen (M03-Logik auf belege umhängen) → **F3** EINEN n8n-Pilot-Workflow auf belege (`upload → OCR-Worker → categorize → lexware/batch`) → **F4** Smoke-Test (echter Beleg bis Lexware Office) → **F5** grün + kein aktiver `customers`/`receipts`-Bezug mehr.

### 3.7 Arbeitsregeln (verbindlich, gelten für jeden Auftrag)

- **Eine Aufgabe zur Zeit. Ein Terminal. Keine autonomen Parallel-Schreib-Läufe**, bis der Pilot zahlt — Parallelität war der Drift-Motor.
- **Tor pro Bau-Schritt:** `npm run build` + `npm test` grün **und** Pilot-Smoke-Test grün, **bevor** der nächste Schritt startet.
- **Jede Task nennt ihren Anker:** den betroffenen Konzept-§ (z. B. „nach `M05_Lexoffice_Integration.md` §4") oder das Code-Modul. Bei Spec-Lücke Frage dokumentieren, **nicht raten**.
- **Der Weg ist `/start-task`** (Backlog → Branch → PR → Review → Merge). Kein direkter Push auf `main`.
- **Read-only-Workflows** (dynamic) sind für Breite/Discovery/Review erlaubt; **Schreiben nur sequenziell** durch den Orchestrator — nie durch parallele Schreib-Agenten.
- **Neue Funktion / neues Modul = „nach dem Pilot". Immer.**

---

## 4. Wichtige Konzept-Dokumente

Lies diese Dokumente bei Bedarf:

| Datei | Wann lesen |
|---|---|
| `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` | Bei jeder neuen Session zuerst überfliegen |
| `Modulkonzept/Konzeptentwicklung/00_Strategie_Gastro.md` | Wenn Strategie/Markt-Bezug wichtig |
| `Modulkonzept/Konzeptentwicklung/00_Pilot_Strategie.md` | Bei Pilot-spezifischen Tasks |
| `Modulkonzept/Konzeptentwicklung/00_Vertriebsmodell.md` | Bei Vertriebs/Provisions-Themen |
| `Modulkonzept/Konzeptentwicklung/01_Datenmodell_Events.md` | Bei Backend-Task — Receipt-Schema |
| `Modulkonzept/Konzeptentwicklung/02_Kundenprofil_System.md` | Wenn Tenant/Customer-Logik |
| `Modulkonzept/Konzeptentwicklung/03_n8n_Workflows.md` | Bei n8n-Task |
| `Modulkonzept/Konzeptentwicklung/04_Erweiterbarkeit_Pro.md` | Bei Hooks oder Custom-Plugin-Tasks |
| `Modulkonzept/Konzeptentwicklung/05_Roadmap.md` | Für Priorisierungs-Fragen |
| `Modulkonzept/Konzeptentwicklung/Claude_Code_Workflow.md` | **Pflicht-Lektüre** |
| `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` | Bei Webapp-Tasks |
| `Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md` | Bei Wizard-Tasks |
| `Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md` | Bei Web-Chat-Tasks |
| `Modulkonzept/Konzeptentwicklung/Discord_Integration.md` | Bei Discord-Bot-Tasks |
| `Modulkonzept/Konzeptentwicklung/modules/M0X_*.md` | Bei Tasks zu konkreten Modulen |

---

## 5. Verbindliche Architektur-Regeln

### 5.1 Trennung n8n vs. Backend

- **n8n:** Trigger, Routing, externe API-Calls, Branching
- **Backend:** Validierung, Persistenz, Business-Regeln, Idempotenz, Hooks
- Daumenregel: Wenn n8n-Function-Node länger als 20 Zeilen → gehört ins Backend

### 5.2 Drei Frontends — nicht vermischen

- `admin.prozesspilot.net` = **Mitarbeiter-Webapp** (intern, von Gastro-Mitarbeitern genutzt)
- `setup.prozesspilot.net` = **Onboarding-Wizard** (Customer einmalig)
- `chat.prozesspilot.net` bzw. `prozesspilot.net/c/{token}` = **Web-Chat-Widget** (Customer bei Bedarf)
- Endkunden (Wirte) sehen NIE die Mitarbeiter-Webapp

(Domain-Names sind ProzessPilot-Brand-Domains; das System dahinter heißt Gastro.)

### 5.3 Authentifizierung

- **Mitarbeiter-Login:** Discord OAuth 2.0 (Standard) + Notfall-Login mit Email+TOTP (nur Geschäftsführer)
- **Customer-Touchpoints:** Magic-Link mit Token in DB, kein Account
- **n8n ↔ Backend:** HMAC-Header

### 5.4 DSGVO + EU-Hosting

- IONOS EU als Default
- Google Vision API EU-Region (`europe-west3`)
- Anthropic Claude: SCCs gemäß DPA
- Discord Inc.: SCCs, im AVV als Subunternehmer genannt
- **Customer-Daten bleiben in EU-DB**, Discord ist nur Spiegelung

### 5.5 Multi-Tenancy

- Jede DB-Tabelle hat `tenant_id`-Spalte
- Backend-Middleware setzt RLS (Row-Level Security) in Postgres
- Jeder API-Request muss mit Tenant-Context laufen

### 5.6 Idempotenz

- Jeder eingehende Beleg: `SHA256(file_bytes + tenant_id)` als Hash
- Vor Verarbeitung: Hash-Check in DB

### 5.7 Audit-Log

- Jeder Statuswechsel eines Belegs: `audit_log` (Postgres)
- Auch Auth-Events (Login, Notfall-Login, Logout) loggen

### 5.8 Module

- Ein **Modul** = kunden-aktivierbares Funktions-Paket (n8n-Workflow + Backend-Code + DB + Spec)
- Pro Tenant togglebar
- Interne Werkzeuge (Tenant-Mgmt, Task-Dashboard) sind **keine Module**, sondern **Webapp-Komponenten**

---

## 6. Verbindliche Coding-Standards

### 6.1 Sprache und Tech-Stack

- **Backend:** Node.js 20 + TypeScript (strict mode) + Fastify
- **Frontend:** React + Vite + TailwindCSS
- **DB:** PostgreSQL 16 mit raw SQL (kein ORM, nur `pg`-Driver direkt)
- **Cache/Events:** Redis 7 Streams
- **Storage:** MinIO (S3-kompatibel)
- **Tests:** Vitest für Unit, Playwright für E2E
- **Discord-Bot:** discord.js v14+

### 6.2 Naming-Conventions

| Was | Convention | Beispiel |
|---|---|---|
| TypeScript-Variablen + Funktionen | camelCase | `processReceipt` |
| TypeScript-Klassen + Types | PascalCase | `ReceiptProcessor` |
| DB-Tabellen | snake_case Plural | `receipts`, `chat_messages` |
| DB-Spalten | snake_case | `tenant_id`, `created_at` |
| JSON-Felder (API + DB) | snake_case | `receipt_id`, `from_type` |
| n8n-Workflow-Namen | `WF-<Domain>-<Variant>` | `WF-M15-SUMUP-PULL` |
| Events (Redis Streams) | `pp.<entity>.<verb_past>` oder `gastro.<entity>.<verb_past>` | `gastro.receipt.extracted` |
| Branches | `<owner>/T<id>-<kurz>` | `andreas/T015-sumup-oauth` |
| ENV-Variablen | `GASTRO_*` Präfix für eigene, sonst Service-spezifisch | `GASTRO_DATABASE_URL`, `DISCORD_BOT_TOKEN` |
| DB-Name | `gastro_*` | `gastro_dev`, `gastro_test`, `gastro_prod` |
| npm-Package | `@gastro/<paket>` | `@gastro/backend`, `@gastro/webapp` |

### 6.3 TypeScript-Strenge

- `strict: true` immer
- `noImplicitAny: true`
- `strictNullChecks: true`
- Type-Casts (`as`) nur in Ausnahmen, mit Kommentar warum
- Keine `any`-Types ohne explizite Begründung im Kommentar

### 6.4 Tests sind Pflicht

- Unit-Tests: jede public-Funktion, mindestens Happy-Path + ein Fehler-Pfad
- Integration-Tests: jeder API-Endpoint, jeder Service-Call
- E2E-Tests: kritische User-Flows
- Coverage-Mindestziel: 80 %
- Wenn neue Funktion ohne Test → CI schlägt fehl

### 6.5 Migrations-Regeln

- Eine Migration pro PR
- Rückwärts-kompatibel
- Mit Rollback-Skript
- Nummerierung fortlaufend: `040_sumup_credentials.sql`
- Bei Konflikt mit anderer Migration in PR: später-PR muss umnummerieren

### 6.6 Sicherheit + Secrets

- **NIE** Secrets im Code committen
- **NIE** Secrets in Logs schreiben
- **NIE** `.env`-Files committen
- **NIE** PII in Logs
- API-Keys: in Postgres mit `pgcrypto` verschlüsselt
- Discord-Bot-Token: in `.env.prod`

---

## 7. Workflow-Regeln

### 7.1 Branch-Naming

- `steve/T0XX-<kurz>` für Steve's Tasks
- `andreas/T0XX-<kurz>` für Andreas' Tasks
- `server/T0XX-<kurz>` für IONOS-Tasks
- `gemeinsam/T0XX-<kurz>` für Pair-Programming

### 7.2 Commit-Messages

```
<Typ>: <Kurzbeschreibung in 50 Zeichen>

<Optional: längere Beschreibung>

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: <Name> <email@prozesspilot.net>
```

Typen: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`

### 7.3 PR-Workflow

1. Task aus `tasks/_backlog/` nehmen → `/start-task T0XX`
2. Implementieren mit Tests
3. Lokal: `npm run lint && npm run typecheck && npm test`
4. `/finish-task` → PR auf GitHub
5. Anderer Mensch: `/review-pr <pr-number>` → code-reviewer-Agent läuft
6. Bei Approve + CI grün: Merge per Squash
7. Auto-Deploy auf IONOS

### 7.4 Wenn du etwas nicht weißt

- **Zuerst:** Konzept-Doku in `Modulkonzept/Konzeptentwicklung/` lesen
- **Dann:** existierenden ähnlichen Code im Repo als Vorlage nehmen
- **Wenn immer noch unklar:** Frage in Task-Datei dokumentieren, NICHT raten
- **Niemals:** Annahmen treffen ohne sie zu dokumentieren

---

## 8. Was du IMMER machen sollst

- **Tests schreiben** zu jedem Code (nutze test-writer-Agent)
- **Coding-Standards einhalten** (Naming, TypeScript-Strenge, Sicherheit)
- **Migrations rückwärts-kompatibel** schreiben
- **Klare Commit-Messages** mit Co-Authored-By Trailer
- **Existierende Patterns folgen**
- **Bei Schnittstellen-Änderungen** zuerst Spec aktualisieren, dann Code
- **Bei Unsicherheit** Frage stellen statt raten
- **Namen-Konvention beachten:** Code = Gastro, Außen-Kommunikation = ProzessPilot

## 9. Was du NIEMALS machen sollst

- **Direkten Push auf main** (Branch-Protection verhindert es eh)
- **`rm -rf` ohne Bestätigung**
- **Production-DB direkt manipulieren** (nur via Migrations)
- **Secrets im Code** committen
- **PII in Logs** schreiben
- **Tests überspringen**
- **Custom-Lösung wenn etablierter Pattern existiert**
- **Annahmen treffen** über Spec-Lücken
- **"Gastro" in Customer-facing Texten verwenden** (außer Brand ist explizit gemeint)

---

## 10. Wenn du diese Datei liest, sag das im ersten Output

Damit der Mensch weiß dass du den Kontext geladen hast, sage am Anfang deiner ersten Antwort kurz:

> "Master-Context Gastro geladen — ich kenne Architektur, Coding-Standards, Workflow-Regeln und die Namens-Trennung (Gastro intern, ProzessPilot extern)."

Dann mache mit der eigentlichen Aufgabe weiter.
