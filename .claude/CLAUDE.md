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

## 3. Aktueller Stand — die WAHRHEIT (verifiziert 2026-06-06 · Pilot-Pfad F1–F5 geschlossen 2026-06-13)

> Dieser Abschnitt ist der **Realitäts-Anker**. Erstellt am 2026-06-06 durch beweisgestützte Code-Verifikation (Read-only-Agenten, je Befund mit Datei:Zeile + Migration-Abgleich) gegen `main`; aktualisiert 2026-06-13 nach Abschluss des Pilot-Pfads (T046–T051).
> **Anker-Logik:** `Modulkonzept/` = **Ziel-Zustand** · dieser Abschnitt = **was WIRKLICH läuft** · `/start-task` = **der Weg dazwischen**.
> Wenn eine Modul-Spec und dieser Abschnitt sich widersprechen, gilt für „was geht" **dieser Abschnitt**. Specs beschreiben das Ziel, nicht den Ist-Zustand.
>
> **Pilot-Pfad-Stand (2026-06-13):** P0 (Vision-EU) ✅ · F1 (Legacy aus app.ts) ✅ · F2 (categorize auf belege LIVE) ✅ · F3 (n8n eingefroren, Pilot Webapp-getrieben) ✅ · F4 (Operator-Smoke-Skript) ✅ · F5 (grün + kein Geister-Tabellen-Bezug, dieser Abschnitt) ✅. Der saubere Pilot-Pfad ist durchgängig.
>
> **⚠️ Strategiewechsel (2026-06-15, GF Steve):** Der Testkunde **zahlt nie** — er ist ein Test-Objekt. Das frühere Tor „bauen erst wenn der Pilot zahlt" **entfällt**. Neues Ziel: **Build-out** — das System so weit fertig bauen, dass der Testkunde **alles** selbst durchspielt (Onboarding → Eingangskanal → OCR → Kategorisierung → Export → Support-Chat). Eingangskanal = **Web-Chat-Widget** (Kanal **und** Support in einem). Realistisch ~11–15 Wo bis Test-Ziel, ~16–24 Wo bis alle Module testbar (Gap-Analyse 2026-06-15, siehe `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md`). **Die Anti-Drift-Disziplin (§3.7) bleibt voll gültig — nur das Zahlungs-Tor fällt.** Folge-Tasks T052/T053/T054 erledigt (SKR-Divergenz + Bewirtungs-Schutz geschlossen).

### 3.1 Zwei-Welten-Realität (Wurzel des Drifts — jetzt aufgelöst)

Es gab einen Schema-Reboot auf die **`tenants`/`belege`-Welt**. Real existieren **15 Tabellen** (`CREATE TABLE` in `backend/migrations/`, angewendet von `backend/src/core/db/migrate.ts`):
`tenants` · `tenant_settings` · `users` · `auth_sessions` · `auth_audit_log` · `belege` · `kasse_integrations` · `kasse_transactions` · `pos_credentials` · `export_log` · `audit_log` · `ocr_cost_log` · `dsgvo_requests` · `booking_credentials` · `lexoffice_category_map` (Letztere via Migration 120/T054 — vorher referenzierte `category.mapper.ts` sie als „Geister-Tabelle").

Die **alte Welt** (`receipts`, `customers`, `customer_profiles`, `categories`, `suppliers_global`, `monthly_reports`, `communications`, `customer_credentials`, `customer_hooks`, … 20+ „Geister-Tabellen") existiert **nirgends** — kein `CREATE TABLE` im ganzen Repo (die `CREATE TABLE IF NOT EXISTS` in `Modulkonzept/.../prompts/terminal-tasks/*.txt` sind Prompt-Text, werden nie ausgeführt).

**Stand 2026-06-13 (F1/F5 erledigt):** Der frühere tote `apiApp`-Block in `app.ts` (~30 Routen auf `/receipts`-/`/customers`-Prefixen gegen Geister-Tabellen) wurde in **T047** entfernt — übrig blieb nur das öffentliche `GET /api/v1/categories` (In-Memory-Konstante). In **T051** wurde der letzte isoliert-tote Cluster gelöscht (Alt-`m03-categorization`-receipts-Pfad, `_shared/receipts`, `core/hooks/hook-runner` + `hook.repository`/`hook.types`). `git grep -nE "(FROM|INTO|UPDATE|JOIN)\s+(receipts|customers|customer_profiles|suppliers_global|categorization_cache|customer_categories)"` über `backend/src` (ohne Tests) = **0**. Es gibt im aktiven Code **keinen** Geister-Tabellen-Pfad mehr, der zur Laufzeit 500 wirft.

### 3.2 Was WIRKLICH läuft (LIVE-Kern, beweisgestützt)

| Bereich | Status | Beweis (alle Routen im LIVE-Block von `app.ts`, JWT-geschützt) |
|---|---|---|
| Belege-Upload + OCR (M01, belege-Pfad) | ✅ LIVE | `belege.routes.ts` → `/api/v1/belege/*`; OCR läuft **async via Queue/Worker** (`ocr-worker.ts`) beim Upload + `/belege/:id/reprocess` — es gibt **keinen** `/extract`-Endpoint |
| **Kategorisieren (M03, belege-Pfad)** | ✅ **LIVE (T048)** | `belege-categorize.routes.ts` → `POST /api/v1/belege/:id/categorize`; Claude-Tool-Use über `system-categories.ts` (14 Kategorien), Status-Gate `extracted`, Threshold 0.75 → `categorized`/`requires_review`; ohne `CLAUDE_API_KEY` → `requires_review` |
| Lexware-Office-Export (M05, belege-Pfad) | ✅ LIVE | `belege-routes.ts` → `POST /api/v1/belege/:id/exports/lexware` + `POST /api/v1/exports/lexware/batch` (`booking_credentials`/`export_log`) |
| DSGVO (M12, **v2**) | ✅ LIVE | `dsgvoV2Routes` → `/api/v1/dsgvo` (`dsgvo_requests`/`belege`/`audit_log`) |
| Auth (M14, **Discord-OAuth + Notfall-TOTP**) | ✅ LIVE | `m14-auth/` → `/api/v1/auth/discord/*` + `/api/v1/auth/notfall/login` (`users`/`auth_sessions`/`auth_audit_log`); JWT-Cookie `pp_auth` |
| SumUp / Kasse (M15) | ✅ LIVE | `/api/v1/m15/*` (`kasse_*`/`pos_credentials`) — vollständig live |
| Multi-Tenancy / RLS-Fundament | ✅ LIVE | RLS-GUC `app.current_tenant` (T041); Tabellen `tenants`/`tenant_settings` |
| GoBD-Basics auf belege-Pfad | ✅ LIVE | zentrales `logAuditEvent` (richtige Spalten), Idempotenz-Hash, Soft-Delete |
| Kategorien-Liste | ✅ LIVE | `GET /api/v1/categories` (öffentlich, In-Memory-Konstante) |

### 3.3 Bau-Lücke geschlossen (F2 erledigt)

**Kategorisieren auf belege ist LIVE (T048).** Der frühere Pilot-Blocker — „M03-Logik existiert nur auf der toten `/receipts`-Welt" — ist behoben: `POST /api/v1/belege/:id/categorize` läuft im LIVE-Block (siehe §3.2). Der alte receipts-Kategorisierungs-Pfad (gegen `customer_categories`/`suppliers_global`/`categorization_cache`) wurde in **T051** ersatzlos gelöscht. Damit hat der saubere Pilot-Pfad **keine funktionale Bruchstelle** mehr.

Folge-Punkte erledigt (2026-06-15): **T052** SKR-Konto-Divergenz (SSoT + Status-Gate) ✅ · **T054** SKR-Konto→Lexware-categoryId-UUID (Migration 120, RLS, Heuristik) ✅ · **T053** Bewirtungs-Kategorie-Overwrite-Schutz ✅. Damit ist die SKR-Divergenz End-to-End geschlossen und der Bewirtungs-Sonderfall geschützt. Offen im Backlog: **T055** (Bewirtungs-Memo-Felder-category-Gate, P3).

### 3.4 Eingefroren vs. entfernt (Stand 2026-06-13)

Der frühere „tote Hülle"-Code wurde im Pilot-Pfad (T047/T051) **größtenteils gelöscht**, statt nur eingefroren. Der aktuelle Stand:

- **⚠️ AKTUALISIERT 2026-06-30:** Seit 2026-06-15 ist deutlich mehr gebaut als unten ursprünglich vermerkt. **Bereits gebaut + LIVE (registriert in `app.ts`):** Fundament (`core/mail`, `core/pdf`, Task-System `m-tasks`), **M08 Reporting** (inkl. Monats-Cron), **Onboarding-Wizard (M16)**, **Web-Chat-Widget (`m-webchat`)** sowie der Live-Kern M01/M03/M05/M12/M14/M15. (Verifiziert per Discovery 2026-06-30; vgl. Memory `buildout-phase-status`.)
- **Wirklich noch nicht gebaut — nur Spec/Tasks (Stand 2026-06-30):** M02 (Archiv) · M04 (DATEV) · M06 (sevDesk) · M07 (Excel/Sheets) · M09 (Lieferanten-Komm.) · M10 (WhatsApp) · M11 (E-Mail/IMAP) · M13 (Steuerberater-Portal). Diese haben **keinen** Ordner unter `backend/src/modules/` — sie leben in `Modulkonzept/Konzeptentwicklung/modules/` + `tasks/_eingefroren/`. Werden auf der **belege-Welt neu gebaut** (NICHT die alten Specs 1:1 — die zielen auf tote Geister-Tabellen). Reihenfolge: `00_Buildout_Roadmap.md`. M10 (WhatsApp) gated (Meta-Verifizierung); M02/M04/M06/M07/M13 = Phase E.
- **Code entfernt (T047/T051):** `customers` · `profiles` · `receipts` · `_shared/receipts` · `_shared/customers` · `plugin-system` · `routing` · `core/hooks/hook-runner` (+ `hook.repository`/`hook.types`) · das **`users`-Modul** (Email+Passwort) · der Alt-`m03-categorization`-receipts-Pfad · `core/adapters/booking/lexoffice/auth.ts` (`customer_credentials`) · der tote `apiApp`-Block in `app.ts`. Reversibel über die Git-Historie (Branches/Tags der jeweiligen PRs).
- **Legacy-`customer`-Welt-Drift ✅ abgebaut (2026-06-30):** `backend/src/modules/tenants/` toter `tenant.routes.ts` + Falsch-Spalten-CRUD entfernt (T043, PR #227); übrig nur die live `tenantExists` (RLS-sicher über SECURITY-DEFINER `tenant_exists()`, Migration 130). Ebenso entfernt: totes `core/audit/audit.service.ts` (#226) + toter Legacy-Schema-Cluster `core/schemas/{customer,document,routing-job,tenant,profile}.ts` (#230). Memory `legacy-welt-schema-drift` = vollständig gelöst.
- **Module mit lebendem Kern (Alt-Routen bereits entfernt):** M01 (kein `/extract` mehr) · M05 (nur belege-Export) · M12 (nur DSGVO v2).

### 3.5 Restliche Bestandsaufnahme

| Bereich | Stand |
|---|---|
| **Konzept** | Ziel-Zustand, dokumentiert in `Modulkonzept/Konzeptentwicklung/` |
| **Code-Repo / Firma** | Repo `gastro`; Firma ProzessPilot (Einzelunternehmen Steve Bernhardt, Schneverdingen) |
| **Webapp** | ✅ Reboot zur internen Staff-Admin-App erledigt (T058/T059/T065); saubere Multi-Tenant-App (TenantSelector, Belege-Liste/Detail mit Live-SSE, Chats, Tasks, Mandanten). Geister-Routes entfernt. |
| **Onboarding-Wizard / Web-Chat-Widget** | ✅ Beide gebaut + live (M16 `setup.*`, `m-webchat` `chat.*`). Web-Chat = Eingangskanal **+** Support. Offene Wizard-Folge-PRs: echtes Lexware/Drive/Dropbox-OAuth, Live-Test-Beleg (GF-entschieden ausgelassen). |
| **Discord-Integration** | Nur Auth-OAuth (M14) gebaut; Bot/Bridge offen (Phase E). Customer-Bridge GESTRICHEN (Support nur über Web-Chat, Memory `support-via-webchat-no-discord-bridge`). |
| **Fundament (Querschnitt)** | ✅ Alle gebaut + genutzt: **Mail-Service** (`core/mail`, T057), **PDF-Engine** (`core/pdf`, T086/T088), **Task-System** (`m-tasks`, T080-T082). |
| **CI/CD** | Aktiv (`.github/workflows/ci-backend.yml`). ⚠️ DB-Tests **skippen still** ohne `PP_E2E=1` → „grün" verbirgt toten Code |
| **Pilot-Wirt** | Lexware-Office-Steuerberaterin, SumUp Lite Kasse |

### 3.6 Build-out-Scope — vollständiger Test-Durchlauf (Testkunde zahlt nicht)

**Strategie ab 2026-06-15:** Der Testkunde zahlt nie (Test-Objekt). Ziel ist **nicht** mehr „minimaler Pilot durch Streichen", sondern ein **Build-out**, bis der Testkunde den **kompletten Flow selbst** durchspielen kann. Gebaut wird — aber **sequenziell + reviewed** (§3.7), nie als paralleler Blind-Schreib.

**Die LIVE-Mitte (✅, beweisgestützt §3.2) — darauf wird gebaut:**

```
  → OCR            (M01, belege — async via OCR-Worker, KEIN /extract-Endpoint)   ✅ LIVE
  → Kategorisieren (M03, POST /api/v1/belege/:id/categorize — T048)               ✅ LIVE
  → Lexware-Export (M05, POST /api/v1/exports/lexware/batch → Lexware Office)      ✅ LIVE
```

**Der Ziel-Flow „Testkunde spielt alles selbst durch" — Stand 2026-06-30 (weitgehend gebaut):**

```
Onboarding (Wizard, setup.prozesspilot.net)   → ✅ GEBAUT (M16)
  → Eingangskanal: Web-Chat-Widget            → ✅ GEBAUT (m-webchat, Beleg-Upload)
  → [ LIVE-Mitte: OCR → Kategorisieren → Export ]                ✅ (+ Live-Status-SSE T074)
  → Support-Chat (dasselbe Web-Chat-Widget)   → ✅ GEBAUT
  → Staff-Betreuung (Mitarbeiter-Webapp + Task-System)          → ✅ GEBAUT (Webapp-Reboot + m-tasks)
```
Offen für den vollständigen Selbst-Durchlauf: echtes Lexware/Drive/Dropbox-OAuth im Wizard + die externen Prod-Credentials (Vision/Claude/SMTP/Lexware/MinIO/Discord — alle in `tasks/MANUELLE_AUFGABEN.md`, gated). Der Code-Pfad steht.

- **Eingangskanal-Entscheidung:** Web-Chat-Widget ist Eingang **und** Support in einem (Wirt schickt Belege übers Widget, bekommt dort auch Hilfe). E-Mail/WhatsApp = spätere Kanal-Breite (Phase D).
- **Fundament zuerst (Phase A):** generischer Mail-Service · PDF-Engine · Webapp-Reboot (Legacy-Kunden-App → internes Staff-Tool). Diese drei entriegeln Wizard/Web-Chat/Reporting.
- Multi-Tenancy/RLS, GoBD-Basics laufen mit — nicht anfassen, nur drauf bauen.
- **Keine** Hardcodes (`if tenant == pilot`); alles Kundenabhängige in Tenant-Config/Profil.
- **Phasen + Größen + Reihenfolge:** `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md` (Gap-Analyse 2026-06-15). Grob: Phase 0 (manuelle Bootstraps) → A (Fundament) → B (Wizard + Kanal) → C (Support-Chat + Task-System) = Test-Ziel (~11–15 Wo) → D/E (Breite, restliche Module).

Der frühere Pilot-Pfad F1–F5 (T046–T051) ist abgeschlossen und bildet die saubere LIVE-Basis. **Ab hier gilt §3.7: Module werden gebaut — sequenziell, reviewed, ein Terminal.**

### 3.7 Arbeitsregeln (verbindlich, gelten für jeden Auftrag)

- **Eine Aufgabe zur Zeit. Ein Terminal. Keine autonomen Parallel-Schreib-Läufe — IMMER** (gilt auch im Build-out). Parallelität war der Drift-Motor; diese Regel fällt **nicht** mit dem Zahlungs-Tor.
- **Tor pro Bau-Schritt:** `npm run build` + `npm test` grün **und** (sofern relevant) Smoke-Test grün, **bevor** der nächste Schritt startet. ⚠️ DB-Tests mit `PP_E2E=1` laufen lassen, sonst „grün" verbirgt toten Code.
- **Jede Task nennt ihren Anker:** den betroffenen Konzept-§ (z. B. „nach `M05_Lexoffice_Integration.md` §4") oder das Code-Modul. Bei Spec-Lücke Frage dokumentieren, **nicht raten**.
- **Der Weg ist `/start-task`** (Backlog → Branch → PR → `/review-pr` (code-reviewer) → Merge). Kein direkter Push auf `main`. Task-Datei nach Merge manuell nach `_done` (Mini-PR).
- **Read-only-Workflows / Ultracode** sind für Breite/Discovery/Design/Review erlaubt und erwünscht; **Schreiben nur sequenziell** durch den Orchestrator — nie durch parallele Schreib-Agenten.
- **Build-out (ab 2026-06-15):** Neue Module **werden gebaut** — auf der **belege-Welt** (nie die alten Specs 1:1, die zielen auf Geister-Tabellen), in der Reihenfolge der `00_Buildout_Roadmap.md`. Jede `none`-Task beginnt mit „Spec auf belege-Welt portieren".

---

## 4. Wichtige Konzept-Dokumente

Lies diese Dokumente bei Bedarf:

| Datei | Wann lesen |
|---|---|
| `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md` | **Build-out: Reihenfolge + Phasen, was als Nächstes gebaut wird (2026-06-15)** |
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
