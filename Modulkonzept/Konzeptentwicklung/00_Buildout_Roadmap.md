# Bau-Fahrplan Gastro — Build-out für vollständigen Test-Durchlauf

**Erstellt:** 2026-06-15 · **Quelle:** Gap-Analyse-Workflow (19 Surfaces, Konzept-SOLL vs. Code-IST, gegen `main` verifiziert)
**Anlass:** Strategiewechsel GF Steve — der Testkunde zahlt nie (Test-Objekt). Das Tor „bauen erst wenn der Pilot zahlt" (CLAUDE.md §3.6/§3.7) entfällt. Neues Ziel: System so weit fertig, dass der Testkunde **alles** selbst durchspielt — Onboarding bis Support-Chat.

> **Ehrliche Einordnung:** Das ist **ein mehrmonatiger Neubau**, kein Restarbeits-Paket. 7 der noch offenen Surfaces stehen bei `code_status: none` und müssen auf der **belege-Welt von Grund auf** gebaut werden (die alten Specs zielen auf die toten `receipts`-Geister-Tabellen). Realistisch: **~11–15 Wochen bis Test-Ziel**, **~16–24 Wochen** bis jedes Modul testbar — sequenziell + reviewed.

---

## 1. Ist-Fundament (LIVE, darauf wird gebaut)

Verifiziert gegen `main` (app.ts-Registrierungen, 2026-06-15):

| Surface | Status |
|---|---|
| M01 Beleg-Upload + OCR (async via OCR-Worker, **kein `/extract`**) | ✅ LIVE |
| M03 Kategorisierung (`POST /belege/:id/categorize`, 14 Kat., Bewirtungs-Detektor) | ✅ LIVE |
| M05 Lexware-Export (`/exports/lexware` + `/batch`, Retry/Idempotenz, SKR→categoryId) | ✅ LIVE |
| M12 DSGVO v2 · M14 Auth (Discord+TOTP) · M15 SumUp/Kasse | ✅ LIVE |
| Multi-Tenancy/RLS (`app.current_tenant`), GoBD-Basics, CI/CD | ✅ LIVE |

**Die Mitte läuft (OCR→Kategorisierung→Export).** Es fehlt (a) alles **vor** dem Beleg (Onboarding, Eingangskanal), (b) alles **um den Menschen** (Support-Chat, Staff-Webapp/Task-System), (c) drei **Querschnitts-Bausteine** (Mail-Service, PDF-Engine, Webapp-Reboot) — die in keiner Modul-Spec als eigener Posten stehen.

---

## 2. Kritischer Pfad „Testkunde spielt alles selbst durch"

```
Onboarding-Wizard          → FEHLT          (Blocker 1)
  → Web-Chat-Widget         → FEHLT          (Blocker 2+3: Eingang UND Support in einem)
  → OCR → Kategorisierung → Export           ✅ LIVE
  → Staff-Betreuung (Webapp + Task-System)   → FEHLT
```

**Eingangskanal-Entscheidung (GF, 2026-06-15): Web-Chat-Widget** — der Wirt schickt Belege übers Widget **und** bekommt dort Support. Das vereint zwei Blocker in einem Bau. E-Mail/WhatsApp = spätere Kanal-Breite (Phase D).

---

## 3. Phasen (abhängigkeits-geordnet)

Größen: S (<1 Tag) · M (Tage) · L (1–2 Wo) · XL (>2 Wo). „Tx" = eingefrorene Task als Startpunkt (auf belege-Welt portieren).

### Phase 0 — Pilot-Mitte produktiv beweisen (S, ~0,5 Wo) — *manuell, kein Code*
Die zwei `MANUELLE_AUFGABEN.md`-Punkte: **T009** Lexware-Token der Steuerberaterin einspielen · **T054-Verify** Kategorie-Mapping gegen Live-Account prüfen. → Echte Exporte in Lexware sichtbar. Läuft parallel zu Phase A (externe Lead-Zeit Steuerberaterin).

### Phase A — Fundament-Infrastruktur (L, ~2–3 Wo)
- **A1 Generischer Mail-Service** (`backend/src/core/mail/`): SMTP + Templating + Bounce. Entriegelt Wizard, M09, M08, künftige Kanäle.
- **A2 PDF-Engine** (`backend/src/core/pdf/`): Reports + DSGVO-Auskunft + GoBD-Doku.
- **A3 Webapp-Reboot** zur internen Staff-Admin-App: tote Legacy-Routes (receipts/customers/plugins/communications gegen Geister-Tabellen) raus; saubere Basis (Dashboard + belege + tenants). Vorbedingung für Task-System + Chat-Staff-View.

→ Noch nichts End-to-End, aber **entriegelt alle Customer-Facing-Phasen**. **Erster Bau: A1 Mail-Service** (klein, entriegelt am meisten, schleift den `/start-task→review→merge`-Rhythmus ein).

### Phase B — Onboarding-Wizard (XL, ~3–4 Wo)
`m16-wizard` + `setup.prozesspilot.net` (none→Bau): Magic-Link-Session, 7 Schritte, OAuth zu Lexware/SumUp, `onboarding_sessions`-Migration, React-Frontend. Startpunkt T016. **Abhängig von:** M14 (Auth-Muster), M05/M15 (OAuth), A1 (Setup-Mail). → **Testkunde onboardet sich selbst.**

### Phase C — Web-Chat (Eingang + Support) + Staff-Betreuung (XL, ~4–6 Wo)
- **C1 Web-Chat-Widget** (`chat.prozesspilot.net` + Backend, none→Bau): `chat_sessions`/`chat_messages`-Migration, Magic-Link-Token, Beleg-Upload **im Widget**, WS + Polling-Fallback, Mobile-First. Splittet in Widget / Persistenz / Staff-View. Startpunkt T037. **Abhängig von:** A3 (Staff-View), M01 (Upload→belege-Pfad).
- **C2 Mitarbeiter-Task-System** (none→Bau): `tasks`-Migration, `/api/v1/tasks`, TaskList/Detail, Beleg-Korrektur side-by-side, SSE. Startpunkte T024–T027. **Abhängig von:** A3.

→ **Kritischer Pfad geschlossen.** Onboarding → Web-Chat-Eingang → live Mitte → Support-Chat, mit Staff, das OCR-Fehler korrigiert + Support beantwortet. **Hier ist das Test-Ziel erreicht.**

### Phase D — Kanal-Breite + Reporting (M/L, ~3–4 Wo)
- **D1 M11 E-Mail-Eingang** (IMAP, nutzt A1) · **D2 M10 WhatsApp** (nutzt M11-Muster; Meta-Business-Verifizierung früh anstoßen — externe Lead-Zeit!) · **D3 M08 Reporting** (Monats-PDF, nutzt A2) · **D4 M09 Lieferanten-Rückfragen** (nutzt A1).

### Phase E — Post-Test-Ausbau (später, nach Bedarf)
M02 Archiv · M04 DATEV · M06 sevDesk · M07 Excel/Sheets · M13 Steuerberater-Portal · M12-Erweiterungen (GoBD-Doku, Auto-Lösch-Job) · M15 Cron/Events · Discord-Bot-Service.

---

## 4. Größen-Übersicht

| Phase | Größe | Wochen | Schaltet frei |
|---|---|---|---|
| 0 Bootstraps | S | 0,5 | Live-Mitte real bewiesen |
| A Fundament | L | 2–3 | Vorbedingung B–D |
| B Wizard | XL | 3–4 | Self-Service-Onboarding |
| C Web-Chat + Task-System | XL | 4–6 | **kritischer Pfad komplett** |
| **Summe bis Test-Ziel (0+A+B+C)** | — | **~11–15 Wo** | **Testkunde spielt alles durch** |
| D Breite + Reporting | M/L | 3–4 | „wirklich alles testbar" |
| E Post-Test | L/XL | offen | nach Bedarf |
| **Gesamtspanne** | — | **~16–24 Wo** | vollständiges System |

---

## 5. Arbeitsweise (Drift-Lektion bleibt)

Das Zahlungs-Tor fällt — die Anti-Drift-Disziplin **nicht** (CLAUDE.md §3.7):
- **Sequenziell, ein Modul/Terminal.** Kein paralleler Blind-Schreib-Bau.
- Pro Surface: `/start-task` → Implementierung + Tests → `/finish-task` → PR → `/review-pr` (code-reviewer) → Squash-Merge → Task-Datei manuell nach `_done`.
- Tor: build + test (mit `PP_E2E=1`) + Smoke grün vor dem nächsten Schritt.
- Neue Module auf die **belege-Welt** (nie alte Specs 1:1) — jede `none`-Task startet mit „Spec portieren".
- Read-only-Workflows/Ultracode für Analyse/Design/Review; jede Phase beginnt mit Design-Spike, der die Schätzung schärft.

## 6. Nächste Schritte
1. ✅ CLAUDE.md-Anker umgestellt (§3.4–§3.7) + diese Roadmap (T056).
2. **Phase 0** — Bootstraps anstoßen (Steve, manuell, parallel).
3. **A1 Mail-Service** — erster Bau-out-PR.
