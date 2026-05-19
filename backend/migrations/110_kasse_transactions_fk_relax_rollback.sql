-- Rollback fuer 110_kasse_transactions_fk_relax.sql
-- WARNUNG: dieser Rollback failt wenn bereits kasse_transactions-Rows mit
-- integration_id=NULL existieren (T005 schreibt diese).
ALTER TABLE kasse_transactions ALTER COLUMN integration_id SET NOT NULL;
