-- 127_tasks_rollback.sql
-- Rollback zu 127_tasks.sql (T080). Reihenfolge: Kind-Tabellen vor tasks
-- (FK-Abhängigkeiten). Trigger werden mit der Tabelle automatisch entfernt.
--
-- Anwenden (manuell, NICHT vom Migration-Runner):
--   psql "$DATABASE_URL" -f backend/migrations/127_tasks_rollback.sql
--   DELETE FROM schema_migrations WHERE version = '127_tasks.sql';

DROP TABLE IF EXISTS task_activity_log;
DROP TABLE IF EXISTS task_collaborators;
DROP TABLE IF EXISTS tasks;
