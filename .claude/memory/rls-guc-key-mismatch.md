---
name: rls-guc-key-mismatch
description: "KRITISCH/P0 — produktive Repositories setzen falschen RLS-GUC-Key, Tenant-Isolation greift in Prod nicht (oder bricht App). Vor KW22-Pilot fixen."
metadata: 
  node_type: memory
  type: project
  originSessionId: 6384482f-70ac-4b1f-8e89-88c1ea2eb49f
---

**Bestätigter P0-Befund (verifiziert 2026-06-02 beim Review von Andreas' Nacht-Lauf, in 3 unabhängigen PR-Reviews #86/#90/#95 entdeckt):**

Die RLS-Policy-Funktion `current_tenant_id()` (`backend/migrations/002_helpers.sql:47`) liest den GUC **`app.current_tenant`**. Die produktiven Module setzen aber durchweg den FALSCHEN Key:

- 9 Stellen setzen `app.tenant_id` (M01 `beleg.repository.ts:125`, M15 `kasse-transactions.repository.ts:57` + `pos.repository.ts:417`, M05 `booking-credentials.repository.ts`/`export-log.repository.ts`/`belege-lexware-exporter.ts`, dsgvo `request`/`loeschung`/`auskunft`)
- `core/db/tenant.ts:34` setzt einen DRITTEN, ebenfalls falschen Key `app.current_tenant_id`
- Nur Andreas' neuer Task-Code (PR #86) nutzt zufällig den korrekten `app.current_tenant`.
- Die zentrale preHandler-Middleware `core/auth/m14-tenant-context.ts` setzt gar keinen GUC, nur `req.tenantId` im App-Layer.

**Warum es nie auffällt:** Dev/CI läuft als DB-Rolle `pp` = Superuser → Superuser umgeht FORCE ROW LEVEL SECURITY komplett → alle Tests grün, Isolation existiert lokal nur durch explizite `WHERE tenant_id`-Klauseln im Code. Die Integrationstests (PR #95) laufen in CI gar nicht (kein `TEST_DATABASE_URL`).

**Konsequenz in Prod:** Setup-Script `backend/scripts/setup-app-role.sql` legt die App-Rolle `gastro_app` als `NOSUPERUSER NOBYPASSRLS` an, und `core/db/role-check.ts` erzwingt das in Prod. Dann liefert `current_tenant_id()` NULL → Policy `tenant_id = current_tenant_id()` ist für alle Zeilen false → auf FORCE-RLS-Tabellen (`belege`, `export_log`, `kasse_transactions`, `dsgvo_requests`, `booking_credentials`) liefert jedes SELECT 0 Zeilen und jedes INSERT scheitert an WITH CHECK. Entweder App-Totalausfall (wenn `gastro_app` aktiv) ODER keinerlei Tenant-Isolation (falls Prod noch fälschlich als Owner läuft).

**Fix:** Repo-weit auf `set_config('app.current_tenant', …, true)` vereinheitlichen + Real-DB-Integrationstest mit aktiver RLS unter `gastro_app`-Rolle (NOBYPASSRLS), der Tenant-A-sieht-nicht-Tenant-B beweist. Verwandt: [[webapp-test-stack]] (Test-DB-Setup), CI braucht `TEST_DATABASE_URL`. Hängt zusammen mit T022 (PR #90, SECURITY-DEFINER-Owner) und T023 (PR #95). Eigenen P0-Task anlegen.
