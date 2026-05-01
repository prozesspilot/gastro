-- =============================================================================
-- Migration 014 — Audit-Log: Entity-Spalten ergänzen
--
-- Migration 001 legte audit_log mit (actor, action, resource, payload) an.
-- Diese Migration fügt entity_type + entity_id (statt resource) hinzu, damit
-- ein dedizierter audit.log()-Service strukturiert schreiben kann.
-- =============================================================================

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id   TEXT;

-- Default für actor lockern, damit der neue Service NULL setzen kann
ALTER TABLE audit_log
  ALTER COLUMN actor DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
