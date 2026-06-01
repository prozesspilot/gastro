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
- **Branch:** `qa/fix-003-msw-missing-handlers`
- **PR:** https://github.com/prozesspilot/gastro/pull/91

---
