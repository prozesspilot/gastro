-- 131_create_tenant_fn_rollback.sql
-- Rollback zu 131_create_tenant_fn.sql — entfernt die Tenant-Anlage-Funktion.
DROP FUNCTION IF EXISTS create_tenant_for_staff(text, text, text, text, text, text);
