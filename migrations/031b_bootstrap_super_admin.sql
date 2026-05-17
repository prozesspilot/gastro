-- =============================================================================
-- Migration 031b — Bootstrap super_admin
-- Idempotent: legt einen super_admin nur an, wenn noch keiner existiert.
-- Der Hash wird NICHT in dieser Migration erzeugt (kein SQL-argon2). Statt-
-- dessen liefert das Bootstrap-CLI `npm run bootstrap:super-admin` den Hash
-- und fügt ihn per INSERT direkt ein. Diese Migration legt nur die Marker-
-- Spalten an und stellt sicher, dass die Tabelle existiert.
-- =============================================================================

-- Marker-Spalte, damit Bootstrap-CLI prüfen kann ob ein super_admin existiert
-- ohne Permissions-Array parsen zu müssen.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN
    GENERATED ALWAYS AS (tenant_id IS NULL) STORED;

CREATE INDEX IF NOT EXISTS idx_users_super_admin
    ON users (is_super_admin) WHERE is_super_admin = true;
