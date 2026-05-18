-- _rollback.sql
-- Manueller Rollback-Pfad für die T011-Foundation-Migrations.
--
-- Aufruf (Postgres-Superuser):
--   psql $DATABASE_URL -f backend/migrations/_rollback.sql
--
-- Effekt: Alle Tabellen, Functions, Trigger, Policies aus 001..060 werden
-- entfernt. Die `schema_migrations`-Tabelle wird ebenfalls geleert, damit
-- `npm run migrate` danach alles neu anwendet.
--
-- WARNUNG: Datenverlust. Nur in Dev/Test einsetzen.

BEGIN;

-- Reihenfolge: Kinder zuerst (FK-Referenzen)
DROP TABLE IF EXISTS audit_log              CASCADE;
DROP TABLE IF EXISTS export_log             CASCADE;
DROP TABLE IF EXISTS kasse_transactions     CASCADE;
DROP TABLE IF EXISTS kasse_integrations     CASCADE;
DROP TABLE IF EXISTS belege                 CASCADE;
DROP TABLE IF EXISTS auth_audit_log         CASCADE;
DROP TABLE IF EXISTS auth_sessions          CASCADE;
DROP TABLE IF EXISTS users                  CASCADE;
DROP TABLE IF EXISTS tenant_settings        CASCADE;
DROP TABLE IF EXISTS tenants                CASCADE;

-- Helper-Functions
DROP FUNCTION IF EXISTS audit_log_block_mutations() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at()            CASCADE;
DROP FUNCTION IF EXISTS current_tenant_id()         CASCADE;
DROP FUNCTION IF EXISTS is_rls_bypassed()           CASCADE;

-- Migrations-Tracking zurücksetzen
DROP TABLE IF EXISTS schema_migrations      CASCADE;

-- Extensions bleiben absichtlich erhalten — sie sind harmlos und werden von
-- anderen Migrations / DBs ggf. mitgenutzt. Bei Bedarf manuell entfernen:
--   DROP EXTENSION IF EXISTS pgcrypto;
--   DROP EXTENSION IF EXISTS citext;
--   DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;
