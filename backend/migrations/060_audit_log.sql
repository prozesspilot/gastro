-- 060_audit_log.sql
-- Cross-cutting GoBD-Audit-Log.
--
-- Pflicht laut Architektur-Doku § 9.2: Jeder Statuswechsel eines Belegs und
-- jedes sicherheitsrelevante Ereignis wird hier protokolliert. Auth-Events
-- haben ihre eigene Tabelle (auth_audit_log in 020_users_auth.sql) — diese
-- hier ist für Business-Events (Belege, Tenant-Settings-Änderungen,
-- DSGVO-Anträge, Hook-Aufrufe, Manuelle Korrekturen).
--
-- Wird NIEMALS gelöscht (gesetzliche Aufbewahrungspflicht). DSGVO-Auskunfts-
-- ersuchen können das Log einsehen, aber nicht modifizieren.

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,                       -- monoton steigende ID = unveränderliche Reihenfolge
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Welche Entität?
  entity_type     VARCHAR(40) NOT NULL,                        -- 'beleg' / 'tenant' / 'tenant_settings' / 'export' / 'kasse_transaction' / 'user' / 'dsgvo_request'
  entity_id       TEXT,                                        -- UUID-String, BIGINT-String, oder Magic-Link-Token

  -- Was ist passiert?
  event_type      VARCHAR(60) NOT NULL,                        -- 'beleg.status_changed' / 'beleg.corrected' / 'export.pushed' / 'tenant.cancelled' / ...

  -- Wer hat es ausgelöst?
  actor           JSONB NOT NULL,                              -- {"type":"user","id":"<uuid>"} oder {"type":"system","id":"module:M01"}

  -- State-Diff (für Beleg-Korrekturen, Settings-Änderungen)
  payload_before  JSONB,
  payload_after   JSONB,

  -- Frei nutzbare Metadaten (Trace-ID, n8n-Workflow-Execution-ID, ...)
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,

  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant_time ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_log_event ON audit_log (event_type, occurred_at DESC);

-- RLS: Mitarbeiter sehen nur Audit-Einträge des Tenants, in dessen Context
-- sie gerade arbeiten. Geschäftsführer haben Bypass via is_rls_bypassed().
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR SELECT
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id());

-- Schreibrecht für audit_log: nur Bypass-Sessions oder Sessions im richtigen
-- Tenant-Context. UPDATE/DELETE ist explizit verboten (außer Bypass) — der
-- Trigger unten erzwingt Immutabilität.
CREATE POLICY audit_log_tenant_insert ON audit_log
  FOR INSERT
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());

-- Immutabilität: UPDATE / DELETE wird blockiert (außer wenn bypass_rls=on,
-- für Wartungs-Skripte und DSGVO-Erasure mit triftigem Grund).
CREATE OR REPLACE FUNCTION audit_log_block_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_rls_bypassed() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_log is append-only (entity=%, id=%)',
    COALESCE(NEW.entity_type, OLD.entity_type),
    COALESCE(NEW.entity_id, OLD.entity_id);
END;
$$;

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutations();

CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutations();
