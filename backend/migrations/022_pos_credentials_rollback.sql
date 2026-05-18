-- 022_pos_credentials_rollback.sql
-- Rollback für 022_pos_credentials.sql
--
-- Entfernt Tabelle pos_credentials vollständig (inkl. Trigger, Indexes, Policies).
-- ACHTUNG: Löscht alle gespeicherten POS-OAuth-Credentials — NICHT in Production
-- ohne vorherige Datensicherung ausführen.

DROP TABLE IF EXISTS pos_credentials CASCADE;
