# T011 — Postgres-Migrations-Audit + Bootstrap-Reset

> **Owner:** Andreas
> **Geschätzt:** 1 Tag
> **Priorität:** P0 (Foundation — muss VOR allen anderen Tasks fertig sein)
> **Dependencies:** Keine
> **Welle:** 1 (zuerst!)
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` Sektion „Datenmodell"

---

## Ziel

Pre-Reboot-Migrations gegen das neue Konzept-Datenmodell abgleichen. Fehlende Tabellen/Spalten als neue Migrations ergänzen, sodass alle nachfolgenden Tasks (T001-T010) auf ein konsistentes Schema bauen können.

---

## Akzeptanz-Kriterien

- [x] Inventory: alle existierenden Migrations in `backend/migrations/` aufgelistet mit Status
- [x] Abgleich gegen Konzept-Datenmodell aus `01_Datenmodell_Events.md` + Modul-Specs M01/M11/M12/M14/M15
- [x] Fehlende Tabellen identifiziert: `users`, `tenants`, `belege`, `kasse_integrations`, `kasse_transactions`, `export_log`, `audit_log`, `tenant_settings`
- [x] Neue Migrations geschrieben für fehlende Tabellen/Spalten (eine Migration pro Konzept-Erweiterung)
- [x] Indexes auf häufige Query-Pfade: `(tenant_id, status)`, `(tenant_id, received_at DESC)`, `(file_sha256)` unique, `(discord_user_id)` unique
- [x] Row-Level-Security (RLS) Policies für Tenant-Isolation auf ALLEN Tabellen mit `tenant_id` — inkl. `FORCE ROW LEVEL SECURITY` gegen Owner-Bypass
- [x] Migrations-Down-Pfad für Rollback getestet (`backend/migrations/_rollback.sql`)
- [x] Fresh-DB-Test: `dropdb && createdb && npm run migrate` läuft fehlerfrei durch
- [x] Seed-Daten-Skript für lokale Dev-Umgebung (Test-Tenant + Test-User) → `npm run seed:dev`
- [x] Dokumentation: `backend/migrations/SCHEMA.md` mit ER-Diagramm-Beschreibung

## Implementation-Notes

**Bootstrap-Reset durchgeführt:** Pre-Reboot-Migrations (root-`/migrations/`, 26 SQL-Files mit zwei parallelen "Welten" Welt-A TEXT/Welt-B UUID) komplett entfernt. Neuer kanonischer Pfad: `backend/migrations/` (per Spec). `migrate.ts` umgehängt und um `_`-Prefix-Filter erweitert, damit `_rollback.sql` nicht als Migration interpretiert wird.

**Migration-Inventar (8 neue Files):**
- `001_extensions.sql` — pgcrypto, citext, uuid-ossp
- `002_helpers.sql` — `set_updated_at()`, `current_tenant_id()`, `is_rls_bypassed()`
- `010_tenants.sql` — `tenants`, `tenant_settings` (RLS + FORCE)
- `020_users_auth.sql` — `users`, `auth_sessions`, `auth_audit_log` (gemäß M14)
- `030_belege.sql` — `belege` (UUID-PK, status-FSM, JSONB-payload, RLS + FORCE)
- `040_kasse.sql` — `kasse_integrations`, `kasse_transactions` (gemäß M15)
- `050_export_log.sql` — `export_log` (M04-M07 + M11, beleg- + period-basiert)
- `060_audit_log.sql` — `audit_log` (BIGSERIAL, append-only via Trigger)

**Tests:** `backend/tests/migrations/schema.test.ts` — 5 grüne Tests, skipped ohne `TEST_DATABASE_URL`.

**Production-Hinweis:** Backend muss mit Non-Superuser-Rolle (`gastro_app`) laufen, sonst greift RLS nicht. SCHEMA.md § 7 dokumentiert das CREATE-ROLE + GRANT-Pattern.

**Lint/Type-Check:** Meine Files passieren `biome check` + `tsc --noEmit` clean. Pre-Reboot-Code (67 vorhandene Lint-Fehler) ist außerhalb des T011-Scopes.

## Review-Fixes Nachgezogen (2026-05-18)

Code-Review meldete 6 Blocker + Schwerwiegende. Auf demselben Branch nachgezogen:

- **B5 — `is_rls_bypassed()` mit Rollen-Check**: Bypass funktioniert jetzt NUR für Superuser oder Rolle `gastro_owner`. Eine kompromittierte App-Session kann `SET app.bypass_rls='on'` zwar absetzen, die Funktion liefert aber trotzdem `false` → RLS bleibt wirksam.
- **B6 — Audit-Bypass entkoppelt**: Neuer Helper `is_audit_maintenance()` mit eigener GUC `app.audit_maintenance`. Audit-Trigger nutzt diese statt `is_rls_bypassed`, damit ein versehentlicher RLS-Bypass NICHT die Append-Only-Garantie aushebelt.
- **B3 — `auth_audit_log` gehärtet**: RLS + FORCE aktiviert, Policy (Geschäftsführer ODER eigener User), Append-Only-Trigger mit dem gleichen Pattern wie `audit_log`. Neuer Helper `current_user_id()`.
- **B1 — Seed `BEGIN` vor `SET LOCAL`**: Reihenfolge korrigiert, sonst war das Setting wirkungslos.
- **B2 — Test-Pattern `set_config(..., true)`**: Tests verwenden jetzt das Production-Pattern statt `SET ... ` (das den Pool leakt). SCHEMA.md § 2 hat eine fette Warnung.
- **B4 — Backend-Startup-Check**: `backend/src/core/db/role-check.ts` + Wiring in `server.ts`. In Production crasht der Start mit klarer Fehlermeldung wenn DB-Rolle Superuser oder BYPASSRLS. Plus `backend/scripts/setup-app-role.sql` als idempotentes Template für `gastro_app`-Setup.
- **S1 — `tenants`-Policy**: `current_tenant_id() IS NULL`-Klausel entfernt. Vergessene Middleware → 0 Rows, nicht "alle".
- **S3 — `modules_enabled` CHECK**: Validation gegen Module-Whitelist M01–M15 via `valid_module_ids()` (IMMUTABLE Function, weil Postgres keine Subqueries in CHECK erlaubt).
- **S4 — `pg_advisory_lock`**: Migrate-Runner serialisiert konkurrierende Migrations-Runs (z. B. parallele Auto-Deploy-Pods).
- **S6 — `file_sha256`-Konvention**: Architektur-Doku verlangte `SHA256(file_bytes + tenant_id)`; klargestellt im Code-Kommentar, dass `(tenant_id, file_sha256)` als UNIQUE-Constraint funktional äquivalent ist.

**Tests:** Auf 9 erweitert (von 5). Neue Tests:
- B5: App-Rolle kann `is_rls_bypassed()` nicht aktivieren
- B3: `auth_audit_log` append-only
- S3: `modules_enabled` CHECK lehnt ungültige IDs ab
- S1: `tenants` ohne Tenant-Context liefert 0 Rows

Alle 9 Tests grün. Fresh-DB-Test wieder verifiziert.

## Claude-Code-Start-Prompt

```
Lies 00_Architektur_Hauptdokument.md + alle modules/M*.md Sektionen mit "Datenmodell".
Vergleich gegen aktuelle Migrations in backend/migrations/.
Implementiere T011: fehlende Migrations + RLS-Policies.
Test: dropdb gastro_dev && createdb gastro_dev && npm run migrate sollte sauber durchlaufen.
Branch: andreas/T011-migrations-audit
```

## Hinweis für Owner (Andreas)
Du schreibst NICHT selbst SQL — Claude Code generiert die Migrations basierend auf den Konzept-Specs. Du gibst nur den Start-Prompt und reviewst dann ob die Migrations plausibel sind. Bei Unsicherheit: Steve im PR-Review nach Sicht-Check fragen.

## Rollback-Plan
Falls Migrations Probleme machen: Pre-Reboot-Schema lassen wie es ist und für jede neue Task eigene Tabellen anlegen. Konsolidieren nach Pilot-Phase.
