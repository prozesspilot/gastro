# T043 — tenant.repository.ts gegen falsches Schema + falsche RLS-Annahme

> **Owner:** Backend (offen)
> **Priorität:** P1 — Live-Route `/tenants` (Mitarbeiter-Webapp), an T028 gekoppelt
> **Dependencies:** T028 (Legacy-Abbau-Entscheidung)
> **Entdeckt:** Audit nach T041, 2026-06-02 (verifiziert)
> **Status:** backlog

---

## Problem

`src/modules/tenants/tenant.repository.ts` ist doppelt kaputt und als Live-Route `/tenants`
(`app.ts:267`, gegen den `gastro_app`-Pool) verdrahtet — aktiv genutzt von der Mitarbeiter-Webapp
(GlobalSearch, OnboardingModal):

1. **Falsches Schema:** `INSERT INTO tenants (slug, name)` und liest `row.name`/`row.active` —
   diese Spalten existieren nicht. `010_tenants.sql` hat `display_name`, `deletion_status`.
   → `column "name" does not exist`.
2. **Falsche RLS-Annahme:** Docblock behauptet „Tenants sind nicht RLS-geschützt", aber
   `010_tenants.sql:52-53` = ENABLE+FORCE RLS; Write-Policy nur `is_rls_bypassed()`. Unter
   `gastro_app` (NOBYPASSRLS) werden `createTenant`/`updateTenant` geblockt, `listTenants`
   liefert 0 Zeilen.

## Umsetzung (2026-06-30, Steve) — Spec war stale, Scope reduziert

**Ist-Stand-Korrektur:** Die Spec (2026-06-02) nahm an, die ganze `/tenants`-Route + das CRUD seien
live. Der **A3-Webapp-Reboot (T058)** hat die Live-Route aber längst durch `routes/tenants.routes.ts`
+ die SECURITY-DEFINER-Fn `list_tenants_for_staff()` (Migration 121) ersetzt. `modules/tenants/` war
dadurch **verwaiste Hülle**: das CRUD (`createTenant`/`listTenants`/`findTenantById`/`updateTenant`,
Falsch-Spalten `name`/`active`) + `tenant.routes.ts` waren tot (kein Importeur, nicht registriert).
**Einzig live:** `tenantExists` (vom M01-Upload-Handler genutzt) — und genau das hatte den RLS-Bug.

- [x] **Echter Prod-Bug gefixt:** `tenantExists` machte ein nacktes `pool.query` ohne Tenant-Kontext
      gegen die FORCE-RLS-`tenants` → unter `gastro_app` (NOBYPASSRLS) immer 0 Zeilen → M01-Upload
      hätte in Prod jeden Beleg mit „tenant not found" abgelehnt (Dev/CI unsichtbar, pp=Superuser).
      Fix: SECURITY-DEFINER-Fn **`tenant_exists(uuid)`** (Migration 130, Muster wie 121) — bypass
      transaktions-lokal, reiner boolescher Check; `tenantExists` ruft sie via `pool.query`.
- [x] **Falsch-Spalten-Code entfernt** statt korrigiert: das tote CRUD + `tenant.routes.ts` gelöscht
      (war seit T058 obsolet). `tenant.repository.ts` enthält nur noch `tenantExists`.
- [x] Irreführende „kein RLS"-Kommentare entfernt (Docblock neu).
- [x] **Integrationstest unter echtem `gastro_app`** (`__tests__/integration/tenant-exists-rls.test.ts`):
      beweist, dass der ALTE bare query 0 Zeilen liefert (Bug) und `tenant_exists()` true/false korrekt
      gibt (existierend/unbekannt/soft-deleted) + kein Bypass-Leak für den Aufrufer.
- [x] M01-Upload-Unit-Test-Mocks auf `SELECT tenant_exists(...)` angepasst (42 Tests grün).

**Verifikation:** lokal lint/build/966 Tests grün; RLS-Integrationstest läuft real in CI (gastro_app +
Migration 130). **Live-Wirkung in Prod erst nach Migrations-Lauf** (Migration 130).

## Hinweis

Schließt den `tenant.repository`-Teil der `legacy-welt-schema-drift` (Befund 1). Der `audit.service`-
Teil (Befund 2) wurde in PR #226 erledigt. T028-Kopplung entfällt (A3-Reboot hat den Live-Pfad
bereits ersetzt). Verwandt mit [[T042]] (faktisch obsolet).
