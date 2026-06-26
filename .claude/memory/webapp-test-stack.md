---
name: webapp-test-stack
description: "jsdom muss ≤25 bleiben solange Vitest 2.1 läuft (sonst crasht MSW). Node-26-lokal bricht localStorage-Tests (8 Tests/2 Files, CI=Node 20 grün). window.location.reload-Mock-Falle in jsdom."
metadata: 
  node_type: memory
  type: project
  originSessionId: 0975f287-95d6-423d-8a66-1942ca8a1e50
---

**Webapp-Test-Stack hat zwei Constraints:**

1. **jsdom muss `^25.x` bleiben** solange Vitest 2.1.x in Verwendung ist. Vitest 2.1.9 deklariert `jsdom@^25.0.1` in seinen devDeps. jsdom 27+ hat Breaking-Changes bei Body-Stream-Semantik, die MSW's `@mswjs/interceptors` mit `apiBlob`/FormData crashen lassen (`TypeError: object.stream is not a function`).

2. **`receipt-flow.e2e.ts` existiert nicht mehr** — im A3-Reboot (T059, PR #136, 2026-06-16) gelöscht/ersetzt durch `webapp/src/tests/e2e/belege-flow.e2e.ts` (belege-Welt-Routen, M14-Cookie-Login). Die aktuelle LoginPage hat Discord-OAuth als Primär + Notfall-Login-Toggle (standardmäßig zugeklappt).

3. **jsdom `window.location.reload` ist non-configurable** — `Object.defineProperty(window.location, 'reload', …)` wirft `Cannot redefine property: reload`. ABER `window.location` selbst IST ersetzbar: `Object.defineProperty(window, 'location', { configurable: true, value: { href, origin, reload: vi.fn() } })` (in beforeEach setzen, in afterEach Original zurücksetzen). So testet `TenantSelector.test.tsx` den Reload nach Tenant-Wechsel.

**Why:**
- jsdom-Constraint: Lokal-Probe vor PR #64 zeigte Real-CI-Failure (4 Tests in apiBlob/uploadReceipt/downloadReport timeouten). Fix per PR #64 (steve/fix-webapp-jsdom-msw) hat 4 Andreas-PRs entblockt, die unverschuldet blockiert waren.
- E2E-Migration: Login-Flow wurde auf Discord-OAuth umgestellt — Notfall-Login (Email+TOTP) ist nur für Geschäftsführer und standardmäßig zugeklappt. Die alten E2E-Tests gingen davon aus, dass Email/Passwort sofort sichtbar sind.

**Node-Version-Falle (lokal):** CI nutzt **Node 20** (`.github/workflows/ci-backend.yml`). Auf lokalem **Node 26** crashen Webapp-Tests, die direkt `localStorage.clear()`/`.setItem()` in `beforeEach`/Test aufrufen, mit `Cannot read properties of undefined (reading 'clear'/'setItem')` — jsdom 25 stellt `localStorage` unter Node 26 nicht bereit. Nach dem A3-Reboot (T059, 2026-06-16) sind das genau **8 Tests in 2 Files** (`api/_client.test.ts`, `auth/ProtectedRoute.test.tsx`). Das ist ein reines Lokal-Artefakt und **kein** echter CI-Fehler. Zum lokalen Verifizieren von Webapp-Tests Node 20 nutzen; sonst gezielt nur die nicht-storage-Files prüfen (`receipts.test.ts`, `reports.test.ts`, `_client.test.ts > apiBlob`). `tsc --noEmit` + `vite build` sind node-version-unabhängig.

**Backend-Tests lokal (kein DB nötig laut CLAUDE.md, aber Integration schon):** Volle Suite braucht Postgres 16 + Redis 7. CI-äquivalentes Setup: `docker run -d --name pp-test-pg -e POSTGRES_DB=prozesspilot_test -e POSTGRES_USER=pp -e POSTGRES_PASSWORD=pp -p 5432:5432 postgres:16` + `redis:7` auf 6379. Vor Migrate die Rolle `gastro_app` anlegen (`CREATE ROLE gastro_app NOLOGIN NOSUPERUSER NOBYPASSRLS`). Env-Vars siehe Test-Step in ci-backend.yml (`DATABASE_URL`, `PP_AUTH_DISABLED=1`, `PP_PGCRYPTO_KEY`, `JWT_SECRET`, `LEXOFFICE/SEVDESK_API_BASE=http://localhost:9999`, `NODE_ENV=test`). Bei Branch-Wechsel test-DB neu anlegen, sonst Migrationsnummern-Kollisionen.

**How to apply:**
- Bei Test-Schreiben in der Webapp, die Email/Passwort-Felder brauchen: erst `page.getByRole('button', { name: /notfall-login/i }).click()` aufrufen, bevor `getByLabel(/email/i)` funktioniert.
- Wenn jemand `jsdom`-Upgrade vorschlägt, klar machen: gleichzeitig muss Vitest auf 3.x+ migriert werden (sonst gleicher Bug). Follow-up-Task: `vitest 4.x + jsdom modern + audit cleanup`.
- Belege-Seiten-Tests (`BelegeListPage`/`BelegeUploadPage`/`BelegeDetailPage`): seit T059 haben die Seiten einen noTenant-Guard → im Test `vi.mock('../api', () => ({ getActiveTenantId: () => 'tenant-001' }))`, sonst rendert nur `NoTenantHint` und die MSW-Calls feuern nie. Siehe [[a3-webapp-reboot-plan]].

Related: [[blob-realm-mismatch]] (instanceof Blob ist über Realm-Grenzen unzuverlässig, daher semantischer size+type-Check in Tests).
