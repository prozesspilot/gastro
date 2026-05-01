# 05 — Roadmap & Entwicklungsstrategie

> Reihenfolge der Implementierung, kritischer Pfad, Sprint-Plan.
> Optimiert auf "schnell verkaufbar" → MVP first, dann Erweiterungen.

---

## 1. Strategische Reihenfolge

```
PHASE 0 — Foundation              (Woche 1-2)
PHASE 1 — MVP Basic               (Woche 3-6)   → erster Kunde verkaufbar
PHASE 2 — Standard-Erweiterungen  (Woche 7-10)
PHASE 3 — Pro-Features            (Woche 11-14)
PHASE 4 — Hardening & Skalierung  (Woche 15-16)
```

Annahme: 1 Senior-Entwickler + Claude Code, 4 Wochen Sprint = 1 Phase.

---

## 2. Phase 0 — Foundation (Woche 1–2)

**Ziel:** Stabiles Fundament. Ohne diese Bausteine sind alle Module nutzlos.

### 2.1 Lieferumfang

| # | Deliverable                                  | Wer baut         | Definition of Done                                            |
|---|----------------------------------------------|------------------|---------------------------------------------------------------|
| 1 | Repo-Setup, CI/CD, Docker-Compose            | Engineer         | `docker compose up` startet alles lokal                        |
| 2 | Postgres-Schema (alle Tabellen aus 02)       | Claude Code      | Prisma-Migrations laufen, RLS aktiv                            |
| 3 | Backend-Skeleton (Fastify + Auth + Health)   | Claude Code      | `/health` antwortet, HMAC-Auth funktioniert                    |
| 4 | Receipt-Schema + Customer-Profile-Schema     | Claude Code      | JSON-Schema validiert Beispiel-Payloads aus 01/02              |
| 5 | Customer-Profile-API (CRUD)                  | Claude Code      | Onboarding lokal: Customer + Profile + Credential anlegen      |
| 6 | Event-Bus (Redis Streams) + processed_events | Claude Code      | Producer/Consumer-Test publiziert/konsumiert Events            |
| 7 | n8n-Setup + Backend-Proxy-Pattern            | Engineer         | n8n läuft, Backend-HMAC funktioniert, Test-Workflow grün       |
| 8 | Storage-Service (MinIO + Adapter)            | Claude Code      | Upload+Download über `/api/v1/internal/storage/*`              |
| 9 | Routing-Service (`/routing/plan`)            | Claude Code      | Liefert RoutePlan basierend auf Profil                         |
| 10| Logging/Tracing (Pino + Trace-IDs)           | Engineer         | Trace-ID propagiert von n8n bis Backend bis Postgres           |

### 2.2 Was Claude Code bekommt

Pro Aufgabe ein Prompt, der enthält:
- die Modul-/Service-Spec (Markdown-Datei aus `docs/`),
- das Daten-Schema,
- ein "Acceptance-Criteria"-Block ("Tests laufen", "Endpoint antwortet 200 mit korrektem Body"),
- die Verzeichnisstruktur, in die der Code gehört.

---

## 3. Phase 1 — MVP Basic (Woche 3–6)

**Ziel:** Erstes Produkt verkaufbar. Ein Gastronom kann WhatsApp-Belege schicken, sie werden archiviert und in Excel/Sheets exportiert.

### 3.1 Module

Zu implementieren in dieser Reihenfolge:

| # | Modul                            | Dauer  | Abhängig von               |
|---|----------------------------------|--------|----------------------------|
| 1 | M10 WhatsApp Eingang             | 4 Tage | Phase 0 fertig             |
| 2 | M01 Belegerfassung & OCR         | 5 Tage | M10                        |
| 3 | M02 Belegarchivierung            | 4 Tage | M01                        |
| 4 | M07 Excel/Sheets Export          | 3 Tage | M01                        |
| 5 | WF-MASTER-RECEIPT                | 2 Tage | M01, M02, M07 fertig       |
| 6 | Web-App (minimal): Onboarding    | 4 Tage | parallel zu Modulen        |
| 7 | E2E-Test mit echtem WhatsApp     | 2 Tage | alles oben                 |

### 3.2 MVP Definition of Done

- [ ] Ein Gastronom (Test-Kunde) kann sich von uns onboarden lassen (Profil angelegt, Drive verbunden, WhatsApp-Nummer registriert).
- [ ] Foto eines echten Belegs an die WhatsApp-Nummer → erscheint nach < 60s als PDF in seinem Drive **und** als Zeile in seinem Google Sheet.
- [ ] Bestätigungsnachricht zurück an den Sender via WhatsApp.
- [ ] Bei OCR-Fehler bekommt der Operator (intern) einen Slack-/Mail-Alert.
- [ ] Audit-Log enthält für jeden Beleg alle Statuswechsel.

### 3.3 Was bewusst weggelassen wird

- Keine KI-Kategorisierung (Standard-Feature).
- Kein Reporting (Standard-Feature).
- Keine Lieferanten-Kommunikation (Pro-Feature).
- Keine Customer-Self-Service-UI (nur intern bedienbar).

---

## 4. Phase 2 — Standard-Erweiterungen (Woche 7–10)

**Ziel:** "Standard"-Paket verkaufbar. KI-Kategorisierung, Buchhaltungs-Anbindung, Reporting.

### 4.1 Module

| # | Modul                            | Dauer  | Abhängig von             |
|---|----------------------------------|--------|--------------------------|
| 1 | M03 Kategorisierung (Claude)     | 5 Tage | Phase 1 stabil           |
| 2 | M05 Lexoffice-Integration        | 5 Tage | M03                      |
| 3 | M06 sevDesk-Integration          | 4 Tage | M05 (Adapter-Pattern)    |
| 4 | M08 Monatsreporting              | 5 Tage | M03                      |
| 5 | Web-App: Beleg-Übersicht + Re-Run| 4 Tage | parallel                 |
| 6 | Hook-System (Backend)            | 3 Tage | parallel                 |

### 4.2 Standard Definition of Done

- [ ] Beleg wird per Claude API kategorisiert (≥ 90% Confidence in 80% der Fälle bei Test-Datensatz).
- [ ] Push nach Lexoffice oder sevDesk je nach Profil; Beleg-Anhang ist sichtbar.
- [ ] Monatsreport (PDF) wird am 1. eines Monats automatisch erstellt und per Mail/WhatsApp versendet.
- [ ] Customer-Webapp zeigt alle Belege, erlaubt Re-Run und manuelle Korrektur.
- [ ] Hook-System läuft (Test mit Dummy-Hook).

---

## 5. Phase 3 — Pro-Features (Woche 11–14)

**Ziel:** Pro-Paket verkaufbar. DATEV, Lieferanten-Kommunikation, Custom-Hooks.

### 5.1 Module

| # | Modul                            | Dauer  | Abhängig von             |
|---|----------------------------------|--------|--------------------------|
| 1 | M04 DATEV-Export                 | 6 Tage | M03 stabil               |
| 2 | M09 Lieferanten-Kommunikation    | 4 Tage | M01                      |
| 3 | Web-App: Hook-Sandbox            | 3 Tage | Hooks aus Phase 2        |
| 4 | Plugin-System (Loader, Manifest) | 4 Tage | parallel                 |
| 5 | Erstes Custom-Module (Beispiel)  | 5 Tage | Plugin-System            |

### 5.2 Pro Definition of Done

- [ ] DATEV-CSV (Format v2) wird monatlich generiert, an Steuerberater verschickt, mit allen Beleg-PDFs.
- [ ] Lieferanten-Anfrage-E-Mail (Template) wird automatisch verschickt bei `requires_review`.
- [ ] Hook-Sandbox erlaubt sicheres Testen vor Aktivierung.
- [ ] Plugin-System lädt versionierte Custom-Module.
- [ ] Pilot-Pro-Kunde läuft auf eigenem Custom-Module (z. B. WWS-Anbindung).

---

## 6. Phase 4 — Hardening & Skalierung (Woche 15–16)

**Ziel:** Production-Ready für 50+ Kunden.

| # | Deliverable                              | Dauer  |
|---|------------------------------------------|--------|
| 1 | Load-Test (Locust): 1000 Belege/h        | 2 Tage |
| 2 | Sentry, Grafana, Alert-Routing finalisiert | 2 Tage |
| 3 | Backup-Strategie (Postgres + MinIO)      | 1 Tag  |
| 4 | Disaster-Recovery-Drill                  | 1 Tag  |
| 5 | Security-Review (HMAC, Encryption)       | 2 Tage |
| 6 | DSGVO-Lösch-Workflow (Customer-Offboarding) | 2 Tage |
| 7 | Dokumentation (Operator-Runbook)         | 2 Tage |

---

## 7. Kritischer Pfad

```
Phase 0 ─► M10 ─► M01 ─► [M02 ∥ M07] ─► WF-MASTER ─► E2E-Test (MVP)
                            │
                            └──► M03 ─► [M05 ∥ M06 ∥ M08] (Standard)
                                          │
                                          └──► [M04 ∥ M09] (Pro)
```

**Kritisch** sind: Phase 0, M10, M01, WF-MASTER. Verzögerung dort = Verzögerung des gesamten MVP.

---

## 8. Reihenfolge der Modul-Generierung mit Claude Code

Der empfohlene Ablauf pro Modul:

1. Modul-Spec (`docs/modules/M0x_*.md`) Claude Code geben.
2. Claude generiert:
   - DB-Schema-Migration (falls nötig)
   - Backend-Service (`backend/src/modules/m0x-*/`)
   - JSON-Schemas für Input/Output
   - Tests (Unit + Integration)
   - n8n-Workflow-JSON (`n8n/workflows/WF-M0x.json`)
3. Engineer reviewt, deployed in Staging.
4. Test-Beleg durchschicken, prüfen.
5. Merge in `main`.

Pro Modul Aufwand: **3–6 Tage**, davon ca. 1 Tag Claude-Generierung + 2–5 Tage Review/Refinement/Tests.

---

## 9. Modul-Wiederverwendbarkeit

Module sind so geschnitten, dass sie modulübergreifend wiederverwendbare Bausteine teilen. Beim Bauen eines Moduls **immer** prüfen, ob ein Baustein schon existiert.

| Baustein                       | Liegt in                                        | Wird wiederverwendet von |
|--------------------------------|-------------------------------------------------|--------------------------|
| Receipt-Repository             | `backend/src/modules/_shared/receipts/`         | M01–M09                  |
| OCR-Adapter (Vision/Mindee)    | `backend/src/core/adapters/ocr/`                | M01                      |
| Storage-Adapter (Drive/Dropbox)| `backend/src/core/adapters/storage/`            | M02, M08                 |
| Booking-Adapter (Lexoffice/sev)| `backend/src/core/adapters/booking/`            | M05, M06                 |
| Mail-Service (SMTP, Templates) | `backend/src/core/mail/`                        | M04, M08, M09            |
| WhatsApp-Service               | `backend/src/core/whatsapp/`                    | M08, M09, M10            |
| PDF-Generator (Reports)        | `backend/src/core/pdf/`                         | M08, ggf. Pro-Plugins    |
| Hook-Runner                    | `backend/src/core/hooks/`                       | alle Module              |
| Audit-Service                  | `backend/src/core/audit/`                       | alle Module              |

---

## 10. Risiken & Gegenmaßnahmen

| Risiko                                           | Auswirkung           | Gegenmaßnahme                                      |
|--------------------------------------------------|----------------------|-----------------------------------------------------|
| WhatsApp Business API-Verifizierung dauert       | Phase 1 Verzögerung  | Sofort in Phase 0 anstoßen (2-3 Wochen Vorlauf)     |
| Google Vision OCR-Genauigkeit unter Erwartung    | Manueller Review-Anteil hoch | Mindee als zweiten Adapter in Phase 3 vorbereiten |
| Lexoffice-API-Limits                              | Export-Stau           | Throttling + Retry-Queue im Backend, Adapter-Pattern |
| DATEV-Format-Anforderungen vom Steuerberater    | M04 Verzögerung      | Phase 2: Steuerberater-Sample mit echten Daten testen |
| Datenmodell-Änderung nach MVP                    | Migration nötig      | `schema_version` von Anfang an, Migration-Service planen |
| Self-hosted n8n Outage                           | Ganzes System steht   | n8n+Backend in HA-Setup ab Phase 4; Notfall-Queue in Redis |

---

## 11. Lieferzeitplan kompakt

```
W1   ────► Foundation (Setup, DB, Auth, Health)
W2   ────► Foundation (Profile-API, Routing, Storage, Events)
W3   ────► M10 + WF-INPUT-WHATSAPP
W4   ────► M01 + Tests
W5   ────► M02 + M07 parallel
W6   ────► WF-MASTER + Web-App Onboarding + E2E       ★ MVP fertig
W7   ────► M03 + Hook-System
W8   ────► M05 (Lexoffice)
W9   ────► M06 (sevDesk) + M08 Reporting
W10  ────► Web-App Beleg-Liste/Re-Run                 ★ Standard fertig
W11  ────► M04 DATEV
W12  ────► M09 Comms
W13  ────► Plugin-System + Hook-Sandbox
W14  ────► Erstes Custom-Plugin (Pilot Pro-Kunde)     ★ Pro fertig
W15  ────► Load-Test, Backup, DSGVO-Flow
W16  ────► Security-Review, Runbook, Go-Live          ★ Skalierungsbereit
```

---

## 12. Was Claude Code an jedem Modul-Tag bekommt

Pro Modul, in genau dieser Reihenfolge, mit der jeweiligen Modul-Spec:

```
1. "Lies diese Modul-Spec: docs/modules/M01_Belegerfassung_OCR.md"
2. "Generiere DB-Migration in backend/prisma/migrations/, falls in der Spec gefordert."
3. "Generiere den Backend-Service unter backend/src/modules/m01-receipt-intake/.
    Beachte: Receipt-Schema aus docs/01_Datenmodell_Events.md.
    Beachte: Hook-Points aus docs/04_Erweiterbarkeit_Pro.md."
4. "Generiere Unit-Tests (Vitest) für die Service-Funktionen.
    Generiere einen Integrationstest, der die Backend-Endpoints aufruft."
5. "Generiere n8n-Workflow JSON unter n8n/workflows/WF-M01.json
    nach den Konventionen aus docs/03_n8n_Workflows.md."
6. "Erstelle eine README in backend/src/modules/m01-receipt-intake/README.md
    mit: Zweck, Endpoints, ENV-Variablen, Test-Anleitung."
```

Damit ist jede Iteration deterministisch und review-fähig.
