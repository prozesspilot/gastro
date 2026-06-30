-- Rollback 130_tenant_exists_fn.sql
DROP FUNCTION IF EXISTS tenant_exists(uuid);
