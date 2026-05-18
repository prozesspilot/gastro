-- 021_encrypt_totp_secret.sql
-- TOTP-Secret wird ab jetzt verschlüsselt gespeichert (pgcrypto pgp_sym_encrypt).
-- Analog zu discord_access_token_encrypted in der users-Tabelle.
--
-- DECISION: Die Spalte emergency_totp_secret wird von VARCHAR(60) zu BYTEA konvertiert.
-- Bestehende Klartext-Werte werden NICHT migriert (System noch nicht in Production,
-- Pilot-Start KW22 2026). GFs müssen TOTP nach diesem Deploy neu einrichten via
-- bootstrap-admin-Skript.
--
-- Rollback: siehe 021_encrypt_totp_secret_rollback.sql

-- Neue verschlüsselte Spalte als BYTEA hinzufügen
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_totp_secret_encrypted BYTEA;

-- Alte Klartext-Spalte entfernen (war VARCHAR(60))
ALTER TABLE users DROP COLUMN IF EXISTS emergency_totp_secret;

-- Neue Spalte auf den ursprünglichen Namen umbenennen
-- Spaltentyp ist jetzt BYTEA statt VARCHAR(60)
ALTER TABLE users RENAME COLUMN emergency_totp_secret_encrypted TO emergency_totp_secret;
