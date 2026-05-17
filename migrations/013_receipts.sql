-- =============================================================================
-- Migration 013 — Receipts-Tabelle (neu aufgebaut)
--
-- 010_m10_minimal.sql hat bereits eine minimale receipts-Tabelle angelegt
-- (receipt_id TEXT PK, kein tenant_id). Diese Migration ersetzt sie durch
-- das vollständige Schema mit UUID, tenant_id, source, metadata etc.
-- =============================================================================

-- Alte Stub-Tabelle aus 010 entfernen (kein Produktiv-Daten in Dev)
DROP TABLE IF EXISTS receipts CASCADE;

-- Vollständige Receipts-Tabelle
CREATE TABLE receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'error')),

  original_name   TEXT,
  mime_type       TEXT,
  storage_key     TEXT,
  file_size_bytes BIGINT,

  source          TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'whatsapp', 'email')),

  metadata        JSONB NOT NULL DEFAULT '{}',
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipts_tenant   ON receipts (tenant_id, created_at DESC);
CREATE INDEX idx_receipts_customer ON receipts (customer_id, created_at DESC);
CREATE INDEX idx_receipts_status   ON receipts (tenant_id, status);

CREATE OR REPLACE TRIGGER tg_receipts_updated_at
  BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
