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
- ✅ "Das Gastro-Backend läuft auf Hetzner."
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

## 3. Aktueller Stand (Stand Mai 2026)

| Bereich | Stand |
|---|---|
| **Konzept** | Komplett dokumentiert in `Modulkonzept/Konzeptentwicklung/` |
| **Code-Repo-Name** | `gastro` auf GitHub |
| **Firma** | ProzessPilot, Einzelunternehmen Steve Bernhardt, Schneverdingen |
| **Backend** | Existiert, wird gerade auf Gastro-Fokus umgestellt |
| **Module** | M01–M14 implementiert, M15 (SumUp) noch nicht |
| **Webapp** | Existiert, wird komplett umgebaut zu rein-internem Mitarbeiter-Tool |
| **Onboarding-Wizard** | Noch nicht gebaut |
| **Web-Chat-Widget** | Noch nicht gebaut |
| **Discord-Integration** | Noch nicht gebaut |
| **CI/CD** | Wird gerade aufgesetzt |
| **Pilot-Wirt** | Bekannt, Lexware Office Steuerberaterin, SumUp Lite Kasse, sofortiger Start ab KW 22 |

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

- Hetzner EU als Default
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
- `server/T0XX-<kurz>` für Hetzner-Tasks
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
7. Auto-Deploy auf Hetzner

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
