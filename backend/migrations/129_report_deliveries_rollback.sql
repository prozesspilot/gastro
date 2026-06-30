-- 129_report_deliveries_rollback.sql
-- Rollback zu 129_report_deliveries.sql (T089/M08).
--
-- Reihenfolge: erst die Tabelle (samt RLS-Policy/Trigger/Index via DROP TABLE),
-- dann die tenants-Spalte. advisor_email ist nullable und additiv — der Drop
-- ist verlustfrei für Bestandsdaten anderer Tabellen.

DROP TABLE IF EXISTS report_deliveries;

ALTER TABLE tenants DROP COLUMN IF EXISTS advisor_email;
