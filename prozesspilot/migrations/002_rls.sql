-- =============================================================================
-- D2 · Migration 002 — Row-Level Security (RLS)
--
-- Jede Applikations-Verbindung muss vor dem ersten Query setzen:
--   SET LOCAL app.current_tenant_id = '<uuid>';
--
-- Der withTenant()-Helper in src/core/db/tenant.ts übernimmt das automatisch.
--
-- Sicherheitsmodell:
--   - Alle tenant-isolierten Tabellen haben RLS aktiviert
--   - Policies lesen den Kontext aus der Session-Variable app.current_tenant_id
--   - Der DB-User 'pp' hat BYPASSRLS für Migrationen und Health-Checks
--   - In Production: separaten App-User OHNE BYPASSRLS verwenden
-- =============================================================================

-- =============================================================================
-- Hilfsfunktion: aktuellen Tenant aus Session-Variable lesen
-- =============================================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT nullif(current_setting('app.current_tenant_id', true), '')::UUID
$$;

-- =============================================================================
-- RLS aktivieren
-- =============================================================================
ALTER TABLE customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_inbox  ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- tenants: kein RLS — Tenant-Lookup muss ohne Kontext möglich sein
-- (z. B. beim Auflösen des Slugs / der API-Key-Validierung)

-- =============================================================================
-- Policies: Tenant-Isolation
-- Jede Policy erlaubt SELECT / INSERT / UPDATE / DELETE nur für Zeilen,
-- deren tenant_id mit der aktuellen Session-Variable übereinstimmt.
-- =============================================================================

-- customers
CREATE POLICY tenant_isolation ON customers
  AS PERMISSIVE
  FOR ALL
  USING      (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- document_inbox
CREATE POLICY tenant_isolation ON document_inbox
  AS PERMISSIVE
  FOR ALL
  USING      (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- routing_jobs
CREATE POLICY tenant_isolation ON routing_jobs
  AS PERMISSIVE
  FOR ALL
  USING      (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- audit_log
CREATE POLICY tenant_isolation ON audit_log
  AS PERMISSIVE
  FOR ALL
  USING      (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- =============================================================================
-- Dev-Hinweis: Migration-User 'pp' bekommt BYPASSRLS
-- In Production sollte ein separater App-User OHNE BYPASSRLS verwendet werden.
-- =============================================================================
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 90500 THEN
    -- Nur setzen, wenn der User existiert (kein Fehler in CI ohne lokalen User)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pp') THEN
      ALTER ROLE pp BYPASSRLS;
    END IF;
  END IF;
END
$$;
