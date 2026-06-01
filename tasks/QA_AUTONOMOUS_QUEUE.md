# QA-Agent — Autonomer Bug-Fix-Lauf (Stand 2026-06-01)

> **Zweck:** Existierenden, bereits gemergten Code auf Fehler prüfen und Bugs in eigenen `qa/fix-*`-Branches reparieren, **parallel zu Andreas+Steve-Agents**, ohne Code-Konflikte.
>
> **Owner:** Andreas+Steve (gemeinsam), Agent läuft als „QA"
> **Erzeugt:** 2026-06-01

---

## Hartes Schreib-Revier — Kollisionsschutz

### Aktive Andreas-Tasks (NICHT anfassen)
- `backend/migrations/` (neue Nummern ab `120_*` reserviert für T024)
- `backend/src/modules/m15-pos-connector/pos.repository.ts` (T022)
- `backend/src/modules/m15-pos-connector/kasse-transactions.repository.ts` (T022)
- `backend/src/modules/m01-receipt-intake/services/ocr.service.ts` (T021 Event-Decoupling)
- Neue Files unter `backend/src/workers/bewirtung-detector-worker.ts` (T021)
- Neue Files unter `backend/src/services/discord-bot*.ts` (T031)
- `webapp/src/schemas/receipt.schema.ts` (T033)
- `Modulkonzept/Konzeptentwicklung/modules/M13_*.md`, `M14_*.md`, `M15_*.md`, `Discord_Integration.md` (T030/T031)

### Aktive Steve-Tasks (NICHT anfassen)
- `webapp/src/tests/e2e/receipt-flow.e2e.ts` (T020)
- `webapp/src/tests/e2e/` (T020 fasst alle E2E-Tests an)
- `setup-webapp/**` falls angelegt (T016)
- `webapp/src/pages/setup/**` falls angelegt (T016)
- `Modulkonzept/Konzeptentwicklung/Mitarbeiter_Webapp.md` (T034)

### Andere QA-Tabu-Zonen
- `tasks/ANDREAS_AUTONOMOUS_QUEUE.md`, `tasks/STEVE_AUTONOMOUS_QUEUE.md`
- `tasks/AUTONOMOUS_RUN_LOG.md`, `tasks/STEVE_AUTONOMOUS_RUN_LOG.md`
- `tasks/_backlog/T*.md`, `tasks/_in_progress/T*.md` (NUR die anderen Agents bewegen Tasks)
- `.env`, `.env.prod` (Secrets)

### Was QA-Agent ANFASSEN darf
- Alles andere, insbesondere:
  - Existierende, gemergte Module: `m02-*`, `m03-categorization/` (außer bewirtungs-detector als Pure-Function ok), `m04-*`, `m05-lexoffice/` (Service-Code ok, neue Tests nur in `m05-lexoffice/tests/qa-*.test.ts`), `m06-advisor-portal/`, `m10-*`, `m12-dsgvo/`, `m14-auth/` (Backend-Code ok), `m15-pos-connector/` außer den o.g. Files
  - `backend/src/core/**` (Auth, DB, Events, HMAC, Hooks)
  - `backend/src/cron/sumup-daily.ts`, `backend/src/cron/pos-credentials-cleanup.ts`
  - `webapp/src/` außer e2e-Tests und schemas/receipt.schema.ts
  - `infra/**`, `scripts/**`, `docker-compose*.yml`
  - `README.md`, `STRUCTURE.md`, `WORKFLOW_DAILY.md`, `CONTRIBUTING.md`
  - `Modulkonzept/Konzeptentwicklung/00_*.md`, `01_*.md`, `02_*.md`, `03_*.md`, `04_*.md`, `05_*.md`
  - Eigenes Log: `tasks/QA_AUTONOMOUS_RUN_LOG.md`
  - Eigene Queue/Report: `tasks/QA_AUTONOMOUS_QUEUE.md` (Report ans Ende)

---

## Was der QA-Agent tut (Reihenfolge)

### Phase 1 — Bestandsaufnahme auf frischem main

1. `git checkout main && git pull --ff-only origin main`
2. `cd backend && npm install --no-audit --no-fund`
3. `cd backend && npm run lint` → alle Fehler/Warnings sammeln
4. `cd backend && npm run build` → TypeScript-Fehler sammeln
5. `cd backend && npm test` → Test-Failures sammeln
6. `cd webapp && npm install --no-audit --no-fund`
7. `cd webapp && npm run build` → TypeScript/Vite-Fehler sammeln
8. `cd webapp && npm test` → Test-Failures sammeln
9. Dev-Server-Smoketest (Backend):
   ```
   cd backend && (nohup npm run dev > /tmp/qa-backend.log 2>&1 &)
   sleep 8
   curl -s http://localhost:3000/api/v1/health | jq
   curl -s http://localhost:3000/api/v1/metrics 2>/dev/null | head -5
   kill %1
   ```
   - Wenn der Server beim Start crashed: Stacktrace aus `/tmp/qa-backend.log` ist Bug #1.
10. Migrations-Replay (lokal gegen frische DB falls Docker verfügbar):
    ```
    docker compose up -d postgres
    cd backend && DATABASE_URL=postgresql://pp:pp@localhost:5432/pp_test npm run migrate
    ```
    - Fehler hier sind Bug #2.

### Phase 2 — Bug-Inventar

Für jeden gefundenen Fehler einen Eintrag in `tasks/QA_AUTONOMOUS_RUN_LOG.md`:
```
## Bug #N — <kurzbeschreibung>
- Quelle: lint | build | test | smoke | migration | manual-trace
- File: <path>:<line>
- Kollisionscheck: ✅ frei | ⛔ in Andreas/Steve-Revier — SKIP
- Status: queued | fixed | skipped | blocked
- Branch: qa/fix-<id>-<short>
- PR: <url oder ->
```

Vor JEDEM Fix: prüfen ob `File` im **Schreib-Revier-Block** oben ist. Wenn ja → **SKIP**, Bug nur dokumentieren.

### Phase 3 — Fixen (pro Bug ein PR)

Pro Bug, der nicht in der Tabu-Zone liegt:
1. `git checkout main && git pull --ff-only origin main`
2. Branch: `qa/fix-<id>-<short>` (z.B. `qa/fix-001-server-crash-on-empty-trust-proxy`)
3. Minimal-Fix (Scope eng halten, keine „Refactor"-Lust)
4. Regressions-Test hinzufügen, der den Bug reproduziert
5. `npm run lint && npm run build && npm test` (entsprechendes Verzeichnis) → grün
6. Commit mit Co-Author (Claude + `QA-Bot <qa@prozesspilot.net>`)
7. Push + `gh pr create` mit Description:
   - **Bug:** was war kaputt
   - **Root-Cause:** warum
   - **Fix:** was geändert
   - **Test:** Beweis dass es jetzt geht
8. PR-URL ins Log eintragen
9. Nächster Bug

### Phase 4 — Smoke-Test-Suite ausbauen

Wenn Phase 3 abgeschlossen (alle frei verfügbaren Bugs gefixt), zusätzlich:
- Ein **Smoke-Test-Skript** `scripts/qa-smoke.sh` schreiben, das alle kritischen Endpoints (Health, Auth-Status, Beleg-Upload-Stub, Tenant-Liste) durchgeht.
- Falls schon vorhanden: erweitern.
- PR `qa/smoke-test-suite`.

### Phase 5 — Manuelle Test-Bereitschaft

Am Ende Bericht erstellen:
- Backend startet sauber: ✅/❌
- Webapp baut: ✅/❌
- Migrations laufen lokal durch: ✅/❌
- Smoke-Endpoints antworten: ✅/❌
- Verbleibende Bugs (in Tabu-Zone, müssen von Andreas/Steve gefixt werden): Liste
- Kann Steve jetzt manuell testen? **Ja/Nein + warum.**

---

## Stop-Bedingungen
- Alle nicht-Tabu Bugs behoben + PRs eröffnet
- Build/Test/Lint auf main grün **und** Smoke-Endpoints OK **und** Migrations grün → Phase 5 Report
- `gh` / `git push` auth-failure trotz Retry → Stop + Report
- 3 aufeinanderfolgende Bug-Fix-Versuche failen → Stop + Report

---

## Niemals
- Direkt auf `main` pushen
- Andreas/Steve-Tabu-Files anfassen
- Tests skippen oder `as any` ohne Begründung einfügen
- `.env`/Secrets committen
- Eine Migration anlegen (Andreas-Revier)
- Eine Feature dazubauen — NUR Bugfixes

---

## Abschluss-Report (QA-Run 2026-06-01)

### Kennzahlen

| Kategorie | Wert |
|-----------|------|
| Bugs gefunden | 3 |
| Bugs gefixt | 2 |
| Bugs geskipped (Tabu-Zone) | 1 |
| PRs eröffnet | 3 |

### Build-Status

| Prüfung | Status |
|---------|--------|
| Backend lint | ✅ grün |
| Backend build | ✅ grün |
| Backend tests (mit Fix) | ✅ 830/830 grün |
| Webapp build | ✅ grün |
| Webapp tests (mit Fix) | ✅ 393/393 grün, keine MSW-Warnings |
| Migrations | ⏭️ SKIP (Docker nicht verfügbar) |
| Smoke-Endpoints | ⏭️ SKIP (PostgreSQL lokal nicht verfügbar) |

### PRs

| PR | Beschreibung |
|----|-------------|
| [#89](https://github.com/prozesspilot/gastro/pull/89) | fix(m14-auth): Discord-OAuth-Tests auf Mock-Redis umstellen |
| [#91](https://github.com/prozesspilot/gastro/pull/91) | fix(webapp): MSW-Handler für /n8n/healthz und /api/v1/events |
| [#92](https://github.com/prozesspilot/gastro/pull/92) | chore(qa): Smoke-Test-Skript scripts/qa-smoke.sh |

### Kann Steve jetzt manuell testen?

**Nein — noch nicht. Sobald PR #89 und #91 gemergt sind und Docker-Infrastruktur läuft: Ja.**

**Schritte für manuelles Testen nach den Merges:**
1. `docker compose up -d` (Postgres + Redis starten)
2. `cd backend && npm run migrate` (Migrations ausführen)
3. `cd backend && PP_AUTH_DISABLED=1 npm run dev` (Backend starten)
4. `cd webapp && npm run dev` (Webapp starten)
5. `PP_AUTH_DISABLED=1 bash scripts/qa-smoke.sh` (Smoke-Tests)
6. Browser: http://localhost:5173 öffnen

### Verbleibende Bugs (Tabu-Zone)

- Biome-Formatter-Errors in `backend/src/core/discord/` — Andreasens T031-WIP-Files.
  Werden beim T031-PR automatisch gefixt wenn Andreas seinen Branch committed.
