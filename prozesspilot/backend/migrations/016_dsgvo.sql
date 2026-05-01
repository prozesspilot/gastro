-- Migration 016: DSGVO-Compliance (Task 504)
-- Artikel 17: Recht auf Vergessenwerden

CREATE TABLE IF NOT EXISTS deletion_requests (
  request_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  customer_id   TEXT,           -- NULL wenn ganzer Tenant geloescht werden soll
  tenant_id     TEXT NOT NULL,
  requested_by  TEXT,           -- E-Mail oder User-ID
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  processed_at  TIMESTAMPTZ,
  deleted_tables JSONB,         -- {"receipts": 42, "communications": 5, ...}
  error_message  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_tenant ON deletion_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_customer ON deletion_requests(customer_id);
