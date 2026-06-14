-- 120_lexoffice_category_map_rollback.sql
-- Rollback fuer 120_lexoffice_category_map.sql.
-- DROP TABLE entfernt automatisch auch Policies und Trigger.

DROP TABLE IF EXISTS lexoffice_category_map;
