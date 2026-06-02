# T041 — RLS-GUC-Key-Mismatch beheben (Tenant-Isolation P0)

> **Owner:** Gemeinsam (Backend, kritisch)
> **Priorität:** P0 — Pilot-Go-Live-Blocker (KW22)
> **Dependencies:** keine (eigenständiger Fix; verwandt mit T022/#90, T023/#95)
> **Welle:** Hotfix
> **Spec-Referenzen:** CLAUDE.md §5.5 (Multi-Tenancy/RLS), `migrations/002_helpers.sql`, `scripts/setup-app-role.sql`
> **Entdeckt:** Review von Andreas' autonomem Nacht-Lauf 2026-06-02 (in #86, #90, #95 unabhängig aufgefallen)
> **Status:** in_progress (gemeinsam, 2026-06-02)

---

## Problem

Die RLS-Policy-Funktion `current_tenant_id()` (`migrations/002_helpers.sql:47`) liest den
Session-GUC **`app.current_tenant`**. Die produktiven Repositories setzten aber durchweg
den **falschen** Key:

- 9 Stellen (M01 `beleg.repository`, M15 `kasse-transactions`/`pos`, M05 `booking-credentials`/
  `export-log`/`belege-lexware-exporter`, DSGVO `request`/`loeschung`/`auskunft`) → `app.tenant_id`
- `core/db/tenant.ts` (`withTenant`/`queryAsTenant`) → `app.current_tenant_id` (dritter Key)

**Konsequenz:** Unter der Production-Rolle `gastro_app` (`NOSUPERUSER NOBYPASSRLS`, via
`scripts/setup-app-role.sql` + `core/db/role-check.ts` in Prod erzwungen) ergibt der falsche Key
`current_tenant_id() = NULL` → die Policy `tenant_id = current_tenant_id()` ist für **alle** Zeilen
false. Auf den FORCE-RLS-Tabellen (`belege`, `export_log`, `kasse_transactions`, `dsgvo_requests`,
`booking_credentials`) liefert jedes SELECT 0 Zeilen und jedes INSERT scheitert an WITH CHECK —
also App-Totalausfall bzw., falls Prod fälschlich als Owner liefe, **keine Tenant-Isolation**.

**Warum bisher unsichtbar:** Dev/CI verbindet als Rolle `pp` (Superuser, BYPASSRLS) → RLS wird
komplett umgangen, alle Mock-Tests grün. Die einzigen DB-Integrationstests hingen an dem in CI
ungesetzten `TEST_DATABASE_URL` und skippten still.

---

## Akzeptanz-Kriterien

- [x] Alle Tenant-Context-Setter nutzen `app.current_tenant` (11 Stellen korrigiert).
- [x] Kanonische Konstante `TENANT_GUC` in `core/db/tenant.ts` als Single Source of Truth.
- [x] Irreführende Doku-Kommentare auf den korrekten Key aktualisiert.
- [x] Real-DB-Integrationstest unter `gastro_app` (NOBYPASSRLS) via `SET LOCAL ROLE`:
      korrekter Key isoliert korrekt, falscher Key → 0 Zeilen, WITH CHECK blockt Fremd-INSERT.
- [x] End-to-End-Test ruft echte Repository-Funktion (`listBelege`) über `gastro_app`-Pool auf
      → wird rot, falls der Repository-Key zurückdriftet (empirisch verifiziert).
- [x] Test läuft in CI gegen `DATABASE_URL` (nicht `TEST_DATABASE_URL`) und ist dort PFLICHT
      (`CI=true` → hartes Fail statt stillem Skip).
- [x] Volle Backend-Suite grün (834 passed), Build + Lint grün.

---

## Hinweise / Follow-ups

- Der GUC-Key-Bug bestand schon vor Andreas' Lauf; nur Andreas' neuer Task-Code (#86) nutzte
  zufällig den korrekten Key. Verwandt: T022/#90 (SECURITY-DEFINER-Owner) und T023/#95
  (CI braucht `TEST_DATABASE_URL` für die übrigen Integrationstests) bleiben separat offen.
- Empfehlung: Neuer Code sollte `withTenant`/`queryAsTenant` (zentral, mit `TENANT_GUC`) nutzen
  statt inline `setTenantContext`-Helfer pro Modul zu duplizieren.
