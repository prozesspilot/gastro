# Andreas — Autonome Arbeitswarteschlange (Stand 2026-06-01)

> **Zweck:** Liste von Backend-Tasks, die ein Claude-Code-Agent autonom abarbeiten kann, ohne auf menschliche Eingaben zu warten. Soll **mehrere Tage** durchlaufen.
>
> **Owner:** Andreas (Backend / Infra / DB)
> **Erzeugt:** 2026-06-01 (auf Anfrage von Steve)
> **Quelle:** `tasks/DRIFT_PLAN.md` + `tasks/_backlog/T0*.md` + Audit-Report `Modulkonzept/Konzeptentwicklung/_audit/REPORT-2026-05-26.md`

---

## Spielregeln für den Agent

1. **Vor jedem Task:** `git checkout main && git pull --ff-only origin main`. Wenn ein anderer PR zwischenzeitlich gemergt wurde, neue Migrations-Nummern und Code-Stand übernehmen.
2. **Pro Task:** kompletter Workflow `/start-task T0XX` → Implementierung mit Tests → lokal `npm run lint && npm run build && npm test` (Backend) → `/finish-task` → PR auf GitHub eröffnen.
3. **Owner-Kürzel:** `andreas` (alle Tasks dieser Queue gehen auf `andreas/T0XX-…`-Branches).
4. **NICHT auf Merge warten** — nach Eröffnung des PRs sofort zur nächsten unabhängigen Task. Reviews macht Steve asynchron.
5. **Bei Konflikten:** Migrations-Nummern umnummerieren (CLAUDE.md §6.5). Bei Code-Konflikten zuerst `main` pullen und rebase versuchen; bei harten Konflikten Task in `_in_progress` lassen und nächste Task ziehen.
6. **Stop-Bedingungen (Hard-Blocker):** Bei jedem dieser Punkte stoppen und Status reporten:
   - CI / Tests / Lint / Build schlagen nach 3 Selbst-Korrektur-Versuchen fehl.
   - GitHub-API-Fehler (Rate-Limit, Auth) trotz Retry.
   - Migration läuft lokal nicht durch und Ursache unklar.
   - Eine Task verlangt Architektur-Entscheidung (T028-artig), die in der Spec nicht eindeutig ist.
7. **Discord-Pings:** `/start-task` und `/finish-task` versuchen Webhooks. Wenn `DISCORD_DEV_WEBHOOK_URL` nicht gesetzt ist, überspringen die Skills den Ping — kein Hard-Fail.
8. **Niemals:** direkter Push auf `main`, `.env` committen, `as any` ohne Begründung, Tests skippen.

---

## Reihenfolge (Abhängigkeits-optimiert für maximalen autonomen Durchlauf)

> **Welle A** = sofort startbar, keine Abhängigkeiten
> **Welle B** = startbar, sobald die als „blockt" markierten PRs aus Welle A in `main` gemergt sind
> **Welle C** = post-Pilot, unabhängig

### Welle A — sofort startbar (parallel-safe, in dieser Reihenfolge sequenziell)

| # | Task | Titel | Größe | Spec-§ | Notizen |
|---|------|-------|-------|--------|---------|
| 1 | **T030** | Spec-Migrations-Referenzen + M15-Callback fixen | S (Doku) | M13/M14/M15-Specs | Quick-Win, kein Code, nur Markdown — perfekter Warm-up. |
| 2 | **T024** | Task-Datenmodell (`tasks`, `task_collaborators`, `task_activity_log`) + RLS | M | `Mitarbeiter_Webapp.md` §4 | Neue Migration (nächste freie Nummer prüfen, aktuell `110` zuletzt). Blockt T025+T027. |
| 3 | **T031** | Discord-Bot-Service (Notifications) | M | `Discord_Integration.md` | Eigenständig. `DISCORD_BOT_TOKEN` aus `.env`; Scope für Pilot eng halten. |
| 4 | **T022** | POS-Cron auf Owner-Connection umstellen | S–M | M15 / Migration 022 | Wichtig vor RLS-Aktivierung auf `pos_credentials`. |
| 5 | **T021** | M03-Detector als Event-Consumer entkoppeln | M | `CLAUDE.md` §5.8 + Architektur §9 | BullMQ-Queue `bewirtung-detection` analog `ocr-queue`. |
| 6 | **T023** | Integrationstests gegen echte DB für M05-Export + M15-POS | M | M05/M15 | Test-DB `gastro_test` via CI-Pattern. |
| 7 | **T033** | API-JSON-Felder snake_case vereinheitlichen | S–M | Datenmodell §1, CLAUDE.md §6.2 | Inventar mit Grep, dann Wire-facing fixen. Webapp-Konsumenten anpassen (`webapp/src/.../receipt.schema.ts`). |

### Welle B — startbar nach Merge von T024

| # | Task | Titel | Größe | Spec-§ | Notizen |
|---|------|-------|-------|--------|---------|
| 8 | **T025** | Task-Backend-API (CRUD, claim, complete, collaborators) | L | `Mitarbeiter_Webapp.md` §3.3, §4 | Hängt von T024-Schema ab. JWT-geschützt (M14-Cookie). Pagination per separatem COUNT. |
| 9 | **T027** | Auto-Trigger-Engine (Event → Task) | M–L | `Mitarbeiter_Webapp.md` §5 | Hängt von T024. Profitiert von T025-API. Mindestens 2 Pilot-Trigger (`requires_review`-Beleg, fehlgeschlagener Export). |

### Welle C — Post-Pilot, frei wählbar

| # | Task | Titel | Größe | Spec-§ | Notizen |
|---|------|-------|-------|--------|---------|
| 10 | **T035** | `invoices` + Auto-Rechnungs-Generator | L | `Mitarbeiter_Webapp.md` §6 | Pricing aus CLAUDE.md §1. Noch kein Stripe — interne Erzeugung + Idempotenz. |

---

## Explizit AUSGENOMMEN (nicht autonom startbar)

| Task | Grund |
|------|-------|
| T028 | Architektur-Entscheidung gemeinsam Steve+Andreas |
| T029 | Hängt von T028 ab |
| T019 | Hängt von T028 ab |
| T032 | Hängt von T029 ab |
| T016, T020, T026, T034, T036, T037 | Steve / Frontend |

---

## Abarbeitungs-Reihenfolge (konkret)

```
git checkout main && git pull
→ /start-task T030  → implement (Markdown only) → /finish-task → PR
→ /start-task T024  → migration + RLS + tests → /finish-task → PR
→ /start-task T031  → discord.js v14 service → /finish-task → PR
→ /start-task T022  → owner-connection refactor → /finish-task → PR
→ /start-task T021  → bullmq-queue + worker → /finish-task → PR
→ /start-task T023  → integration tests → /finish-task → PR
→ /start-task T033  → snake_case + webapp adapter → /finish-task → PR
  [warten ist nicht nötig — aber bevor T025 startet, prüfen ob T024 in main ist]
→ if T024 in main: /start-task T025 → CRUD + auth + tests → /finish-task → PR
→ if T024 in main: /start-task T027 → trigger-engine + listeners → /finish-task → PR
→ /start-task T035  → invoices + cron → /finish-task → PR
→ STOPP — Steve übernimmt die Reviews
```

---

## Reporting-Format (am Ende oder bei Stop)

Der Agent erstellt am Ende dieser Datei einen Abschnitt:

```
## Run-Report 2026-06-XX

- Gestartet: <Datum/Uhrzeit>
- Beendet: <Datum/Uhrzeit>
- Dauer: <Stunden>
- Tasks erledigt: T030, T024, T031, …
- PRs eröffnet: #82, #83, #84, …
- Tasks übersprungen (mit Grund): …
- Stop-Grund: <Liste exhausted | hard-blocker | …>
- Offene Punkte für Mensch: <Bullet-Liste>
```

