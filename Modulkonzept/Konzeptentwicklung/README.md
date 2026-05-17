# Gastro — Konzept-Übersicht

> **Stand:** 2026-05-15 (komplett überarbeitet nach Konzept-Reboot)
>
> **Naming-Konvention:** Das System/Produkt heißt intern **Gastro** (Code, Repo, Tech-Doku). Die Firma + Brand für Außen-Kommunikation heißt **ProzessPilot** (AGB, Sales, Marketing, Customer-Touchpoints, Domain). Beide Namen erscheinen in dieser Doku — der jeweilige Kontext entscheidet welcher passt.
>
> Dieses Verzeichnis enthält die gesamte Konzept-Dokumentation für das Gastro-System (vertrieben unter dem Brand ProzessPilot). Jede Datei ist so gehalten, dass sie auch einzeln gelesen werden kann.

---

## Was ist ProzessPilot?

ProzessPilot ist ein modulares SaaS-System für deutsche **Gastronomie-Kleinunternehmer**, das deren Steuerberater-Kosten um 60–80 % senkt. Wirte schicken Belege per WhatsApp / E-Mail / Web-Chat, ProzessPilot extrahiert per OCR + KI, kategorisiert mit Gastro-Spezialfällen (Bewirtung, MwSt-Splitting, Pfand), archiviert GoBD-konform und übergibt monatlich aufbereitet an den Steuerberater (DATEV / Lexware Office / sevDesk).

**Vertriebsmodell:** Eine externe Vertriebsagentur als Handelsvertreter, 50 % Provision auf Setup + recurring.

**Pricing:** Solo €39 / Standard €79 / Pro €149 / Filiale €299 pro Monat plus Setup-Fee. 30 Tage Geld-zurück-Garantie.

**Aktueller Stand:** Konzept komplett, Pilot-Wirt bekannt (Lexware-Office-Steuerberaterin, SumUp-Lite-Kasse, sofortiger Start ab KW 22).

---

## Lese-Reihenfolge

### Für eine neue Person (Quick-Start)

1. **`STATUS.html`** im Browser öffnen — schneller Überblick
2. **`00_Strategie_Gastro.md`** — Geschäftsmodell, Markt, USP
3. **`00_Architektur_Hauptdokument.md`** — System-Architektur
4. **`00_Pilot_Strategie.md`** — was wir gerade konkret bauen
5. **`05_Roadmap.md`** — was als nächstes ansteht

### Für Andreas (Backend, Module, Infrastructure)

- `00_Architektur_Hauptdokument.md`
- `01_Datenmodell_Events.md`
- `02_Kundenprofil_System.md`
- `03_n8n_Workflows.md`
- `04_Erweiterbarkeit_Pro.md`
- `06_Prompt_System.md`
- `Discord_Integration.md` (Bot-Architektur)
- `modules/M0X_*.md` für jedes konkrete Modul
- `Claude_Code_Workflow.md` (wie wir arbeiten)

### Für Steve (Frontend, Discord, Vertrieb, Legal)

- `00_Strategie_Gastro.md`
- `00_Vertriebsmodell.md`
- `00_Pilot_Strategie.md`
- `Mitarbeiter_Webapp.md`
- `Onboarding_Wizard.md`
- `Web_Chat_Widget.md`
- `Discord_Integration.md`
- `legal/*.md`
- `Claude_Code_Workflow.md`

### Für den Anwalt

- `legal/Anwalt_Briefing.md` (Master-Brief)
- `legal/AGB_Endkunden_Vorlage.md`
- `legal/AVV_Vorlage.md`
- `legal/TOMs_Vorlage.md`
- `legal/Vertriebsagentur_Vertrag_Vorlage.md`
- `legal/Subunternehmer.md`
- `legal/Datenschutz_Webapp.md`
- `legal/Datenschutz_Website_Ergaenzung.md`

---

## Verzeichnis-Struktur

```
Modulkonzept/Konzeptentwicklung/
│
├── README.md                              ← diese Datei
├── STATUS.html                            ← aktueller Live-Stand
│
├── Strategie & Geschäftsmodell
│   ├── 00_Strategie_Gastro.md             ← Markt, Persona, Pricing, USP
│   ├── 00_Vertriebsmodell.md              ← Vertriebsagentur, Provisions-Logik
│   ├── 00_Pilot_Strategie.md              ← Pilot-Wirt-Setup, Sub-Phasen
│   └── 05_Roadmap.md                      ← Customer-Outcome-Meilensteine
│
├── Tech-Architektur
│   ├── 00_Architektur_Hauptdokument.md    ← System-Überblick
│   ├── 01_Datenmodell_Events.md           ← Receipt-Schema, Event-Format
│   ├── 02_Kundenprofil_System.md          ← Tenant-Profil
│   ├── 03_n8n_Workflows.md                ← Workflow-Konventionen
│   ├── 04_Erweiterbarkeit_Pro.md          ← Hooks, Custom-Plugins
│   └── 06_Prompt_System.md                ← Prompt-Templates
│
├── Frontends + interne Tools
│   ├── Mitarbeiter_Webapp.md              ← admin.prozesspilot.net (intern)
│   ├── Onboarding_Wizard.md               ← setup.prozesspilot.net (Customer einmalig)
│   └── Web_Chat_Widget.md                 ← chat.prozesspilot.net (Customer bei Bedarf)
│
├── Workflow + Integration
│   ├── Discord_Integration.md             ← Mitarbeiter-Auth + Bot + Customer-Bridge
│   └── Claude_Code_Workflow.md            ← wie wir mit Claude Code entwickeln
│
├── modules/                               ← Detail-Specs pro Modul (M01–M15)
│   ├── M01_Belegerfassung_OCR.md
│   ├── M02_Belegarchivierung.md
│   ├── M03_Kategorisierung.md             ← inkl. Gastro-Hooks (Bewirtung, MwSt-Split, Pfand)
│   ├── M04_DATEV_Export.md
│   ├── M05_Lexoffice_Integration.md       ← (= Lexware Office)
│   ├── M06_sevDesk_Integration.md
│   ├── M07_Excel_Sheets_Export.md
│   ├── M08_Monatsreporting.md             ← inkl. Steuerberater-Übergabe + Spar-Bericht
│   ├── M09_Lieferanten_Kommunikation.md
│   ├── M10_WhatsApp_Eingang.md
│   ├── M11_IMAP_Eingang.md
│   ├── M12_DSGVO.md                       ← inkl. GoBD-Doku-Generator
│   ├── M13_Steuerberater_Portal.md
│   ├── M14_User_Verwaltung_Auth.md        ← Discord OAuth + Notfall-Login
│   └── M15_Kassensystem_Connector.md      ← NEU SumUp first
│
├── legal/                                 ← Vorlagen für den Anwalt
│   ├── Anwalt_Briefing.md
│   ├── AGB_Endkunden_Vorlage.md
│   ├── AVV_Vorlage.md
│   ├── TOMs_Vorlage.md
│   ├── Vertriebsagentur_Vertrag_Vorlage.md
│   ├── Subunternehmer.md
│   ├── Datenschutz_Webapp.md
│   └── Datenschutz_Website_Ergaenzung.md
│
├── prompts/                               ← Historische Prompt-Sammlung (vor Reboot)
│   ├── README.md
│   ├── legacy/
│   └── terminal-tasks/
│
├── _archive/                              ← Veraltete Konzept-Dokumente (read-only)
│   ├── README.md
│   ├── Foundation_Spec.md
│   ├── Sprint_0_Foundation.md
│   ├── Sprint_1_MVP.md
│   ├── Github_Sync_Setup.md
│   ├── Server_Umzug.md
│   ├── AGENT*.md, CLEANUP_PLAN.md
│   └── alte STATUS-HTMLs
│
├── _audit/                                ← Audit-Befunde (gepflegt von code-reviewer-Agent)
│
└── _pilot/                                ← Pilot-spezifische, vertrauliche Notizen (nicht öffentlich)
```

---

## Modul-Übersicht (Quick-Reference)

| ID | Modul | Paket | MVP? | Spec |
|---|---|---|---|---|
| M01 | Belegerfassung & OCR | Basic+ | ✓ | `modules/M01_Belegerfassung_OCR.md` |
| M02 | Belegarchivierung GoBD | Basic+ | ✓ | `modules/M02_Belegarchivierung.md` |
| M03 | Kategorisierung + Gastro-Hooks | Standard+ | ✓ erweitert | `modules/M03_Kategorisierung.md` |
| M04 | DATEV-Export | Pro | ✓ | `modules/M04_DATEV_Export.md` |
| M05 | Lexware Office Integration | Standard+ | ✓ | `modules/M05_Lexoffice_Integration.md` |
| M06 | sevDesk-Integration | Standard+ | später | `modules/M06_sevDesk_Integration.md` |
| M07 | Excel/Sheets-Export | Basic+ | optional | `modules/M07_Excel_Sheets_Export.md` |
| M08 | Monatsreporting + Steuerberater-Übergabe | Standard+ | ✓ erweitert | `modules/M08_Monatsreporting.md` |
| M09 | Lieferanten-Kommunikation | Pro | später | `modules/M09_Lieferanten_Kommunikation.md` |
| M10 | WhatsApp Eingang | Basic+ | ✓ Phase 2 | `modules/M10_WhatsApp_Eingang.md` |
| M11 | IMAP / E-Mail Eingang | Basic+ | ✓ | `modules/M11_IMAP_Eingang.md` |
| M12 | DSGVO + GoBD-Doku-Generator | alle | ✓ erweitert | `modules/M12_DSGVO.md` |
| M13 | Steuerberater-Portal | Pro | später | `modules/M13_Steuerberater_Portal.md` |
| M14 | User-Verwaltung & Auth (Discord) | alle | ✓ neu | `modules/M14_User_Verwaltung_Auth.md` |
| **M15** | **Kassensystem-Connector (SumUp)** | Standard+ | **✓ NEU** | `modules/M15_Kassensystem_Connector.md` |

---

## Drei Frontends (strikte Trennung)

| Frontend | URL | Wer | Login |
|---|---|---|---|
| Mitarbeiter-Webapp | `admin.prozesspilot.net` | intern | Discord OAuth + Notfall-Login |
| Onboarding-Wizard | `setup.prozesspilot.net` | Customer einmalig | Magic-Link |
| Web-Chat-Widget | `chat.prozesspilot.net` / `prozesspilot.net/c/{token}` | Customer bei Bedarf | Magic-Link |

**Endkunden (Wirte) sehen NIE die Mitarbeiter-Webapp.**

---

## Wichtige Konventionen

| Thema | Festlegung |
|---|---|
| Workflow-Engine | n8n self-hosted (Docker) |
| Backend | Node.js 20 + TypeScript strict + Fastify |
| DB | PostgreSQL 16 (raw SQL, kein ORM) |
| Cache / Events | Redis 7 Streams |
| Object Storage | MinIO (S3-kompatibel) |
| OCR | Google Vision API (`europe-west3`) |
| KI | Anthropic Claude (Sonnet 4.6) |
| WhatsApp | Twilio (Pilot) → Meta Business Cloud (Phase 1.3+) |
| Buchhaltungs-Adapter | DATEV CSV, Lexware Office API, sevDesk API |
| Archiv | Google Drive (Default), Dropbox (Optional) |
| Mitarbeiter-Auth | Discord OAuth 2.0 + Notfall-Login mit TOTP |
| Customer-Auth | Magic-Link mit DB-Token |
| Hosting | Hetzner EU |
| Mitarbeiter-Komm | Discord-Server + eigener Bot |
| JSON-Felder | snake_case |
| TypeScript | camelCase |
| DB-Tabellen | snake_case Plural |
| Branches | `<owner>/T<id>-<kurz>` |
| Workflow-Namen | `WF-<Domain>-<Variant>` |
| Events | `pp.<entity>.<verb_past>` |

---

## Wenn du etwas änderst

**Pflicht-Reihenfolge:** Erst Spec aktualisieren, dann Code. Nicht umgekehrt — sonst entsteht wieder ein Drift wie vor dem Reboot.

Workflow:
1. Spec anpassen, Spec-PR
2. Anderer Mensch reviewt
3. Spec gemerged
4. **Dann** Code-Task erstellen, der die neue Spec implementiert

---

## Wo finde ich was

| Frage | Antwort |
|---|---|
| Wie funktioniert OAuth-Flow? | `modules/M14_User_Verwaltung_Auth.md` |
| Wie sind die Sales-Klauseln formuliert? | `00_Vertriebsmodell.md` + `legal/Vertriebsagentur_Vertrag_Vorlage.md` |
| Was passiert bei OCR-Confidence < 80%? | `modules/M03_Kategorisierung.md` Abschnitt 17–22 |
| Wie sieht Web-Chat-Widget für Wirt aus? | `Web_Chat_Widget.md` |
| Wer macht was im Team? | `Claude_Code_Workflow.md` Abschnitt 2 |
| Welche Datenbanktabellen gibt es? | jeweils in den Modul-Specs + `01_Datenmodell_Events.md` |
| Welche Hooks gibt es im Plugin-System? | `04_Erweiterbarkeit_Pro.md` |
| Wann ist der Pilot-Wirt live? | `00_Pilot_Strategie.md` Abschnitt 3 + `05_Roadmap.md` Abschnitt 3 |

---

**Letzte Aktualisierung:** 2026-05-15 (komplette Neufassung nach Konzept-Reboot Mai 2026)
**Verantwortlich:** Steve Bernhardt + Andreas
