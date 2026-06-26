---
name: legacy-welt-schema-drift
description: KRITISCH — Legacy-customer-Welt-Code läuft gegen das neue tenants/belege-Schema und ist silent kaputt (falsche Spalten + RLS). Verstärkt Dringlichkeit von T028/ADR-004.
metadata: 
  node_type: memory
  type: project
  originSessionId: 6384482f-70ac-4b1f-8e89-88c1ea2eb49f
---

**Verifiziert 2026-06-02** beim Audit nach dem T041-RLS-Fix (siehe [[rls-guc-key-mismatch]]). Mehrere Code-Pfade aus der **Legacy-`customer`/`receipt`-Welt** wurden beim Reboot auf `tenants`/`belege` (ADR-004 / T028) nie umgestellt und laufen jetzt gegen ein Schema, das ihre Spalten nicht hat — sie scheitern zur Laufzeit, aber **silent** (try/catch + DB-mockende Tests).

**Befund 1 — `tenant.repository.ts` doppelt kaputt (Live-Route `/tenants`, `app.ts:267`):**
- `INSERT INTO tenants (slug, name)` und liest `row.name`/`row.active` — Spalten existieren nicht; `010_tenants.sql` hat `display_name`, `deletion_status`. → `column "name" does not exist`.
- Docblock behauptet „Tenants sind nicht RLS-geschützt" — falsch: `010_tenants.sql:52-53` = ENABLE+FORCE RLS, Write-Policy nur `is_rls_bypassed()`. Unter `gastro_app` (NOBYPASSRLS) werden create/update geblockt, `listTenants` liefert 0 Zeilen.

**Befund 2 — 8 audit_log-Writer gegen falsches Schema (kein Business-Audit, GoBD §5.7-Verstoß):**
`src/modules/{m01,m02,m03,m05,m07,m08,m10}/services/audit.service.ts` + `_shared/receipts/handlers/{complete,update-status}.handler.ts` schreiben `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)`. Echte Spalten (`060_audit_log.sql`): `entity_type, entity_id, event_type, actor JSONB, payload_before, payload_after, metadata`. → jeder Insert wirft `column "action" does not exist`, geschluckt im catch (`logger.warn`/leeres catch). Zusätzlich `SENTINEL_TENANT_ID` ohne Tenant-Context → auch bei korrektem Schema RLS-blockiert. Korrekter zentraler Writer existiert: `src/core/audit/audit-log.ts::logAuditEvent` — die Wrapper wurden nie darauf umgestellt.

**Warum unsichtbar:** Tests mocken die DB per `if (/INSERT INTO audit_log/i.test(sql)) return {rows:[]}` — Spaltennamen werden nie gegen das echte Schema validiert. Gleiche Klasse wie der RLS-GUC-Bug: nur unter der echten Prod-Konstellation (`gastro_app` + echtes Schema) sichtbar.

**Konsequenz:** Diese Befunde sind starke Argumente für **T028 Option A (Legacy-Welt abbauen)** statt reparieren. Falls Koexistenz: alle 8 Audit-Writer auf `logAuditEvent` (mit `setTenantContext`) umstellen + Real-DB-Test gegen `audit_log`, der Schema-Drift CI-rot macht. `tenant.repository.ts` auf neues Schema + `withTenant`/Bypass umstellen.

**Verwandt:** Infra-Risiko — `ALTER DEFAULT PRIVILEGES` in `scripts/setup-app-role.sql` greift nur für Objekte der ausführenden Rolle; läuft Migrate als `gastro_owner` aber setup als `pp`, fehlen `gastro_app`-Grants auf neue Tabellen in Prod (in Dev/CI unsichtbar, da Owner==App==pp). SCHEMA.md nennt nicht-existente ENV `DATABASE_URL_OWNER` (real: `DATABASE_URL_MIGRATE`).
