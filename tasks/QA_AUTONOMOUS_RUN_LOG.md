# QA Agent — Autonomer Run-Log (Start: 2026-06-01)

> **Owner:** QA-Bot
> **Branch-Prefix:** `qa/fix-NNN-<short>`
> **Parallele Agents:** Andreas-Backend (T021/T022/T024/T031), Steve-Frontend (T016/T020/T034)

---

## Phase 1 — Bestandsaufnahme (2026-06-01)

### Ergebnisse

| Prüfung | Status | Notiz |
|---------|--------|-------|
| `git pull --ff-only` | ✅ | main aktuell |
| `backend npm install` | ✅ | |
| `backend npm run lint` | ✅ | grün (andreas-WIP-files verursachen noise beim Check — aber tracked src/ ist sauber) |
| `backend npm run build` | ✅ | TypeScript kompiliert sauber |
| `backend npm test` | ❌ | 17 Failures in discord-oauth.test.ts |
| `webapp npm install` | ✅ | |
| `webapp npm run build` | ✅ | |
| `webapp npm test` | ⚠️ | 393 Tests grün aber MSW-Warnings |
| Dev-Server-Smoke | ❌ | ECONNREFUSED 5432 — keine DB lokal; erwartet ohne Docker |
| Migrations-Replay | SKIP | Docker nicht verfügbar |

---

## Bug-Inventar

---

## Bug #001 — Biome-Formatter-Fehler (Andreasens WIP-Dateien)

- **Quelle:** lint (auf Andreasens Branch)
- **File:** `backend/src/core/discord/discord-notifications.service.ts` + `tests/`
- **Beschreibung:** Formatter-Errors in Andreasens untracked WIP-Dateien. Auf main selbst ist lint grün.
- **Kollisionscheck:** ⛔ Andreasens T031-Revier — SKIP
- **Status:** skipped (Tabu-Zone)
- **Branch:** -
- **PR:** -

---

## Bug #002 — discord-oauth.test.ts: 17 Timeouts wegen fehlendem Redis-Mock

- **Quelle:** test
- **File:** `backend/tests/m14-auth/discord-oauth.test.ts`
- **Beschreibung:** Tests nutzen `buildApp()` (echte Redis-Connection), aber Redis nicht verfügbar in CI/lokal. Kommentar verspricht "ioredis MemoryMock via vi.mock" — dieser Mock existierte nicht. Alle Redis-Commands timeouten nach 5s.
- **Kollisionscheck:** ✅ frei (m14-auth Backend-Code ok laut QA_AUTONOMOUS_QUEUE.md)
- **Status:** fixed ✅
- **Branch:** `qa/fix-002-discord-oauth-test-redis-mock`
- **PR:** https://github.com/prozesspilot/gastro/pull/89

---

## Bug #003 — Fehlende MSW-Handler für /n8n/healthz und /api/v1/events

- **Quelle:** test (MSW-Warnings)
- **File:** `webapp/src/tests/msw/handlers.ts`
- **Beschreibung:** SettingsPage ruft `/n8n/healthz` auf, useReceiptEvents ruft `/api/v1/events` auf — beide hatten keinen MSW-Handler. Erzeugte Warnings in allen 41 Webapp-Tests.
- **Kollisionscheck:** ✅ frei (nicht in Steve-E2E-Tabu-Zone)
- **Status:** fixed ✅
- **Branch:** `qa/fix-003-msw-missing-handlers` + `qa/final-fixes`
- **PR:** https://github.com/prozesspilot/gastro/pull/91

---

## Phase 4 — Smoke-Test-Suite

- **Branch:** `qa/smoke-test-suite`
- **PR:** https://github.com/prozesspilot/gastro/pull/92
- **Skript:** `scripts/qa-smoke.sh`
- **Umfang:** Health, Ready, Auth-Status, Discord-Login-Redirect, API-Routes, Metriken, Fehler-Handling

---

## Phase 5 — Abschluss-Report (2026-06-01)

| Prüfung | Ergebnis |
|---------|---------|
| Backend lint | ✅ grün (auf main ohne WIP-Files) |
| Backend build (TypeScript) | ✅ grün |
| Backend tests (ohne discord-oauth Fix) | ❌ 17 Failures → via PR #89 gefixt |
| Backend tests (nach Fix) | ✅ 830/830 grün |
| Webapp build | ✅ grün |
| Webapp tests (ohne MSW-Fix) | ⚠️ 393 grün + Warnings → via PR #91 gefixt |
| Webapp tests (nach Fix) | ✅ 393/393 grün, keine Warnings |
| Migrations-Replay | ⏭️ SKIP (Docker nicht verfügbar) |
| Dev-Server-Smoke | ⏭️ SKIP (PostgreSQL nicht verfügbar lokal) |

### Bugs gefunden / gefixt / geskipped

| # | Bug | Status | PR |
|---|-----|--------|-----|
| 001 | Biome-Format in Andreasens WIP-Files | ⏭️ SKIP (Tabu) | - |
| 002 | Discord-OAuth-Tests Timeouts (Redis-Mock fehlend) | ✅ FIXED | #89 |
| 003 | MSW-Handler fehlend für /n8n/healthz + /api/v1/events | ✅ FIXED | #91 |

### Kann Steve manuell testen?

**Nein — noch nicht, aber sobald die 2 PRs gemergt sind und Docker läuft: Ja.**

**Voraussetzungen für manuelles Testen:**
1. PR #89 mergen (Discord-OAuth-Tests müssen grün sein — CI-Blocker)
2. PR #91 mergen (Webapp-Tests sauber — Hygiene)
3. `docker compose up -d` (Postgres + Redis starten)
4. `cd backend && npm run migrate` (Migrations ausführen)
5. `cd backend && PP_AUTH_DISABLED=1 npm run dev` (Backend starten)
6. `cd webapp && npm run dev` (Webapp starten)
7. `PP_AUTH_DISABLED=1 bash scripts/qa-smoke.sh` (Smoke-Tests)
8. Browser: http://localhost:5173

**Verbleibende Bugs in Tabu-Zone (müssen von Andreas gefixt werden):**
- Biome-Formatter-Errors in `src/core/discord/` (Andreasens T031-WIP-Files)
  — werden beim T031-PR automatisch gefixt wenn Andreas seinen Branch committed

**Verbleibende bekannte Einschränkungen (kein Bug, erwartet):**
- Backend startet lokal nicht ohne PostgreSQL
- 114 E2E-Tests übersprungen — erfordern PP_E2E=1 + laufende DB
