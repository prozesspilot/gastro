-- 121_pos_cron_security_definer_fns_rollback.sql
-- Rollback fuer Migration 121_pos_cron_security_definer_fns.sql

DROP FUNCTION IF EXISTS get_active_sumup_tenants();
DROP FUNCTION IF EXISTS delete_inactive_pos_credentials(int);
