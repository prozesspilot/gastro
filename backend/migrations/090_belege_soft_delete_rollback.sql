-- Rollback fuer 090_belege_soft_delete.sql
DROP INDEX IF EXISTS idx_belege_tenant_active;
ALTER TABLE belege DROP COLUMN IF EXISTS deleted_at;
