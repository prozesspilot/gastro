-- 120_tasks_rollback.sql
-- Rollback für 120_tasks.sql
--
-- Achtung: Löscht ALLE Tasks, Kollaboratoren und Aktivitäts-Logs unwiderruflich.
-- Nur in Dev/Staging ausführen — niemals in Prod ohne explizite Genehmigung.

DROP TABLE IF EXISTS task_activity_log CASCADE;
DROP TABLE IF EXISTS task_collaborators CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;

DROP FUNCTION IF EXISTS task_activity_log_set_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS task_collaborators_set_tenant_id() CASCADE;
