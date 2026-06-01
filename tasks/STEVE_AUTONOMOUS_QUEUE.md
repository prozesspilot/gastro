# Steve — Autonome Arbeitswarteschlange (Stand 2026-06-01)

> **Zweck:** Frontend-Tasks, die ein Claude-Code-Agent autonom abarbeiten kann — **parallel zur Andreas-Backend-Queue**, ohne Code-Konflikte.
>
> **Owner:** Steve (Frontend / Webapp / Specs-Frontend)
> **Erzeugt:** 2026-06-01 (auf Anfrage von Steve)

---

## Schreib-Revier (HART, niemals verletzen)

Der Steve-Agent darf NUR in diese Pfade schreiben:

| Erlaubt | Beispiele |
|---------|-----------|
| `webapp/**` | Webapp-Source, Tests, Components, Hooks |
| **neuer Ordner** für Setup-Wizard | z.B. `setup-webapp/` (eigenes Vite-Projekt) |
| `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` | Spec für Mitarbeiter-Webapp (§2/§7 für T034) |
| `tasks/_backlog/T016*.md`, `_backlog/T020*.md`, `_backlog/T034*.md` | nur die explizit zugewiesenen Tasks |
| `tasks/_in_progress/T016*.md`, `T020*.md`, `T034*.md` | Move-Targets |
| `tasks/_done/T016*.md`, `T020*.md`, `T034*.md` | Move-Targets |
| `tasks/STEVE_AUTONOMOUS_RUN_LOG.md` | eigenes Log (anlegen) |
| `tasks/STEVE_AUTONOMOUS_QUEUE.md` | Run-Report ans Ende anhängen |

**VERBOTEN:**
- `backend/**` (Andreas-Revier)
- `backend/migrations/**` (Andreas-Revier)
- `tasks/ANDREAS_AUTONOMOUS_QUEUE.md` (anderer Agent)
- `tasks/AUTONOMOUS_RUN_LOG.md` (Andreas-Log)
- `tasks/_backlog/T021*`, `T022*`, `T023*`, `T024*`, `T025*`, `T027*`, `T030*`, `T031*`, `T033*`, `T035*` (im Andreas-Plan)
- `webapp/src/schemas/receipt.schema.ts` (Andreas-T033 wird das später anfassen)
- `Modulkonzept/Konzeptentwicklung/modules/M13_*.md`, `M14_*.md`, `M15_*.md`, `Discord_Integration.md` (Andreas-T030/T031)

Wenn eine zugewiesene Task gegen diese Regel verstoßen würde: Task in `_in_progress` belassen mit Notiz, **nicht** ausführen, nächste Task ziehen.

---

## Spielregeln (gleich wie Andreas-Queue)

1. **Vor jedem Task:** `git checkout main && git pull --ff-only origin main`
2. **Pro Task:** `/start-task T0XX` → Implementierung mit Tests → `npm run lint && npm run build && npm test` (Webapp-Verzeichnis) → `/finish-task` → PR.
3. **Owner-Kürzel:** `steve` (alle Branches `steve/T0XX-…`).
4. **Commit-Trailer:** `Co-Authored-By: Steve Bernhardt <steve@prozesspilot.net>` + Claude.
5. NICHT auf Merge warten — direkt zur nächsten Task.
6. Bei Code-Konflikt zu unterwegs gemergten PRs: rebase + nachziehen.
7. Migrations sind verboten — Steve-Agent hat keine DB-Hoheit.

---

## Reihenfolge

| # | Task | Titel | Größe | Zielordner | Schreib-Risiko zu Andreas |
|---|------|-------|-------|------------|---------------------------|
| 1 | **T034** | Webapp-Spec Socket.io → SSE | S (Doku) | `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` | Andreas berührt diese Datei nicht. ✅ |
| 2 | **T020** | E2E `receipt-flow.e2e.ts` auf Discord-Auth | M | `webapp/src/tests/e2e/` | Andreas berührt E2E-Tests nicht. ✅ |
| 3 | **T016** | Onboarding-Wizard Step 1-3 Skeleton | L | NEUER Ordner `setup-webapp/` (eigenes Vite-Projekt) ODER Sub-Route in `webapp/src/pages/setup/` | Wenn `webapp/`: nur neue Files in eigenem `setup/`-Unterordner anlegen. ✅ |

---

## Tasks, die Steve-Agent NICHT macht

| Task | Grund |
|------|-------|
| T026 | Hängt von T025-Merge (Andreas) ab |
| T036 | Hängt von T035-Merge (Andreas) ab |
| T037 | Backend-Anteil — gemeinsamer Task |
| T033 | Im Andreas-Plan (Schemas in webapp/src/schemas/) |
| Alle Backend-Tasks | Andreas-Revier |

---

## Stop-Bedingungen

- Tests/Lint/Build nach 3 Selbst-Korrekturen rot
- GitHub-/Git-Auth-Failure trotz Retry
- Task verlangt Architektur-Entscheidung → Notiz im Task-File, nächste ziehen
- Versuch in Verbotenes-Revier zu schreiben → Task abbrechen
- Queue exhausted (alle 3 Tasks erledigt) → Run-Report + STOP

---

## Run-Log (Agent füllt)

→ siehe `tasks/STEVE_AUTONOMOUS_RUN_LOG.md`

---

## Run-Report (Agent hängt ans Ende an)

```
## Run-Report 2026-06-01

- Gestartet: 2026-06-01 17:50
- Beendet: 2026-06-01 20:10
- Tasks erledigt: T034, T020, T016
- PRs eröffnet: #84 (T034), #85 (T020), #87 (T016)
- Tasks übersprungen: keine
- Stop-Grund: Queue exhausted (alle 3 Tasks fertig)
- Offene Punkte für Mensch:
  - PR #84 mergen (reine Doku, kein Risk)
  - PR #85 mergen (Test-Cleanup, kein Risk)
  - PR #87 reviewen (neuer Frontend-Code): Wizard ist Skeleton — echter Backend-Call
    kommt in Folge-Tasks. TOTP-QR zeigt aktuell nur otpauth://-URI-Link, kein Bild
    (qrcode-Library noch nicht installiert — Phase 1.2).
  - Hinweis: ein cherry-picked Commit liegt auch auf Branch qa/fix-001-biome-format-tasks
    (war versehentlich dort committed, dann auf den richtigen Branch kopiert).
    qa-Branch-Owner sollte diesen Commit ggf. bereinigen.
```
