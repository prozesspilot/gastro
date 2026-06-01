# Gastro — Datenbank-Schema

> Stand: 2026-05-18 (T011 — Postgres-Migrations-Audit + Bootstrap-Reset)
> Datenbank-Engine: **PostgreSQL 16**
> Migrations-Tool: `backend/src/core/db/migrate.ts` (sortiert alphabetisch, läuft transaktional)

---

## 1. Migrations-Übersicht

| # | Datei | Inhalt | RLS? |
|---|---|---|---|
| 001 | `001_extensions.sql` | `pgcrypto`, `citext`, `uuid-ossp` | — |
| 002 | `002_helpers.sql` | `set_updated_at()`, `current_tenant_id()`, `is_rls_bypassed()` | — |
| 010 | `010_tenants.sql` | `tenants`, `tenant_settings` | ✓ |
| 020 | `020_users_auth.sql` | `users`, `auth_sessions`, `auth_audit_log` | — (Mitarbeiter sind cross-tenant) |
| 030 | `030_belege.sql` | `belege` | ✓ |
| 040 | `040_kasse.sql` | `kasse_integrations`, `kasse_transactions` | ✓ |
| 050 | `050_export_log.sql` | `export_log` | ✓ |
| 060 | `060_audit_log.sql` | `audit_log` (immutable, append-only) | ✓ (read), bypass-only (write/update/delete) |
| 070 | `070_ocr_cost_log.sql` | `ocr_cost_log` | ✓ |
| 080 | `080_dsgvo_requests.sql` | `dsgvo_requests` | ✓ |
| 090 | `090_belege_soft_delete.sql` | Soft-Delete-Spalten auf `belege` | — (ALTER TABLE) |
| 100 | `100_booking_credentials.sql` | `booking_credentials` | ✓ |
| 110 | `110_kasse_transactions_fk_relax.sql` | FK-Relax auf `kasse_transactions.integration_id` | — (ALTER TABLE) |
| 120 | `120_tasks.sql` | `tasks`, `task_collaborators`, `task_activity_log` | ✓ (alle 3 Tabellen) |

Migrationen sind **rückwärts-kompatibel** und **idempotent durch den Runner** (`schema_migrations` Tabelle trackt angewandte Versionen). Jede Migration läuft in einer eigenen Transaktion — Fehler → Rollback.

Fresh-Setup:
```bash
dropdb gastro_dev || true
createdb gastro_dev
npm run migrate
npm run seed:dev
```

---

## 2. Tenant-Isolation (RLS)

Alle Tabellen mit `tenant_id` haben **Row-Level-Security** aktiviert und eine
Policy, die nur Zeilen freigibt, deren `tenant_id = current_tenant_id()` ist.

Das Backend setzt diese GUC-Variable pro Request — **immer transaktionslokal**:

```sql
BEGIN;
SELECT set_config('app.current_tenant', '<tenant-uuid>', true);  -- 3. Arg = LOCAL
-- … Queries …
COMMIT;
```

> ⚠️ **WARNUNG — kritisch für Sicherheit:**
> Niemals `SET app.current_tenant = '…'` ohne `LOCAL` benutzen. Plain `SET`
> wirkt **session-weit**, d. h. das Setting bleibt aktiv, wenn die Connection
> in den Pool zurückgegeben wird. Der nächste Request, der dieselbe Connection
> bekommt, sieht dann Belege des falschen Tenants. Das ist ein direkter
> Cross-Tenant-Datenleak.
>
> **Korrekt:** `set_config(name, value, true)` innerhalb `BEGIN/COMMIT`. ODER
> `SET LOCAL name = …` innerhalb `BEGIN/COMMIT`. Beide enden mit dem Transaktions-End.

Wartungs- / Bootstrap-Scripts können RLS gezielt umgehen — funktioniert
**nur** unter Postgres-Superuser oder Rolle `gastro_owner`:

```sql
BEGIN;
SET LOCAL app.bypass_rls = 'on';
-- … Queries …
COMMIT;
```

Für seltene `audit_log`-Korrekturen (DSGVO-Erasure mit gerichtlichem
Beschluss, Forensik) muss zusätzlich `app.audit_maintenance = 'on'` gesetzt
sein — sonst blockt der Append-Only-Trigger auch unter Bypass.

Helper-Funktionen aus `002_helpers.sql`:

- `current_tenant_id()` → `uuid` der aktuellen Session, sonst `NULL`
- `current_user_id()` → `uuid` des eingeloggten Mitarbeiters, sonst `NULL`
- `is_rls_bypassed()` → `boolean`, **nur** `true` wenn die Session Superuser
  *oder* Rolle `gastro_owner` ist **und** `app.bypass_rls = 'on'` gesetzt ist
- `is_audit_maintenance()` → `boolean`, gleiche Rolle-Bedingung plus
  `app.audit_maintenance = 'on'`

Policy-Pattern (auf allen Tenant-Tabellen):
```sql
USING      (is_rls_bypassed() OR tenant_id = current_tenant_id())
WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id())
```

Zusätzlich wird auf allen Tenant-Tabellen `ALTER TABLE ... FORCE ROW LEVEL
SECURITY` gesetzt — sonst würde der Table-Owner RLS ignorieren. **Wichtig:**
Postgres-Superuser umgehen RLS trotzdem. Die App muss in Production mit einer
nicht-Superuser-Rolle laufen (siehe § 7 unten).

`audit_log` hat zusätzlich Trigger, die UPDATE/DELETE blockieren (Append-only,
Bypass nur für Wartungs-Skripte mit triftigem Grund).

---

## 3. ER-Diagramm

```mermaid
erDiagram
  tenants ||--|| tenant_settings : has
  tenants ||--o{ belege : contains
  tenants ||--o{ kasse_integrations : connects
  tenants ||--o{ kasse_transactions : produces
  tenants ||--o{ export_log : exports
  tenants ||--o{ audit_log : logs
  tenants ||--o{ tasks : "0..N Tasks"
  belege  ||--o{ export_log : "1 Beleg → N Export-Versuche"
  kasse_integrations ||--o{ kasse_transactions : "1 OAuth → N Tages-Snapshots"
  users   ||--o{ auth_sessions : owns
  users   ||--o{ auth_audit_log : produces
  users   ||--o{ tasks : "assigned_to"
  tasks   ||--o{ task_collaborators : "Helfer"
  tasks   ||--o{ task_activity_log : "Aktivitaets-Log"

  tenants {
    uuid id PK
    varchar slug UK
    varchar display_name
    varchar package
    varchar pos_system
    varchar deletion_status
    timestamptz cancelled_at
    timestamptz deleted_at
  }

  tenant_settings {
    uuid tenant_id PK FK
    jsonb modules_enabled
    jsonb integrations
    jsonb routing
    jsonb notification
    jsonb custom
    int profile_version
  }

  users {
    uuid id PK
    varchar discord_user_id UK
    varchar display_name
    varchar role
    citext emergency_email UK
    boolean active
  }

  auth_sessions {
    uuid id PK
    uuid user_id FK
    varchar jwt_jti UK
    varchar login_method
    timestamptz expires_at
    timestamptz revoked_at
  }

  belege {
    uuid id PK
    uuid tenant_id FK
    varchar status
    varchar source_channel
    text file_object_key
    char file_sha256 "UNIQUE (tenant_id, file_sha256)"
    jsonb payload
    varchar supplier_name
    date document_date
    numeric total_gross
  }

  kasse_integrations {
    uuid id PK
    uuid tenant_id FK
    varchar pos_system
    bytea access_token_encrypted
    bytea refresh_token_encrypted
    timestamptz token_expires_at
    boolean active
  }

  kasse_transactions {
    uuid id PK
    uuid tenant_id FK
    uuid integration_id FK
    date business_date
    numeric total_brutto
    numeric ust_19_amount
    numeric ust_7_amount
    boolean exported_to_accounting
  }

  export_log {
    uuid id PK
    uuid tenant_id FK
    uuid beleg_id FK "NULL bei Monats-Exports"
    smallint period_year
    smallint period_month
    varchar target
    varchar status
    text external_id
    int attempt_no
  }

  audit_log {
    bigserial id PK
    uuid tenant_id FK
    varchar entity_type
    text entity_id
    varchar event_type
    jsonb actor
    jsonb payload_before
    jsonb payload_after
  }
```

---

## 4. Wichtige Konventionen

### 4.1 IDs
- Alle Business-Tabellen verwenden `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Ausnahme: `audit_log.id BIGSERIAL` (monotonische Reihenfolge, kein Verstecken).

### 4.2 Zeitstempel
- `created_at TIMESTAMPTZ DEFAULT now()`
- `updated_at TIMESTAMPTZ DEFAULT now()` mit Trigger `set_updated_at()` (auto-update bei UPDATE).
- Alle Zeitstempel in UTC (TIMESTAMPTZ).

### 4.3 JSONB-Felder
- `belege.payload` → vollständiges Receipt-JSON (siehe `01_Datenmodell_Events.md` § 2.1).
- `tenant_settings.{integrations,routing,notification,custom}` → siehe `02_Kundenprofil_System.md`.
- `audit_log.{actor,payload_before,payload_after,metadata}` → Diff-Tracking.

### 4.4 Idempotenz
- `belege` → `UNIQUE (tenant_id, file_sha256)` verhindert Duplikat-Uploads.
- `kasse_transactions` → `UNIQUE (tenant_id, pos_system, business_date)`.
- `kasse_integrations` → `UNIQUE (tenant_id, pos_system)`.
- `export_log` → bedingte UNIQUE-Indexe für `pushed`-Status pro Beleg×Target bzw. Periode×Target.

### 4.5 Secret-Storage
- `users.discord_*_token_encrypted` und `kasse_integrations.{access,refresh}_token_encrypted` sind `BYTEA` und müssen mit `pgcrypto` AES-256-GCM verschlüsselt werden.
- Master-Key in `PP_PGCRYPTO_KEY` (env), niemals im Code.

### 4.6 Soft-Delete vs. Hard-Delete
- Tenants: Soft-Delete via `deletion_status` + `deleted_at` (DSGVO-Workflow, 30 Tage Grace-Period).
- Belege/Audit: niemals löschen (steuerliche Aufbewahrung 10 Jahre).
- Kasse-Transactions: niemals löschen.
- `audit_log`: vollständig append-only via Trigger.

---

## 5. Indexes — Übersicht

| Tabelle | Index | Query-Pfad |
|---|---|---|
| `tenants` | `idx_tenants_deletion_status` (partial) | Aktive Tenants auflisten |
| `tenants` | `idx_tenants_package` | Reporting / Provisionen |
| `users` | `idx_users_discord_id` (partial active) | Discord-OAuth-Login |
| `users` | `idx_users_active_role` (partial active) | Rollen-Filter |
| `auth_sessions` | `idx_auth_sessions_jti` | JWT-Revocation-Check |
| `auth_sessions` | `idx_auth_sessions_user` | „meine Sessions" |
| `auth_sessions` | `idx_auth_sessions_active` (partial) | aktive Sessions zählen |
| `belege` | `idx_belege_tenant_status` | „offene Belege" |
| `belege` | `idx_belege_tenant_received` | Neueste zuerst |
| `belege` | `idx_belege_tenant_docdate` (partial) | Monats-Reporting |
| `belege` | `idx_belege_review` (partial) | Operator-Queue |
| `belege` | `idx_belege_tenant_supplier` (partial) | Lieferanten-Filter |
| `kasse_integrations` | `idx_kasse_integrations_active` (partial) | Cron: aktive Integrations |
| `kasse_integrations` | `idx_kasse_integrations_pull_due` (partial) | Cron: nächste Pulls |
| `kasse_transactions` | `idx_kasse_transactions_tenant_date` | Monats-Übersicht |
| `kasse_transactions` | `idx_kasse_transactions_unexported` (partial) | Export-Queue |
| `export_log` | `idx_export_log_tenant_target` | „letzte Exports nach DATEV" |
| `export_log` | `idx_export_log_beleg` (partial) | Detail-Ansicht |
| `export_log` | `idx_export_log_failed` (partial) | Retry-Queue |
| `audit_log` | `idx_audit_log_tenant_time` | Tenant-Audit-View |
| `audit_log` | `idx_audit_log_entity` | „Was passierte mit diesem Beleg?" |
| `audit_log` | `idx_audit_log_event` | Globale Event-Suche |

---

## 6. Rollback

Aktuell **kein automatisierter Down-Pfad** — Greenfield. Bei Bedarf:

```bash
# Volle Rückkehr zum leeren Schema:
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

Pro-Migration-Down-Skripte werden nachgezogen, sobald die erste produktive
Datenbank existiert (siehe Task T011 Rollback-Plan im Backlog).

---

## 7. App-User-Rolle (Production-Setup) — ERZWUNGEN

Die Migrations werden als Postgres-Superuser ausgeführt (CREATE EXTENSION,
CREATE TABLE). Der Backend-App-Runtime muss aber mit einer Rolle laufen, die
**KEIN** Superuser ist und **KEIN** BYPASSRLS-Attribut hat — sonst greifen die
RLS-Policies nicht.

**Erzwungen durch:** `backend/src/core/db/role-check.ts`. Beim Backend-Start
in Production wird `pg_roles.rolsuper` + `rolbypassrls` für den aktuellen User
geprüft. Ist die Rolle privilegiert → der Prozess crasht mit klarer
Fehlermeldung. In Dev wird nur gewarnt.

**Setup-Skript** (idempotent, einmal pro Umgebung als Superuser/`gastro_owner`):

```bash
psql "$DATABASE_URL_OWNER" \
  -v app_password="'<starkes-passwort>'" \
  -f backend/scripts/setup-app-role.sql
```

Das Skript legt die Rolle an, vergibt Privileges auf bestehende Objekte und
konfiguriert `ALTER DEFAULT PRIVILEGES`, damit künftige Migrations-Tabellen
automatisch read+write für `gastro_app` haben.

In `.env` des Backends:

```
DATABASE_URL=postgres://gastro_app:<passwort>@db-host:5432/gastro_prod
DATABASE_URL_OWNER=postgres://gastro_owner:<passwort>@db-host:5432/gastro_prod
```

`DATABASE_URL_OWNER` ist nur für Migrations + DBA-Wartung, NIEMALS fürs
laufende Backend. In Dev/CI darf die Bequemlichkeit gewinnen (Backend läuft
mit dem Owner-Account) — der Startup-Check warnt dann, blockt aber nicht.

---

## 8. Konzept-Referenzen

- `Modulkonzept/Konzeptentwicklung/00_Architektur_Hauptdokument.md` § 9 (Multi-Tenancy, DSGVO)
- `Modulkonzept/Konzeptentwicklung/01_Datenmodell_Events.md` § 2 (Receipt), § 6 (DB-Auszug)
- `Modulkonzept/Konzeptentwicklung/modules/M01_Belegerfassung_OCR.md` (Belege)
- `Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` § 3 (users / auth_sessions / auth_audit_log)
- `Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md` § 3 (kasse_*)
- `Modulkonzept/Konzeptentwicklung/modules/M12_DSGVO.md` § 17–20 (Lösch-Workflow, GoBD-Doku)
