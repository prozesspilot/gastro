-- 021_encrypt_totp_secret_rollback.sql
-- Rollback für 021_encrypt_totp_secret.sql
--
-- Stellt die ursprüngliche VARCHAR(60)-Spalte wieder her.
-- ACHTUNG: Dabei gehen alle gespeicherten (verschlüsselten) TOTP-Secrets verloren.
-- GFs müssen nach dem Rollback TOTP erneut einrichten.

-- BYTEA-Spalte durch VARCHAR(60) ersetzen
ALTER TABLE users DROP COLUMN IF EXISTS emergency_totp_secret;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_totp_secret VARCHAR(60);
