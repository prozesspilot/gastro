-- 120_invoices_rollback.sql
-- Rollback für 120_invoices.sql

DROP TABLE IF EXISTS invoices CASCADE;
DROP SEQUENCE IF EXISTS invoices_number_seq;
