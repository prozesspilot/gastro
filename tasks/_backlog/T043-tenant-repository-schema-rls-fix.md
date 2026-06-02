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

## Akzeptanz-Kriterien

- [ ] Spalten auf reales 010-Schema (`display_name`, `deletion_status`, …) korrigieren.
- [ ] Cross-tenant-Zugriffe (`listTenants`, create/update) über Owner-Bypass-Connection
      (`withTenant`/Bypass) statt naiver `pool.query` unter `gastro_app`.
- [ ] Irreführende „kein RLS"-Kommentare entfernen.
- [ ] Integrationstest gegen echte DB (Webapp-Tenant-Liste funktioniert unter `gastro_app`).

## Hinweis

Legacy-`customer`-Welt-Drift (Reboot nie nachgezogen). Lösung hängt an T028 (Abbau vs. Koexistenz).
Siehe Memory `legacy-welt-schema-drift`, verwandt mit [[T042]].
