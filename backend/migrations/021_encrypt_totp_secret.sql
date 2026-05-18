-- 021_encrypt_totp_secret.sql
-- TOTP-Secret wird ab jetzt verschlüsselt gespeichert (pgcrypto pgp_sym_encrypt).
-- Analog zu discord_access_token_encrypted in der users-Tabelle.
--
-- DECISION (Ausnahme zu CLAUDE.md §6.5 "Migrations rückwärts-kompatibel"):
-- Die Spalte emergency_totp_secret wird von VARCHAR(60) zu BYTEA konvertiert.
-- Bestehende Klartext-Werte werden NICHT migriert (System noch nicht in Production,
-- Pilot-Start KW22 2026). GFs müssen TOTP nach diesem Deploy neu einrichten via
-- bootstrap-admin-Skript.
--
-- Sicherheits-Maßnahme: Ein DO-Block warnt VOR dem DROP, falls bereits Werte
-- existieren — verhindert versehentlichen Datenverlust beim manuellen Replay.
--
-- Rollback: siehe 021_encrypt_totp_secret_rollback.sql

-- Warnung wenn vorhandene Klartext-TOTP-Secrets durch diese Migration zerstört werden
DO $$
DECLARE
  existing_count INTEGER;
BEGIN
  -- Spalte existiert nur beim ersten Lauf — bei Replay ist sie schon weg
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'emergency_totp_secret'
      AND data_type = 'character varying'
  ) THEN
    EXECUTE 'SELECT count(*) FROM users WHERE emergency_totp_secret IS NOT NULL'
      INTO existing_count;
    IF existing_count > 0 THEN
      RAISE WARNING
        'Migration 021 zerstört % bestehende Klartext-TOTP-Secrets. Geschäftsführer müssen Setup neu durchlaufen (npm run bootstrap-admin -- --force).',
        existing_count;
    END IF;
  END IF;
END $$;

-- Neue verschlüsselte Spalte als BYTEA hinzufügen
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_totp_secret_encrypted BYTEA;

-- Alte Klartext-Spalte entfernen (war VARCHAR(60))
ALTER TABLE users DROP COLUMN IF EXISTS emergency_totp_secret;

-- Neue Spalte auf den ursprünglichen Namen umbenennen
-- Spaltentyp ist jetzt BYTEA statt VARCHAR(60)
ALTER TABLE users RENAME COLUMN emergency_totp_secret_encrypted TO emergency_totp_secret;
