# T042 — audit_log-Writer gegen falsches Schema (kein Business-Audit, GoBD)

> **Owner:** Backend (offen)
> **Priorität:** P1 — GoBD-relevant (CLAUDE.md §5.7), aber Legacy-Welt → an T028 gekoppelt
> **Dependencies:** T028 (Legacy-Abbau-Entscheidung) — bestimmt ob fixen oder löschen
> **Entdeckt:** Audit nach T041, 2026-06-02 (verifiziert)
> **Status:** backlog

---

## Problem

8 Audit-Writer schreiben `INSERT INTO audit_log (tenant_id, actor, action, resource, payload)` —
die Spalten **`action`/`resource`/`payload` existieren nicht** (echtes Schema `060_audit_log.sql`:
`entity_type, entity_id, event_type, actor JSONB, payload_before, payload_after, metadata`).
Zusätzlich wird `actor` als String statt JSONB übergeben und `SENTINEL_TENANT_ID` ohne
Tenant-Context genutzt. Jeder Insert wirft `column "action" does not exist` (42703), wird aber
im `try/catch` (`logger.warn`/leeres catch) **still geschluckt** → es wird **kein einziger
Business-Audit-Eintrag** geschrieben.

Betroffen (verifiziert):
- `src/modules/{m01,m02,m03,m05,m07,m08,m10}/services/audit.service.ts`
- `src/modules/_shared/receipts/handlers/{complete,update-status}.handler.ts`

**Warum unsichtbar:** Tests mocken die DB per SQL-String-Match → Spaltennamen nie gegen das echte
Schema validiert (gleiche Klasse wie der T041-RLS-GUC-Bug).

## Akzeptanz-Kriterien

- [ ] Alle 8 Writer auf den zentralen `logAuditEvent()` (`src/core/audit/audit-log.ts`, korrektes Schema) umstellen — innerhalb eines BEGIN/`setTenantContext`-Blocks mit echtem `tenant_id` (kein Sentinel).
- [ ] Real-DB-Integrationstest gegen `audit_log`, der Schema-Drift CI-rot macht (Muster: `rls-tenant-isolation.test.ts`).
- [ ] Legacy-Felder (`customerId`/`receiptId`) auf `entity_type`/`entity_id` mappen.

## Hinweis

Diese Writer gehören zur Legacy-`customer`/`receipt`-Welt. Falls T028 = **Abbau** (ADR-004 empfiehlt das),
werden Teile davon gelöscht statt repariert — daher zuerst T028 entscheiden. Siehe Memory `legacy-welt-schema-drift`.
